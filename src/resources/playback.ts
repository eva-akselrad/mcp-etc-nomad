import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

export function registerPlaybackResources(server: McpServer, ctx: EosContext): void {
  server.registerResource(
    "playback-active",
    "eos://playback/active",
    {
      title: "Active cue",
      description: "Currently running cue text and completion from OSC cache",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(ctx.listener.getState().activeCue, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "playback-state",
    "eos://playback/state",
    {
      title: "Console playback state",
      description: "Blind/live mode, OSC user, connection metadata",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        consoleMode: state.consoleMode,
        oscUserId: state.oscUserId,
        connected: state.connected,
        lastMessageAt: state.lastMessageAt,
        commandLine: state.commandLine,
        activeChannels: state.activeChannels,
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
