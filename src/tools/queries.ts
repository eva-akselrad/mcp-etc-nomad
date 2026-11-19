import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { oscReset } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { sendChannelSelection } from "../eos/selection.js";
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
  const CATEGORY = ["Null", "Intensity", "Focus", "Color", "Image", "Form", "Shutter"];
  const wheelsSince = (sinceMs: number) =>
    Object.values(ctx.listener.getState().activeWheels ?? {})
      .filter((w) => Date.parse(w.updatedAt) >= sinceMs)
      .sort((a, b) => a.index - b.index)
      .map((w) => ({
        name: w.name,
        value: w.value,
        category: w.category !== undefined ? CATEGORY[w.category] ?? w.category : undefined,
        label: w.label,
      }));

  server.registerTool(
    "get_channel_parameters",
    {
      description:
        "Read back a channel's current parameter values (intensity, colour, pan/tilt, beam...) from " +
        "/eos/out/active/wheel/*. Selects the channel (does not change levels), then waits for Eos to report. " +
        "Values are for the first selected channel.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        timeoutMs: z.number().int().positive().max(10000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ channel, timeoutMs }) => {
      const t0 = Date.now();
      await sendChannelSelection(ctx, { channel });
      try {
        await ctx.listener.waitFor(/^\/eos\/out\/active\/wheel\/\d+$/, timeoutMs ?? 3000);
      } catch {
        // fall through: report whatever arrived
      }
      await new Promise((r) => setTimeout(r, 500));
      const parameters = wheelsSince(t0);
      return jsonResult(
        {
          ok: parameters.length > 0,
          channel,
          activeChannels: ctx.listener.getState().activeChannels,
          parameters,
          note: parameters.length
            ? undefined
            : "No wheel data arrived. Check OSC TX is on; on TCP 3032 updates arrive about once a second.",
        },
        parameters.length === 0
      );
    }
  );

  server.registerTool(
    "get_active_parameters",
    {
      description: "Return the last parameter values Eos reported for the current selection (no selection change).",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      jsonResult({ activeChannels: ctx.listener.getState().activeChannels, parameters: wheelsSince(0) })
  );
  server.registerTool(
    "eos_ping",
    {
      description:
        "Check the console is answering: sends /eos/ping and waits for /eos/out/ping. " +
        "No reply usually means OSC RX/TX is off in the open show, or the wrong host/port.",
      inputSchema: z.object({ timeoutMs: z.number().int().positive().max(10000).optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ timeoutMs }) => {
      const token = `mcp-${Date.now()}`;
      const t0 = Date.now();
      await ctx.client.send("/eos/ping", token);
      try {
        const reply = await ctx.listener.waitFor(/^\/eos\/out\/ping/, timeoutMs ?? 2000);
        return jsonResult({
          ok: true,
          roundTripMs: Date.now() - t0,
          reply: reply.args,
          host: ctx.config.host,
          protocol: ctx.config.protocol,
        });
      } catch {
        return jsonResult(
          {
            ok: false,
            error: "No /eos/out/ping reply.",
            checks: [
              "Is Nomad / the console running with a show open?",
              "Setup > System Settings > Show Control > OSC: OSC RX, OSC TX and String RX on (stored per show file).",
              `EOS_HOST=${ctx.config.host}, protocol ${ctx.config.protocol} — match the console.`,
            ],
          },
          true
        );
      }
    }
  );
}
