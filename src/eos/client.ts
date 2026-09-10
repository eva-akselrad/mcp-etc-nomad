import { appendFile } from "node:fs/promises";
import { Client } from "node-osc";
import type { ServerConfig } from "../config.js";
import { withUserPrefix } from "./addresses.js";

export class EosClient {
  private client: Client;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    const port = config.protocol === "tcp" ? config.tcpPort : config.portTx;
    this.client = new Client(config.host, port);
  }

  async send(address: string, ...args: unknown[]): Promise<void> {
    const resolved = withUserPrefix(this.config, address);
    await this.client.send(resolved, ...args);
    await this.audit(`SEND ${resolved} ${args.map(formatArg).join(" ")}`.trim());
  }

  async sendCommand(path: "/eos/cmd" | "/eos/newcmd" | "/eos/event", text: string): Promise<void> {
    await this.send(path, text);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private async audit(line: string): Promise<void> {
    if (!this.config.auditLogPath) return;
    const entry = `${new Date().toISOString()} ${line}\n`;
    await appendFile(this.config.auditLogPath, entry, "utf8");
  }
}

function formatArg(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}
