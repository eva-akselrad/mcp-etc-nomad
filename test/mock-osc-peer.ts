import { Client, Server } from "node-osc";
import type { RecordedOscMessage } from "./recording-client.js";

export interface MockOscPeerOptions {
  txPort: number;
  rxHost?: string;
  rxPort: number;
  /** Console mode echoed on /eos/out/event/state (0=blind, 1=live). */
  consoleMode?: 0 | 1;
}

/**
 * Minimal Eos OSC peer (PLAN §11.1): listens on the TX port, captures inbound
 * `/eos/...` packets, and sends canned `/eos/out/*` replies to the MCP listener.
 */
export class MockOscPeer {
  readonly received: RecordedOscMessage[] = [];
  private server: Server | null = null;
  private readonly replyClient: Client;
  private consoleMode: 0 | 1;
  private faderBankConfigured = new Set<string>();
  private cueListBankConfigured = new Set<number>();
  private dsBankConfigured = new Set<number>();
  private readonly groups = [
    { number: 1, uid: "grp-1", label: "Wash", channels: [1, 2, 3, 4, 5] },
    { number: 2, uid: "grp-2", label: "Backlight", channels: [10, 11, 12] },
  ];
  private readonly cueLists = [{ number: 1, uid: "cl-1", label: "Main" }];
  private readonly presets = [{ number: 1, uid: "pre-1", label: "Default" }];
  private readonly palettes = {
    ip: [{ number: 1, uid: "ip-1", label: "Full" }],
    cp: [{ number: 2, uid: "cp-2", label: "Blue" }],
  } as const;
  private readonly cues = [
    { cueList: 1, number: "1", uid: "cue-1", label: "House Full" },
    { cueList: 1, number: "5", uid: "cue-5", label: "Scene 5" },
  ];

  constructor(private readonly options: MockOscPeerOptions) {
    this.consoleMode = options.consoleMode ?? 0;
    this.replyClient = new Client(options.rxHost ?? "127.0.0.1", options.rxPort);
  }

  start(): void {
    if (this.server) return;
    this.server = new Server(this.options.txPort, "127.0.0.1");
    this.server.on("message", (msg: unknown[]) => {
      const [address, ...args] = msg as [string, ...unknown[]];
      if (typeof address !== "string") return;
      this.received.push({ address, args: [...args] });
      void this.respond(address, args);
    });
  }

  setConsoleMode(mode: 0 | 1): void {
    this.consoleMode = mode;
  }

