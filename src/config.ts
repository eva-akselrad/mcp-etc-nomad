export interface ServerConfig {
  host: string;
  portTx: number;
  portRx: number;
  rxBind: string;
  protocol: "udp" | "tcp";
  /** Eos TCP listen port: 3037 third-party SLIP (default) or 3032 native length-prefixed. */
  tcpPort: number;
  /** TCP framing: slip (3037) or length (3032 OSC 1.0). */
  tcpMode: "slip" | "length";
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

export function loadConfig(): ServerConfig {
  return {
    host: process.env.EOS_HOST ?? "127.0.0.1",
    portTx: parseIntEnv(process.env.EOS_PORT_TX, 8000),
    portRx: parseIntEnv(process.env.EOS_PORT_RX, 9001),
    rxBind: process.env.EOS_RX_BIND ?? "0.0.0.0",
    protocol: process.env.EOS_PROTOCOL === "tcp" ? "tcp" : "udp",
    tcpPort: parseIntEnv(process.env.EOS_TCP_PORT, 3037),
    tcpMode:
      process.env.EOS_TCP_MODE === "length"
        ? "length"
        : process.env.EOS_TCP_MODE === "slip"
          ? "slip"
          : parseIntEnv(process.env.EOS_TCP_PORT, 3037) === 3032
            ? "length"
            : "slip",
    userId: parseIntEnv(process.env.EOS_USER_ID, -1),
    allowLive: parseBool(process.env.EOS_ALLOW_LIVE, false),
    requireConfirm: parseBool(process.env.EOS_REQUIRE_CONFIRM, true),
    maxCueFiresPerMinute: parseIntEnv(process.env.EOS_MAX_CUE_FIRES_PER_MIN, 12),
    auditLogPath: process.env.EOS_AUDIT_LOG,
    eosVersion: process.env.EOS_VERSION ?? "3.3.6",
  };
}
