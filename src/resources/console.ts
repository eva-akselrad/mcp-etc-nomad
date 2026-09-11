import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

export function registerConsoleResources(server: McpServer, ctx: EosContext): void {
  server.registerResource(
    "console-info",
    "eos://console/info",
    {
      title: "Console connection info",
      description: "Host, transport, OSC user, mode, and cached get/* snapshot",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        host: ctx.config.host,
        protocol: ctx.config.protocol,
        portTx: ctx.config.portTx,
        portRx: ctx.config.portRx,
        tcpPort: ctx.config.protocol === "tcp" ? ctx.config.tcpPort : undefined,
        tcpMode: ctx.config.protocol === "tcp" ? ctx.config.tcpMode : undefined,
        tcpOscVersion: ctx.config.protocol === "tcp" ? ctx.config.tcpOscVersion : undefined,
        oscUserId: ctx.config.userId,
        eosVersion: ctx.config.eosVersion,
        connected: state.connected,
        consoleMode: state.consoleMode,
        lastMessageAt: state.lastMessageAt,
        lastSyncedAt: state.lastSyncedAt,
        consoleGet: state.consoleGet,
        note: "Call get_session_info to refresh /eos/get/* caches live.",
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerResource(
    "console-session",
    "eos://console/session",
    {
      title: "Session state",
      description: "Cached /eos/get/session and session metadata",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        session: state.session,
        processors: state.consoleGet?.processors,
        userlist: state.consoleGet?.userlist,
        lastSyncedAt: state.lastSyncedAt,
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerResource(
    "console-version",
    "eos://console/version",
    {
      title: "Console software version",
      description: "Pinned EOS_VERSION config + cached /eos/get/version reply",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        eosVersion: ctx.config.eosVersion,
        reported: state.consoleGet?.version,
        lastSyncedAt: state.lastSyncedAt,
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );
}
