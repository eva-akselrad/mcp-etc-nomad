import type { ServerConfig } from "../src/config.js";
import { withUserPrefix } from "../src/eos/addresses.js";

export interface RecordedOscMessage {
  address: string;
  args: unknown[];
}

/** Captures OSC TX without sending UDP — used by unit tests. */
export class RecordingEosClient {
  readonly sent: RecordedOscMessage[] = [];

  constructor(private readonly config: ServerConfig) {}

  async send(address: string, ...args: unknown[]): Promise<void> {
    const resolved = withUserPrefix(this.config, address);
    this.sent.push({ address: resolved, args: [...args] });
  }

  async sendCommand(path: "/eos/cmd" | "/eos/newcmd" | "/eos/event", text: string): Promise<void> {
    await this.send(path, text);
  }

  async close(): Promise<void> {}

  clear(): void {
    this.sent.length = 0;
  }
}
