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
