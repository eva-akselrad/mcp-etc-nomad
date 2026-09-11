import { appendFile } from "node:fs/promises";
import { Client } from "node-osc";
import type { ServerConfig } from "../config.js";
import { withUserPrefix } from "./addresses.js";
import type { EosTcpLink } from "./tcp-link.js";

export class EosClient {
  private udpClient: Client | null = null;
  private readonly config: ServerConfig;
  private readonly tcpLink?: EosTcpLink;

  constructor(config: ServerConfig, tcpLink?: EosTcpLink) {
    this.config = config;
    this.tcpLink = tcpLink;
    if (config.protocol !== "tcp") {
      this.udpClient = new Client(config.host, config.portTx);
    }
  }

  async send(address: string, ...args: unknown[]): Promise<void> {
    const resolved = withUserPrefix(this.config, address);
    if (this.config.protocol === "tcp") {
      if (!this.tcpLink) {
        throw new Error("TCP protocol requires a shared EosTcpLink instance.");
      }
      await this.tcpLink.send(resolved, ...args);
    } else {
      await this.udpClient!.send(resolved, ...args);
    }
    await this.audit(`SEND ${resolved} ${args.map(formatArg).join(" ")}`.trim());
  }

  async sendCommand(path: "/eos/cmd" | "/eos/newcmd" | "/eos/event", text: string): Promise<void> {
    await this.send(path, text);
  }

  async close(): Promise<void> {
    if (this.config.protocol === "tcp") {
      await this.tcpLink?.close();
      return;
    }
    await this.udpClient?.close();
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
