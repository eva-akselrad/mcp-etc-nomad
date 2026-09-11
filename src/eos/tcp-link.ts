import { EventEmitter } from "node:events";
import { connect, type Socket } from "node:net";
import * as osc from "osc-min";
import * as slip from "slip";
import type { ServerConfig } from "../config.js";

export interface OscInboundMessage {
  address: string;
  args: unknown[];
}

type MessageHandler = (message: OscInboundMessage) => void;

/**
 * Real TCP OSC to Eos (not UDP port retargeting).
 * Eos listens on TCP; one outbound connection is bidirectional — /eos/out/* RX on the same socket.
 * OSC TCP 1.0 = 32-bit packet-length headers (port 3032 default).
 * OSC TCP 1.1 = SLIP framing (port 3037 Third Party OSC, v3.1+; faster /eos/out refresh).
 * Enable OSC RX+TX in Setup regardless of transport. Framing must match Eos TCP mode setting.
 */
export class EosTcpLink extends EventEmitter {
  private socket: Socket | null = null;
  private readonly handlers = new Set<MessageHandler>();
  private slipDecoder: slip.Decoder | null = null;
  private receiveBuffer: Buffer = Buffer.alloc(0);

  constructor(private readonly config: ServerConfig) {
    super();
  }

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async connect(timeoutMs = 5000): Promise<void> {
    if (this.connected) return;

    const port = this.config.tcpPort;
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: this.config.host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`TCP OSC connect timed out after ${timeoutMs}ms (${this.config.host}:${port})`));
      }, timeoutMs);

      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      socket.once("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        this.wireSocket(socket);
        resolve();
      });
    });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async send(address: string, ...args: unknown[]): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      await this.connect();
    }

    const packet = osc.toBuffer({ address, args: args.map(toOscArg) });
    const payload = Buffer.from(packet.buffer, packet.byteOffset, packet.byteLength);

    if (this.config.tcpMode === "length") {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length, 0);
      await writeAll(this.socket!, Buffer.concat([header, payload]));
      return;
    }

    const framed = slip.encode(payload);
    await writeAll(this.socket!, Buffer.from(framed));
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    await new Promise<void>((resolve) => {
      this.socket?.end(() => resolve());
    });
    this.socket = null;
    this.slipDecoder = null;
    this.receiveBuffer = Buffer.alloc(0);
  }

  private wireSocket(socket: Socket): void {
    if (this.config.tcpMode === "slip") {
      this.slipDecoder = new slip.Decoder({
        onMessage: (frame) => this.dispatchBuffer(Buffer.from(frame)),
        onError: (_buf, err) => this.emit("error", new Error(`SLIP decode error: ${err}`)),
      });
    }

    socket.on("data", (chunk) => {
      if (this.config.tcpMode === "length") {
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
        this.drainLengthPrefixed();
        return;
      }
      this.slipDecoder?.decode(chunk);
    });

    socket.on("close", () => {
      this.socket = null;
      this.emit("close");
    });

    socket.on("error", (err) => this.emit("error", err));
  }

  private drainLengthPrefixed(): void {
    while (this.receiveBuffer.length >= 4) {
      const size = this.receiveBuffer.readUInt32BE(0);
      if (this.receiveBuffer.length < 4 + size) return;
      const frame = this.receiveBuffer.subarray(4, 4 + size);
      this.receiveBuffer = this.receiveBuffer.subarray(4 + size);
      this.dispatchBuffer(frame);
    }
  }

  private dispatchBuffer(frame: Buffer): void {
    try {
      const packet = osc.fromBuffer(frame);
      if (packet.oscType !== "message") return;
      const message: OscInboundMessage = {
        address: packet.address,
        args: packet.args.map((arg) => arg.value),
      };
      for (const handler of this.handlers) {
        handler(message);
      }
      this.emit("message", message);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }
}

function toOscArg(value: unknown): osc.OscArgInput {
  if (typeof value === "number") return { type: "float", value };
  if (typeof value === "string") return { type: "string", value };
  if (value === true) return { type: "true" };
  if (value === false) return { type: "false" };
  return { type: "string", value: String(value) };
}

function writeAll(socket: Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
