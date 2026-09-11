import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

export function registerPlaybackResources(server: McpServer, ctx: EosContext): void {
  server.registerResource(
    "playback-active",
    "eos://playback/active",
    {
      title: "Active cue",
      description: "Currently running cue text, percent, and parsed list/cue from OSC cache",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        ...state.activeCue,
        lastSyncedAt: state.lastMessageAt,
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "playback-state",
    "eos://playback/state",
    {
      title: "Console playback state",
      description: "Blind/live mode, pending cue, fader banks, connection metadata",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        consoleMode: state.consoleMode,
        oscUserId: state.oscUserId,
        connected: state.connected,
        lastSyncedAt: state.lastMessageAt,
        commandLine: state.commandLine,
        activeChannels: state.activeChannels,
        pendingCue: state.pendingCue,
        faderBanks: state.faderBanks,
        cueListBanks: state.cueListBanks,
        directSelectBanks: state.directSelectBanks,
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );
}
