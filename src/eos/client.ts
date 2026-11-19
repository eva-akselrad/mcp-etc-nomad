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

  /** OSC user last announced with /eos/user (undefined = never). */
  private announcedUser?: number;

  async send(address: string, ...args: unknown[]): Promise<void> {
    // Keep Eos's "current OSC user" in step with config.userId, so /eos/out/cmd and
    // /eos/out/event/state report this client's own command line and Live/Blind mode
    // (verified on ETCnomad 3.3.9: user 5 had its own line, selection and mode).
    if (address !== "/eos/user" && this.config.userId !== this.announcedUser) {
      const target = this.config.userId;
      if (!(target < 0 && this.announcedUser === undefined)) {
        await this.rawSend("/eos/user", target);
      }
      this.announcedUser = target;
    }
    if (address === "/eos/user" && typeof args[0] === "number") {
      this.announcedUser = args[0];
    }
    await this.rawSend(withUserPrefix(this.config, address), ...args);
  }

  private async rawSend(resolved: string, ...args: unknown[]): Promise<void> {
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