  private async respond(address: string, args: unknown[]): Promise<void> {
    await this.replyClient.send("/eos/out/event/state", this.consoleMode);

    if (address === "/eos/cmd" || address === "/eos/newcmd" || address === "/eos/event") {
      if (args[0] !== undefined) {
        await this.replyClient.send("/eos/out/cmd", String(args[0]));
      }
    }

    const cueFireMatch = address.match(/^\/eos\/cue\/(\d+)\/([^/]+)\/fire$/);
    if (cueFireMatch) {
      const [, list, cue] = cueFireMatch;
      await this.replyClient.send("/eos/out/active/cue/text", `Cue ${list}/${cue}`);
      await this.replyClient.send(`/eos/out/active/cue/${list}/${cue}`, 1.0);
    }

    const faderConfig = address.match(/^\/eos\/fader\/(\d+)\/config\//);
    if (faderConfig) {
      const bank = faderConfig[1];
      this.faderBankConfigured.add(bank);
      const count = Number(address.split("/").pop());
      for (let i = 1; i <= Math.min(count, 3); i++) {
        await this.replyClient.send(`/eos/out/fader/${bank}/${i}/name`, `Fader ${i}`);
      }
      return;
    }

    const faderLevel = address.match(/^\/eos\/fader\/(\d+)\/(\d+)$/);
    if (faderLevel && args.length > 0 && typeof args[0] === "number") {
      const [, bank, fader] = faderLevel;
      if (!this.faderBankConfigured.has(bank)) {
        return;
      }
      // Eos delays fader echo ~3s; tests assert TX only unless they wait explicitly.
      return;
    }

    const cueListConfig = address.match(/^\/eos\/cuelist\/(\d+)\/config\//);
    if (cueListConfig) {
      this.cueListBankConfigured.add(Number(cueListConfig[1]));
      await this.replyClient.send(`/eos/out/cuelist/${cueListConfig[1]}/1`, "Cue 1");
      return;
    }

    const dsCreate = address.match(/^\/eos\/ds\/(\d+)\//);
    if (dsCreate) {
      this.dsBankConfigured.add(Number(dsCreate[1]));
      await this.replyClient.send(`/eos/out/ds/${dsCreate[1]}/1`, "Channel 1");
      return;
    }

    if (address === "/eos/get/group/count") {
      await this.replyClient.send("/eos/out/get/group/count", this.groups.length);
      return;
    }

    if (address === "/eos/get/group/index" && args.length > 0) {
      const group = this.groups[Number(args[0])];
      if (!group) return;
      await this.replyClient.send(
        `/eos/out/get/group/${group.number}/list/0`,
        0,
        group.uid,
        group.label
      );
      await this.replyClient.send(
        `/eos/out/get/group/${group.number}/channels/list/0`,
        0,
        group.uid,
        ...group.channels
      );
      return;
    }

    if (address === "/eos/get/cuelist/count") {
      await this.replyClient.send("/eos/out/get/cuelist/count", this.cueLists.length);
      return;
    }

    if (address === "/eos/get/cuelist/index" && args.length > 0) {
      const list = this.cueLists[Number(args[0])];
      if (!list) return;
      await this.replyClient.send(
        `/eos/out/get/cuelist/${list.number}/list/0`,
        0,
        list.uid,
        list.label,
        "default",
        "fader"
      );
      await this.replyClient.send(`/eos/out/get/cuelist/${list.number}/links/list/0`, 0, list.uid);
      return;
    }

    const cueCount = address.match(/^\/eos\/get\/cue\/(\d+)\/noparts\/count$/);
    if (cueCount) {
      const list = Number(cueCount[1]);
      const count = this.cues.filter((c) => c.cueList === list).length;
      await this.replyClient.send(`/eos/out/get/cue/${list}/noparts/count`, count);
      return;
    }

    const cueIndex = address.match(/^\/eos\/get\/cue\/(\d+)\/noparts\/index$/);
    if (cueIndex && args.length > 0) {
      const list = Number(cueIndex[1]);
      const index = Number(args[0]);
      const cue = this.cues.filter((c) => c.cueList === list)[index];
      if (!cue) return;
      await this.replyClient.send(
        `/eos/out/get/cue/${list}/${cue.number}/0/list/0`,
        0,
        cue.uid,
        cue.label,
        3000,
        0
      );
      return;
    }

    if (address === "/eos/subscribe") {
      return;
    }

    if (address === "/eos/get/preset/count") {
      await this.replyClient.send("/eos/out/get/preset/count", this.presets.length);
      return;
    }

    if (address === "/eos/get/preset/index" && args.length > 0) {
      const preset = this.presets[Number(args[0])];
      if (!preset) return;
      await this.replyClient.send(
        `/eos/out/get/preset/${preset.number}/list/0`,
        0,
        preset.uid,
        preset.label
      );
      return;
    }

    for (const type of ["ip", "cp"] as const) {
      if (address === `/eos/get/${type}/count`) {
        await this.replyClient.send(`/eos/out/get/${type}/count`, this.palettes[type].length);
        return;
      }
      if (address === `/eos/get/${type}/index` && args.length > 0) {
        const palette = this.palettes[type][Number(args[0])];
        if (!palette) return;
        await this.replyClient.send(
          `/eos/out/get/${type}/${palette.number}/list/0`,
          0,
          palette.uid,
          palette.label
        );
        return;
      }
    }
  }

  isFaderBankConfigured(bank: number | string): boolean {
    return this.faderBankConfigured.has(String(bank));
  }

  isCueListBankConfigured(bank: number): boolean {
    return this.cueListBankConfigured.has(bank);
  }

  isDsBankConfigured(bank: number): boolean {
    return this.dsBankConfigured.has(bank);
  }

  async close(): Promise<void> {
    await this.replyClient.close();
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = null;
  }
}
