export interface ServerConfig {
  host: string;
  portTx: number;
  portRx: number;
  rxBind: string;
  protocol: "udp" | "tcp";
  /**
   * Eos TCP listen port. Default 3032 (native OSC TCP 1.0). 3037 = Third Party OSC 1.1 (SLIP).
   * Custom ports allowed (ETC recommends 4703–4727+). MCP opens one outbound TCP connection.
   */
  tcpPort: number;
  /** Wire framing: length = OSC TCP 1.0 packet headers; slip = OSC TCP 1.1 SLIP. */
  tcpMode: "slip" | "length";
  /** OSC-over-TCP protocol version label — must match Eos Setup → Show Control → OSC TCP mode. */
  tcpOscVersion: "1.0" | "1.1";
  userId: number;
  allowLive: boolean;
  requireConfirm: boolean;
  maxCueFiresPerMinute: number;
  auditLogPath?: string;
  eosVersion: string;
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function resolveTcpFraming(
  tcpPort: number,
  envMode?: string,
  envOscVersion?: string
): { tcpMode: "slip" | "length"; tcpOscVersion: "1.0" | "1.1" } {
  if (envOscVersion === "1.0" || envMode === "length") {
    return { tcpMode: "length", tcpOscVersion: "1.0" };
  }
  if (envOscVersion === "1.1" || envMode === "slip") {
    return { tcpMode: "slip", tcpOscVersion: "1.1" };
  }
  if (tcpPort === 3032) {
    return { tcpMode: "length", tcpOscVersion: "1.0" };
  }
  if (tcpPort === 3037) {
    return { tcpMode: "slip", tcpOscVersion: "1.1" };
  }
  // Custom TCP port — default to OSC TCP 1.0 length framing unless overridden.
  return { tcpMode: "length", tcpOscVersion: "1.0" };
}

export function loadConfig(): ServerConfig {
  const tcpPort = parseIntEnv(process.env.EOS_TCP_PORT, 3032);
  const { tcpMode, tcpOscVersion } = resolveTcpFraming(
    tcpPort,
    process.env.EOS_TCP_MODE,
    process.env.EOS_TCP_OSC_VERSION
  );

  return {
    host: process.env.EOS_HOST ?? "127.0.0.1",
    portTx: parseIntEnv(process.env.EOS_PORT_TX, 8000),
    portRx: parseIntEnv(process.env.EOS_PORT_RX, 9001),
    rxBind: process.env.EOS_RX_BIND ?? "0.0.0.0",
    protocol: process.env.EOS_PROTOCOL === "tcp" ? "tcp" : "udp",
    tcpPort,
    tcpMode,
    tcpOscVersion,
    userId: parseIntEnv(process.env.EOS_USER_ID, -1),
    allowLive: parseBool(process.env.EOS_ALLOW_LIVE, false),
    requireConfirm: parseBool(process.env.EOS_REQUIRE_CONFIRM, true),
    maxCueFiresPerMinute: parseIntEnv(process.env.EOS_MAX_CUE_FIRES_PER_MIN, 12),
    auditLogPath: process.env.EOS_AUDIT_LOG,
    eosVersion: process.env.EOS_VERSION ?? "3.3.6",
  };
}
