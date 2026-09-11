import { EventEmitter } from "node:events";
import { Server } from "node-osc";
import type { ServerConfig } from "../config.js";
import { createInitialState, type EosState } from "./state.js";
import {
  cueKey,
  cueListKey,
  groupKey,
  paletteKey,
  parseActiveChannelText,
  parseBaseRecordTarget,
  parseOscNumberList,
  patchKey,
  presetKey,
} from "./show-types.js";

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
      const channel = Number(args[0]);
      const text = String(args[1] ?? args[0] ?? "");
      if (typeof args[0] === "number" && args[1] !== undefined) {
        const parsed = parseActiveChannelText(text);
        const entry = {
          channel,
          ...parsed,
          text,
        };
        const existing = this.state.activeChannelLevels.filter((c) => c.channel !== channel);
        this.state.activeChannelLevels = [...existing, entry];
        this.state.activeChannels = existing
          .map((c) => `${c.channel}: [${c.level ?? "?"}]`)
          .concat(`${channel}: [${parsed.level ?? "?"}]`)
          .join(", ");
      } else {
        this.state.activeChannels = text;
      }
    }

    if (address === "/eos/out/pending/cue/text") {
      this.state.pendingCue.text = String(args[0] ?? "");
    }

    const pendingCueMatch = address.match(/^\/eos\/out\/pending\/cue\/([^/]+)\/([^/]+)$/);
    if (pendingCueMatch) {
      const cueList = Number(pendingCueMatch[1]);
      const cue = pendingCueMatch[2];
      this.state.pendingCue.cueList = cueList;
      this.state.pendingCue.cue = cue;
      const listKey = String(cueList);
      const pending: (typeof this.state.pendingCue) = {
        cueList,
        cue,
        text: this.state.pendingCue.text,
        raw: { address, args },
      };
      const existing = this.state.pendingByCueList[listKey] ?? [];
      this.state.pendingByCueList[listKey] = [
        ...existing.filter((p) => p.cue !== cue),
        pending,
      ];
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

    if (address.startsWith("/eos/out/cuelist/") && !address.includes("/get/")) {
      this.state.cueListBanks[address] = args;
    }

    this.updateShowDataFromGet(address, args);
  }

  private updateShowDataFromGet(address: string, args: unknown[]): void {
    const groupListMatch = address.match(/^\/eos\/out\/get\/group\/(\d+)\/list\/0$/);
    if (groupListMatch) {
      const number = Number(groupListMatch[1]);
      const base = parseBaseRecordTarget(args);
      const existing = this.state.groups[groupKey(number)] ?? { number };
      this.state.groups[groupKey(number)] = {
        ...existing,
        ...base,
        raw: args,
      };
      return;
    }

    const groupChannelsMatch = address.match(
      /^\/eos\/out\/get\/group\/(\d+)\/channels\/list\/0$/
    );
    if (groupChannelsMatch) {
      const number = Number(groupChannelsMatch[1]);
      const existing = this.state.groups[groupKey(number)] ?? { number };
      this.state.groups[groupKey(number)] = {
        ...existing,
        channels: parseOscNumberList(args),
        raw: existing.raw ? [existing.raw, args] : args,
      };
      return;
    }

    const cueListMatch = address.match(/^\/eos\/out\/get\/cuelist\/(\d+)\/list\/0$/);
    if (cueListMatch) {
      const number = Number(cueListMatch[1]);
      const base = parseBaseRecordTarget(args);
      const existing = this.state.cueLists[cueListKey(number)] ?? { number };
      this.state.cueLists[cueListKey(number)] = {
        ...existing,
        ...base,
        playbackMode: args[3] !== undefined ? String(args[3]) : existing.playbackMode,
        faderMode: args[4] !== undefined ? String(args[4]) : existing.faderMode,
        raw: args,
      };
      return;
    }

    const cueListLinkedMatch = address.match(/^\/eos\/out\/get\/cuelist\/(\d+)\/linked\/list\/0$/);
    if (cueListLinkedMatch) {
      const number = Number(cueListLinkedMatch[1]);
      const existing = this.state.cueLists[cueListKey(number)] ?? { number };
      this.state.cueLists[cueListKey(number)] = {
        ...existing,
        linkedCueLists: parseOscNumberList(args),
      };
      return;
    }

    const cueMatch = address.match(/^\/eos\/out\/get\/cue\/(\d+)\/([^/]+)\/0\/list\/0$/);
    if (cueMatch) {
      const cueList = Number(cueMatch[1]);
      const cueNumber = cueMatch[2];
      const base = parseBaseRecordTarget(args);
      this.state.cues[cueKey(cueList, cueNumber)] = {
        cueList,
        number: cueNumber,
        uid: base.uid,
        label: base.label,
        upTimeDurationMs: typeof args[3] === "number" ? args[3] : undefined,
        upTimeDelayMs: typeof args[4] === "number" ? args[4] : undefined,
        downTimeDurationMs: typeof args[5] === "number" && args[5] >= 0 ? args[5] : undefined,
        downTimeDelayMs: typeof args[6] === "number" && args[6] >= 0 ? args[6] : undefined,
        focusTimeDurationMs: typeof args[7] === "number" && args[7] >= 0 ? args[7] : undefined,
        colorTimeDurationMs: typeof args[8] === "number" && args[8] >= 0 ? args[8] : undefined,
        beamTimeDurationMs: typeof args[9] === "number" && args[9] >= 0 ? args[9] : undefined,
        blocked: typeof args[13] === "boolean" ? args[13] : undefined,
        followHang: args[14] !== undefined ? String(args[14]) : undefined,
        partCount: typeof args[26] === "number" ? args[26] : undefined,
        notes: args[27] !== undefined ? String(args[27]) : undefined,
        scene: args[28] !== undefined ? String(args[28]) : undefined,
        raw: args,
      };
      return;
    }

    const patchMatch = address.match(/^\/eos\/out\/get\/patch\/(\d+)\/(\d+)\/list\/0$/);
    if (patchMatch) {
      const channel = Number(patchMatch[1]);
      const part = Number(patchMatch[2]);
      const base = parseBaseRecordTarget(args);
      this.state.patch[patchKey(channel, part)] = {
        channel,
        part,
        uid: base.uid,
        label: base.label,
        manufacturer: args[3] !== undefined ? String(args[3]) : undefined,
        fixtureType: args[4] !== undefined ? String(args[4]) : undefined,
        address: typeof args[5] === "number" ? args[5] : undefined,
        intensityAddress: typeof args[6] === "number" ? args[6] : undefined,
        currentLevel: typeof args[7] === "number" ? args[7] : undefined,
        gel: args[8] !== undefined ? String(args[8]) : undefined,
        endAddress: typeof args[19] === "number" ? args[19] : undefined,
        raw: args,
      };
      return;
    }

    const presetMatch = address.match(/^\/eos\/out\/get\/preset\/(\d+)\/list\/0$/);
    if (presetMatch) {
      const number = Number(presetMatch[1]);
      const base = parseBaseRecordTarget(args);
      this.state.presets[presetKey(number)] = {
        number,
        uid: base.uid,
        label: base.label,
        raw: args,
      };
      return;
    }

    const paletteMatch = address.match(/^\/eos\/out\/get\/(ip|fp|cp|bp)\/(\d+)\/list\/0$/);
    if (paletteMatch) {
      const type = paletteMatch[1] as "ip" | "fp" | "cp" | "bp";
      const number = Number(paletteMatch[2]);
      const base = parseBaseRecordTarget(args);
      this.state.palettes[paletteKey(type, number)] = {
        type,
        number,
        uid: base.uid,
        label: base.label,
        raw: args,
      };
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
