import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  cueListBankConfig,
  cueListBankPage,
  cueListBankReset,
  cueListBankSelect,
  directSelectBankCreate,
  directSelectBankPage,
  directSelectPress,
  type DirectSelectType,
} from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { buttonEdgeValue, checkLiveWrite, toolError, toolResult } from "./helpers.js";

const directSelectTypeSchema = z.enum([
  "chan",
  "group",
  "macro",
  "sub",
  "preset",
  "ip",
  "fp",
  "cp",
  "bp",
  "ms",
  "curve",
  "snap",
  "fx",
  "pixmap",
  "scene",
]);

const liveSchema = {
  confirm: z.boolean().optional(),
  allowLive: z.boolean().optional(),
};

export function registerBankTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "cue_list_bank_config",
    {
      description:
        "Create an OSC cue list bank showing previous/upcoming cues around the current cue",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        cueList: z.number().int().positive(),
        previousRows: z.number().int().min(0),
        upcomingRows: z.number().int().min(0),
        offset: z.number().int().min(0).optional(),
      }),
    },
    async ({ bank, cueList, previousRows, upcomingRows, offset }) => {
      const address = cueListBankConfig(bank, cueList, previousRows, upcomingRows, offset);
      await ctx.client.send(address);
      return toolResult({ bank, cueList, previousRows, upcomingRows, offset, address });
    }
  );

  server.registerTool(
    "cue_list_bank_page",
    {
      description: "Page an OSC cue list bank by rows (use 0 to follow current cue)",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        delta: z.number().int().describe("Row delta; 0 jumps back to current cue"),
      }),
    },
    async ({ bank, delta }) => {
      const address = cueListBankPage(bank, delta);
      await ctx.client.send(address, delta);
      return toolResult({ bank, delta, address });
    }
  );

  server.registerTool(
    "cue_list_bank_select",
    {
      description: "Jump an OSC cue list bank to a specific cue number",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        cue: z.union([z.number(), z.string()]),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, cue, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = cueListBankSelect(bank, cue);
      await ctx.client.send(address, cue);
      return toolResult({ bank, cue, address });
    }
  );

  server.registerTool(
    "cue_list_bank_reset",
    {
      description: "Reset an OSC cue list bank configuration",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        confirm: z.boolean().optional(),
      }),
    },
    async ({ bank, confirm }) => {
      if (ctx.config.requireConfirm && !confirm) {
        return toolError("Pass confirm=true to reset cue list bank.");
      }

      const address = cueListBankReset(bank);
      await ctx.client.send(address);
      return toolResult({ bank, address });
    }
  );

  server.registerTool(
    "direct_select_bank_create",
    {
      description: "Create an OSC direct select bank for channels, groups, palettes, macros, etc.",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        type: directSelectTypeSchema,
        count: z.number().int().positive(),
        page: z.number().int().positive().optional(),
        flexi: z.boolean().optional(),
      }),
    },
    async ({ bank, type, count, page, flexi }) => {
      const address = directSelectBankCreate(
        bank,
        type as DirectSelectType,
        count,
        page,
        flexi
      );
      await ctx.client.send(address);
      return toolResult({ bank, type, count, page, flexi, address });
    }
  );

  server.registerTool(
    "direct_select_bank_page",
    {
      description: "Page an OSC direct select bank up or down",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        delta: z.number().int().describe("Positive = page down, negative = page up"),
      }),
    },
    async ({ bank, delta }) => {
      const address = directSelectBankPage(bank, delta);
      await ctx.client.send(address, delta);
      return toolResult({ bank, delta, address });
    }
  );

  server.registerTool(
    "direct_select_press",
    {
      description: "Press or release a direct select button (1.0=down, 0.0=up)",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        button: z.number().int().positive(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, button, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = directSelectPress(bank, button);
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ bank, button, edge, address });
    }
  );
}
