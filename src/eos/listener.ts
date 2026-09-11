import { EventEmitter } from "node:events";
import { Server } from "node-osc";
import type { ServerConfig } from "../config.js";
import { createInitialState, type EosState, type FaderBankState } from "./state.js";

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
    this.state.lastMessageAt = new Date().toISOString();
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

  private faderBank(bank: string): FaderBankState {
    const existing = this.state.faderBanks[bank];
    if (existing) return existing;
    const created: FaderBankState = { levels: {}, labels: {} };
    this.state.faderBanks[bank] = created;
    return created;
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

    const activeCueMatch = address.match(/^\/eos\/out\/active\/cue\/(\d+)\/(.+)$/);
    if (activeCueMatch && typeof args[0] === "number") {
      this.state.activeCue.cueList = Number(activeCueMatch[1]);
      this.state.activeCue.cue = activeCueMatch[2];
      this.state.activeCue.percent = args[0];
    }

    if (address === "/eos/out/active/chan") {
      this.state.activeChannels = String(args[0] ?? "");
    }

    if (address === "/eos/out/pending/cue/text") {
      this.state.pendingCue.text = String(args[0] ?? "");
    }

    if (address.startsWith("/eos/out/pending/cue")) {
      this.state.pendingCue.entries[address] = args;
    }

    const faderLevelMatch = address.match(/^\/eos\/out\/fader\/(\d+)\/(\d+)$/);
    if (faderLevelMatch && typeof args[0] === "number") {
      const bank = this.faderBank(faderLevelMatch[1]);
      bank.levels[faderLevelMatch[2]] = args[0];
    }

    const faderLabelMatch = address.match(/^\/eos\/out\/fader\/(\d+)\/(\d+)\/name$/);
    if (faderLabelMatch && typeof args[0] === "string") {
      const bank = this.faderBank(faderLabelMatch[1]);
      bank.labels[faderLabelMatch[2]] = args[0];
    }

    const faderPageMatch = address.match(/^\/eos\/out\/fader\/(\d+)$/);
    if (faderPageMatch && typeof args[0] === "string") {
      const bank = this.faderBank(faderPageMatch[1]);
      bank.page = args[0];
    }

    const cueListMatch = address.match(/^\/eos\/out\/cuelist\/(\d+)/);
    if (cueListMatch) {
      this.state.cueListBanks[cueListMatch[1]] = { address, args };
    }

    const dsMatch = address.match(/^\/eos\/out\/ds\/(\d+)/);
    if (dsMatch) {
      this.state.directSelectBanks[dsMatch[1]] = { address, args };
    }
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
