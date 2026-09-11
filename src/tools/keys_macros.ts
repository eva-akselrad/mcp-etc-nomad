import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { keyPress, macroSelect, softkeyPress } from "../eos/addresses.js";
import { EOS_OSC_KEYS, resolveOscKey } from "../eos/keys.js";
import type { EosContext } from "../eos/context.js";
import { buttonEdgeValue, checkLiveWrite, toolError, toolResult } from "./helpers.js";

const liveSchema = {
  confirm: z.boolean().optional(),
  allowLive: z.boolean().optional(),
};

export function registerKeysMacroTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "softkey_press",
    {
      description: "Press a softkey (1-12; pages 1-6 and 7-12 on second page)",
      inputSchema: z.object({
        index: z.number().int().min(1).max(12),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ index, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = softkeyPress(index);
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ index, edge, address });
    }
  );

  server.registerTool(
    "macro_select",
    {
      description: "Select a macro by number (does not fire it)",
      inputSchema: z.object({
        macro: z.number().int().positive(),
      }),
    },
    async ({ macro }) => {
      const address = macroSelect();
      await ctx.client.send(address, macro);
      return toolResult({ macro, address });
    }
  );

  server.registerTool(
    "staging_mode_toggle",
    {
      description: "Toggle Eos staging mode via the Staging_Mode hardkey",
      inputSchema: z.object({
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = keyPress("staging_mode");
      await ctx.client.send(address, 0);
      return toolResult({ action: "staging_mode_toggle", address });
    }
  );

  server.registerTool(
    "list_osc_keys",
    {
      description: "List supported Eos OSC hardkey names from the ETC OSC Dictionary",
      inputSchema: z.object({
        filter: z.string().optional().describe("Optional case-insensitive substring filter"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ filter }) => {
      const needle = filter?.trim().toLowerCase();
      const keys = needle
        ? EOS_OSC_KEYS.filter((key) => key.toLowerCase().includes(needle))
        : [...EOS_OSC_KEYS];

      return toolResult({
        count: keys.length,
        keys,
        note: "Use key_press with these names. For slash, use '/' or 'slash' (sent as /eos/key/\\).",
      });
    }
  );

  server.registerTool(
    "resolve_osc_key",
    {
      description: "Resolve a user-supplied key label to the canonical OSC key name",
      inputSchema: z.object({
        key: z.string(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ key }) => {
      const resolved = resolveOscKey(key);
      if (!resolved) {
        return toolError(`Unknown OSC key: ${key}. Use list_osc_keys to browse valid names.`);
      }
      return toolResult({ input: key, resolved, address: keyPress(resolved) });
    }
  );
}
