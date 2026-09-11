import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { oscReset } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { jsonResult } from "./helpers.js";

export function registerQueryTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "get_console_state",
    {
      description: "Return cached console state (blind/live, user, connection, lastSyncedAt)",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        connected: state.connected,
        consoleMode: state.consoleMode,
        oscUserId: state.oscUserId,
        commandLine: state.commandLine,
        activeChannels: state.activeChannels,
        activeChannelLevels: state.activeChannelLevels,
        lastMessageAt: state.lastMessageAt,
        lastSyncedAt: state.lastSyncedAt,
        allowLive: ctx.config.allowLive,
        requireConfirm: ctx.config.requireConfirm,
      });
    }
  );

  server.registerTool(
    "get_active_cue",
    {
      description: "Return the active cue text, list/number, and completion percent from OSC cache",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({ ...state.activeCue, lastSyncedAt: state.lastSyncedAt });
    }
  );

  server.registerTool(
    "get_command_line",
    {
      description: "Return the current command line text from OSC cache",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { commandLine, lastSyncedAt } = ctx.listener.getState();
      return jsonResult({ commandLine: commandLine ?? "", lastSyncedAt });
    }
  );

  server.registerTool(
    "get_fader_labels_levels",
    {
      description:
        "Return cached OSC fader bank labels and levels. Empty until fader_bank_config has been sent this session.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        faders: state.faders,
        levels: state.faderLevels,
        labels: state.faderLabels,
        lastSyncedAt: state.lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "get_direct_selects",
    {
      description:
        "Return cached OSC direct select labels. Empty until direct_select_bank_create has been sent this session.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        directSelects: state.directSelects,
        lastSyncedAt: state.lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "osc_reset",
    {
      description: "Send /eos/reset to clear OSC switches and refresh implicit output",
      inputSchema: z.object({
        confirm: z.boolean().optional(),
      }),
    },
    async ({ confirm }) => {
      if (ctx.config.requireConfirm && !confirm) {
        return jsonResult({ ok: false, error: "Pass confirm=true to reset OSC state." }, true);
      }

      await ctx.client.send(oscReset());
      return jsonResult({ ok: true, action: "osc_reset", address: "/eos/reset" });
    }
  );

  server.registerTool(
    "wait_for_osc",
    {
      description: "Wait for an incoming OSC address pattern (timeout in ms)",
      inputSchema: z.object({
        address: z.string().describe("Exact OSC address or regex pattern"),
        timeoutMs: z.number().int().positive().max(30000).optional(),
        useRegex: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ address, timeoutMs, useRegex }) => {
      const pattern = useRegex ? new RegExp(address) : address;
      const message = await ctx.listener.waitFor(pattern, timeoutMs ?? 3000);
      return jsonResult(message);
    }
  );
}
