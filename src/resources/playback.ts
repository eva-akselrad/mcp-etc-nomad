import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

export function registerPlaybackResources(server: McpServer, ctx: EosContext): void {
  server.registerResource(
    "playback-active",
    "eos://playback/active",
    {
      title: "Active cue",
      description: "Currently running cue (list, number, text, percent) from OSC cache",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        ...state.activeCue,
        lastSyncedAt: state.lastSyncedAt,
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
    "playback-pending",
    "eos://playback/pending",
    {
      title: "Pending cues",
      description: "Next/pending cue text and raw /eos/out/pending/cue cache",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        pendingCue: state.pendingCue,
        pendingCues: state.pendingCues,
        lastSyncedAt: state.lastSyncedAt,
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
      description: "Blind/live mode, pending cue, faders, OSC user, connection metadata",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        consoleMode: state.consoleMode,
        oscUserId: state.oscUserId,
        connected: state.connected,
        lastMessageAt: state.lastMessageAt,
        lastSyncedAt: state.lastSyncedAt,
        commandLine: state.commandLine,
        activeChannels: state.activeChannels,
        activeCue: state.activeCue,
        pendingCue: state.pendingCue,
        faders: state.faders,
        allowLive: ctx.config.allowLive,
        requireConfirm: ctx.config.requireConfirm,
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
    "playback-faders",
    "eos://playback/faders",
    {
      title: "Fader bank cache",
      description: "OSC fader labels and levels (empty until fader_bank_config)",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        faders: state.faders,
        levels: state.faderLevels,
        labels: state.faderLabels,
        lastSyncedAt: state.lastSyncedAt,
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
