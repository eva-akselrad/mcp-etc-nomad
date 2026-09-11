import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { cueFire, cueSelect, keyPress, macroFire, magicSheet, subLevel } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { checkLiveWrite, toolError, toolResult } from "./helpers.js";

const liveSchema = {
  confirm: z.boolean().optional(),
  allowLive: z.boolean().optional(),
};

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
      return toolResult({ cueList, cue, address });
    }
  );

  server.registerTool(
    "cue_fire",
    {
      description: "Fire a cue (does not follow GO sequencing unless using cue_go)",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]),
        cueList: z.number().int().positive().optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cue, cueList, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = cueFire(cueList, cue);
      await ctx.client.send(address, cue);
      return toolResult({ cueList, cue, address });
    }
  );

  server.registerTool(
    "cue_go",
    {
      description: "Press the console Go key (sequential cue advance)",
      inputSchema: z.object({
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      await ctx.client.send(keyPress("go"), 0);
      return toolResult({ action: "go" });
    }
  );

  server.registerTool(
    "key_press",
    {
      description: "Press an Eos hardkey by OSC name (e.g. 'go', 'clear', 'stop'). Use list_osc_keys.",
      inputSchema: z.object({
        key: z.string().describe("OSC key name from Eos Virtual Keyboard"),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ key, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = keyPress(key);
      if (edge === "tap" || edge === undefined) {
        await ctx.client.send(address, 0);
      } else {
        await ctx.client.send(address, edge === "down" ? 1.0 : 0.0);
      }

      return toolResult({ key, edge, address });
    }
  );

  server.registerTool(
    "macro_fire",
    {
      description: "Run a macro by number",
      inputSchema: z.object({
        macro: z.number().int().positive(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ macro, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      await ctx.client.send(macroFire(), macro);
      return toolResult({ macro });
    }
  );

  server.registerTool(
    "submaster_set_level",
    {
      description: "Set a submaster level (0.0-1.0)",
      inputSchema: z.object({
        sub: z.number().int().positive(),
        level: z.number().min(0).max(1),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ sub, level, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      await ctx.client.send(subLevel(sub), level);
      return toolResult({ sub, level });
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
      return toolResult({ sheet, view });
    }
  );
}
