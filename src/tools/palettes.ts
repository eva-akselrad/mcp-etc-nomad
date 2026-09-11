import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  paletteFire,
  paletteSelect,
  presetFire,
  presetSelect,
  type PaletteType,
} from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { gateLiveWrite, jsonResult, liveWriteFields } from "./helpers.js";

const paletteTypeSchema = z.enum(["ip", "fp", "cp", "bp", "intensity", "focus", "color", "beam"]);

const PALETTE_STEM: Record<string, PaletteType> = {
  ip: "ip",
  fp: "fp",
  cp: "cp",
  bp: "bp",
  intensity: "ip",
  focus: "fp",
  color: "cp",
  beam: "bp",
};

export function registerPaletteTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "palette_select",
    {
      description: "Select an intensity/focus/color/beam palette on the command line",
      inputSchema: z.object({
        type: paletteTypeSchema.describe("ip/fp/cp/bp or intensity/focus/color/beam"),
        palette: z.number().int().positive(),
      }),
    },
    async ({ type, palette }) => {
      const stem = PALETTE_STEM[type];
      const address = paletteSelect(stem);
      await ctx.client.send(address, palette);
      return jsonResult({ ok: true, action: "palette_select", address, type: stem, palette });
    }
  );

  server.registerTool(
    "palette_fire",
    {
      description: "Recall (fire) a palette onto the current selection via /eos/{ip|fp|cp|bp}/fire",
      inputSchema: z.object({
        type: paletteTypeSchema,
        palette: z.number().int().positive(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ type, palette, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const stem = PALETTE_STEM[type];
      const address = paletteFire(stem);
      await ctx.client.send(address, palette);
      return jsonResult({ ok: true, action: "palette_fire", address, type: stem, palette });
    }
  );

  server.registerTool(
    "preset_select",
    {
      description: "Select a preset on the command line via /eos/preset",
      inputSchema: z.object({
        preset: z.number().int().positive(),
      }),
    },
    async ({ preset }) => {
      await ctx.client.send(presetSelect(), preset);
      return jsonResult({ ok: true, action: "preset_select", preset });
    }
  );

  server.registerTool(
    "preset_fire",
    {
      description: "Recall (fire) a preset onto the current selection via /eos/preset/fire",
      inputSchema: z.object({
        preset: z.number().int().positive(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ preset, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = presetFire();
      await ctx.client.send(address, preset);
      return jsonResult({ ok: true, action: "preset_fire", address, preset });
    }
  );
}
