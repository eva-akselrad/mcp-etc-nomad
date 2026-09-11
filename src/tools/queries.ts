import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { oscReset } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { toolError, toolResult } from "./helpers.js";

export function registerQueryTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "get_console_state",
    {
      description: "Return cached console state (blind/live, user, connection)",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolResult(ctx.listener.getState())
  );

  server.registerTool(
    "get_active_cue",
    {
      description: "Return the active cue text and completion percent from OSC cache",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolResult(ctx.listener.getState().activeCue)
  );

  server.registerTool(
    "get_pending_cues",
    {
      description: "Return pending cue text and OSC pending-cue cache entries",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolResult(ctx.listener.getState().pendingCue)
  );

  server.registerTool(
    "get_command_line",
    {
      description: "Return the current command line text from OSC cache",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolResult({ commandLine: ctx.listener.getState().commandLine ?? "" })
  );

  server.registerTool(
    "get_fader_labels_levels",
    {
      description: "Return cached OSC fader bank levels, labels, and page numbers",
      inputSchema: z.object({
        bank: z.number().int().min(0).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ bank }) => {
      const { faderBanks } = ctx.listener.getState();
      if (bank === undefined) {
        return toolResult(faderBanks);
      }
      return toolResult(faderBanks[String(bank)] ?? { levels: {}, labels: {} });
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
        return toolError("Pass confirm=true to reset OSC state.");
      }

      await ctx.client.send(oscReset());
      return toolResult({ action: "osc_reset" });
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
      return toolResult(message);
    }
  );
}
