import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { cueFire, cueSelect, keyPress, macroFire, magicSheet, subLevel } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { assertLiveAllowed } from "../eos/context.js";

export function registerPlaybackTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "cue_select",
    {
      description: "Select a cue, optionally within a cue list",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]),
        cueList: z.number().int().positive().optional(),
      }),
    },
    async ({ cue, cueList }) => {
      const address = cueSelect(cueList);
      await ctx.client.send(address, cue);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ cueList, cue }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "cue_fire",
    {
      description: "Fire a cue (does not follow GO sequencing unless using cue_go)",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]),
        cueList: z.number().int().positive().optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cue, cueList, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(cueFire(cueList, cue), cue);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ cueList, cue }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "cue_go",
    {
      description: "Press the console Go key (sequential cue advance)",
      inputSchema: z.object({
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(keyPress("go"), 0);
      return { content: [{ type: "text" as const, text: "Go pressed" }] };
    }
  );

  server.registerTool(
    "key_press",
    {
      description: "Press an Eos hardkey by OSC name (e.g. 'go', 'clear', 'stop')",
      inputSchema: z.object({
        key: z.string().describe("OSC key name from Eos Virtual Keyboard"),
        edge: z.enum(["down", "up", "tap"]).optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ key, edge, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      const address = keyPress(key);
      if (edge === "tap" || edge === undefined) {
        await ctx.client.send(address, 0);
      } else {
        await ctx.client.send(address, edge === "down" ? 1.0 : 0.0);
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ key, edge }, null, 2) }] };
    }
  );

  server.registerTool(
    "macro_fire",
    {
      description: "Run a macro by number",
      inputSchema: z.object({
        macro: z.number().int().positive(),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ macro, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(macroFire(), macro);
      return { content: [{ type: "text" as const, text: `Macro ${macro} fired` }] };
    }
  );

  server.registerTool(
    "submaster_set_level",
    {
      description: "Set a submaster level (0.0-1.0)",
      inputSchema: z.object({
        sub: z.number().int().positive(),
        level: z.number().min(0).max(1),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ sub, level, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(subLevel(sub), level);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ sub, level }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "magic_sheet_open",
    {
      description: "Open a magic sheet, optionally a specific view",
      inputSchema: z.object({
        sheet: z.number().int().positive(),
        view: z.number().int().positive().optional(),
      }),
    },
    async ({ sheet, view }) => {
      await ctx.client.send(magicSheet(sheet, view), view ?? sheet);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ sheet, view }, null, 2) }],
      };
    }
  );
}
