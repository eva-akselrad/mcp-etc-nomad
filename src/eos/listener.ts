import { EventEmitter } from "node:events";
import { Server } from "node-osc";
import type { ServerConfig } from "../config.js";
import { createInitialState, type EosState } from "./state.js";

export interface OscMessage {
  address: string;
  args: unknown[];
}

type Waiter = {
  pattern: RegExp;
  resolve: (message: OscMessage) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class EosListener extends EventEmitter {
  private server: Server | null = null;
  private readonly config: ServerConfig;
  private state: EosState = createInitialState();
  private waiters: Waiter[] = [];

  constructor(config: ServerConfig) {
    super();
    this.config = config;
  }

  getState(): EosState {
    return this.state;
  }

  start(): void {
    if (this.server) return;
    this.server = new Server(this.config.portRx, this.config.rxBind);
    this.server.on("message", (msg: unknown[]) => {
      const [address, ...args] = msg as [string, ...unknown[]];
      if (typeof address !== "string") return;
      this.handleMessage({ address, args });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = null;
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("OSC listener stopped"));
    }
    this.waiters = [];
  }

  waitFor(addressPattern: string | RegExp, timeoutMs = 3000): Promise<OscMessage> {
    const pattern =
      typeof addressPattern === "string"
        ? new RegExp(`^${escapeRegex(addressPattern)}$`)
        : addressPattern;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error(`Timed out waiting for OSC ${pattern}`));
      }, timeoutMs);

      this.waiters.push({ pattern, resolve, reject, timer });
    });
  }

  private handleMessage(message: OscMessage): void {
    this.state.connected = true;
    const now = new Date().toISOString();
    this.state.lastMessageAt = now;
    this.state.lastSyncedAt = now;
    this.updateState(message);
    this.emit("message", message);

    this.waiters = this.waiters.filter((waiter) => {
      if (!waiter.pattern.test(message.address)) {
        return true;
      }
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return false;
    });
  }

  private updateState(message: OscMessage): void {
    const { address, args } = message;

    if (address === "/eos/out/event/state") {
      const mode = Number(args[0]);
      this.state.consoleMode = mode === 0 ? "blind" : mode === 1 ? "live" : "unknown";
    }

    if (address === "/eos/out/user") {
      this.state.oscUserId = Number(args[0]);
    }

    if (address === "/eos/out/cmd") {
      this.state.commandLine = String(args[0] ?? "");
    }

    if (address === "/eos/out/active/cue/text") {
      this.state.activeCue.text = String(args[0] ?? "");
    }

    if (address === "/eos/out/active/cue") {
      this.state.activeCue.percent = Number(args[0]);
    }

    const activeCueMatch = address.match(/^\/eos\/out\/active\/cue\/([^/]+)\/([^/]+)$/);
    if (activeCueMatch) {
      this.state.activeCue.cueList = Number(activeCueMatch[1]);
      this.state.activeCue.cue = activeCueMatch[2];
      if (typeof args[0] === "number") {
        this.state.activeCue.percent = args[0];
      }
    }

    if (address === "/eos/out/active/chan") {
      this.state.activeChannels = String(args[0] ?? "");
    }

    if (address === "/eos/out/pending/cue/text") {
      this.state.pendingCue.text = String(args[0] ?? "");
    }

    const pendingCueMatch = address.match(/^\/eos\/out\/pending\/cue\/([^/]+)\/([^/]+)$/);
    if (pendingCueMatch) {
      this.state.pendingCue.cueList = Number(pendingCueMatch[1]);
      this.state.pendingCue.cue = pendingCueMatch[2];
    }

    if (address.startsWith("/eos/out/pending/cue")) {
      this.state.pendingCues[address] = args;
      this.state.pendingCue.raw = { ...this.state.pendingCue.raw, [address]: args };
    }

    const faderNameMatch = address.match(/^\/eos\/out\/fader\/(\d+)\/(\d+)\/name$/);
    if (faderNameMatch) {
      const key = `${faderNameMatch[1]}/${faderNameMatch[2]}`;
      const label = String(args[0] ?? "");
      this.state.faderLabels[key] = label;
      this.upsertFader(Number(faderNameMatch[1]), Number(faderNameMatch[2]), { label });
    }

    const faderMatch = address.match(/^\/eos\/out\/fader\/(\d+)\/(\d+)$/);
    if (faderMatch) {
      const key = `${faderMatch[1]}/${faderMatch[2]}`;
      if (typeof args[0] === "number") {
        this.state.faderLevels[key] = args[0];
        this.upsertFader(Number(faderMatch[1]), Number(faderMatch[2]), { level: args[0] });
      } else if (typeof args[0] === "string") {
        this.state.faderLabels[key] = args[0];
        this.upsertFader(Number(faderMatch[1]), Number(faderMatch[2]), { label: args[0] });
      }
    }

    const dsBankMatch = address.match(/^\/eos\/out\/ds\/(\d+)$/);
    if (dsBankMatch) {
      this.state.directSelects[dsBankMatch[1]] = {
        bank: Number(dsBankMatch[1]),
        label: String(args[0] ?? ""),
      };
    }

    const dsButtonMatch = address.match(/^\/eos\/out\/ds\/(\d+)\/(\d+)$/);
    if (dsButtonMatch) {
      const key = `${dsButtonMatch[1]}/${dsButtonMatch[2]}`;
      this.state.directSelects[key] = {
        bank: Number(dsButtonMatch[1]),
        index: Number(dsButtonMatch[2]),
        label: String(args[0] ?? ""),
      };
    }

    if (address.startsWith("/eos/out/cuelist/")) {
      this.state.cueListBanks[address] = args;
    }
  }

  private upsertFader(bank: number, index: number, patch: { level?: number; label?: string }): void {
    const key = `${bank}/${index}`;
    const existing = this.state.faders[key] ?? { bank, index };
    this.state.faders[key] = { ...existing, ...patch };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
