import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { oscReset } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";

export function registerQueryTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "get_console_state",
    {
      description: "Return cached console state (blind/live, user, connection)",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(state, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_active_cue",
    {
      description: "Return the active cue text and completion percent from OSC cache",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { activeCue } = ctx.listener.getState();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(activeCue, null, 2) }],
      };
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
      const { commandLine } = ctx.listener.getState();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ commandLine: commandLine ?? "" }, null, 2),
          },
        ],
      };
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
        return {
          content: [{ type: "text" as const, text: "Pass confirm=true to reset OSC state." }],
          isError: true,
        };
      }

      await ctx.client.send(oscReset());
      return { content: [{ type: "text" as const, text: "OSC reset sent" }] };
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
      return {
        content: [{ type: "text" as const, text: JSON.stringify(message, null, 2) }],
      };
    }
  );
}
