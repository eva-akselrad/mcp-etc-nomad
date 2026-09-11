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
import { gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

const dsTypeSchema = z.enum([
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

export function registerBankTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "cue_list_bank_config",
    {
      description:
        "Create an OSC cue list bank. Eos then streams labels/rows. cueList 0 follows the current list. previous/pending are row counts around the live cue.",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        cueList: z.number().int().min(0).describe("Cue list number; 0 = follow current list"),
        previous: z.number().int().min(0).optional().describe("Rows before the current cue (default 3)"),
        pending: z.number().int().min(0).optional().describe("Rows after the current cue (default 6)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Optional 0-based index into the list (cues and parts each count as one)"),
      }),
    },
    async ({ bank, cueList, previous, pending, offset }) => {
      const address = cueListBankConfig(bank, cueList, previous ?? 3, pending ?? 6, offset);
      await ctx.client.send(address);
      return jsonResult({
        ok: true,
        action: "cue_list_bank_config",
        address,
        bank,
        cueList,
        previous: previous ?? 3,
        pending: pending ?? 6,
        offset,
      });
    }
  );

  server.registerTool(
    "cue_list_bank_page",
    {
      description:
        "Page a cue list bank view. Positive pages down, negative up, 0 jumps back to the live cue and follows it. Does not fire cues.",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        delta: z.number().int(),
      }),
    },
    async ({ bank, delta }) => {
      const address = cueListBankPage(bank, delta);
      await ctx.client.send(address);
      return jsonResult({ ok: true, action: "cue_list_bank_page", address, bank, delta });
    }
  );

  server.registerTool(
    "cue_list_bank_select",
    {
      description: "Jump an OSC cue list bank view to a cue number (does not fire the cue)",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        cue: z.union([z.number(), z.string()]),
      }),
    },
    async ({ bank, cue }) => {
      const address = cueListBankSelect(bank, cue);
      await ctx.client.send(address);
      return jsonResult({ ok: true, action: "cue_list_bank_select", address, bank, cue });
    }
  );

  server.registerTool(
    "cue_list_bank_reset",
    {
      description: "Reset OSC cue list bank configuration",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        confirm: z.boolean().optional(),
      }),
    },
    async ({ bank, confirm }) => {
      if (ctx.config.requireConfirm && !confirm) {
        return jsonResult({ ok: false, error: "Pass confirm=true to reset the cue list bank." }, true);
      }
      const address = cueListBankReset(bank);
      await ctx.client.send(address);
      return jsonResult({ ok: true, action: "cue_list_bank_reset", address, bank });
    }
  );

  server.registerTool(
    "direct_select_bank_create",
    {
      description:
        "Create an OSC direct select bank (/eos/ds/{bank}/{type}/{count}). Required before paging or pressing. Types: chan, group, macro, sub, preset, ip, fp, cp, bp, ms, curve, snap, fx, pixmap, scene.",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        type: dsTypeSchema,
        count: z.number().int().positive(),
        page: z.number().int().positive().optional(),
        flexi: z.boolean().optional().describe("Create in Flexi mode"),
      }),
    },
    async ({ bank, type, count, page, flexi }) => {
      const address = directSelectBankCreate(bank, type as DirectSelectType, count, { flexi, page });
      await ctx.client.send(address);
      return jsonResult({
        ok: true,
        action: "direct_select_bank_create",
        address,
        bank,
        type,
        count,
        page,
        flexi: Boolean(flexi),
      });
    }
  );

  server.registerTool(
    "direct_select_bank_page",
    {
      description: "Page an OSC direct select bank. Positive delta pages down, negative up.",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        delta: z.number().int(),
      }),
    },
    async ({ bank, delta }) => {
      const address = directSelectBankPage(bank, delta);
      await ctx.client.send(address);
      return jsonResult({ ok: true, action: "direct_select_bank_page", address, bank, delta });
    }
  );

  server.registerTool(
    "direct_select_press",
    {
      description: "Press a button on an OSC direct select bank (bank must exist)",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        button: z.number().int().positive(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, button, edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = directSelectPress(bank, button);
      await sendButton(ctx, address, edge);
      return jsonResult({
        ok: true,
        action: "direct_select_press",
        address,
        bank,
        button,
        edge: edge ?? "tap",
      });
    }
  );
}
