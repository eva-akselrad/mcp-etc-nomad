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

  const paletteRecallFields = {
    type: paletteTypeSchema,
    palette: z.number().int().positive(),
    ...liveWriteFields,
  };

  const paletteRecallHandler = async ({
    type,
    palette,
    confirm,
    allow_live,
  }: {
    type: string;
    palette: number;
    confirm?: boolean;
    allow_live?: boolean;
  }) => {
    const blocked = gateLiveWrite(ctx, { confirm, allow_live });
    if (blocked) return blocked;

    const stem = PALETTE_STEM[type];
    const address = paletteFire(stem);
    await ctx.client.send(address, palette);
    return jsonResult({ ok: true, action: "palette_recall", address, type: stem, palette });
  };

  server.registerTool(
    "palette_recall",
    {
      description:
        "Recall a palette onto the current selection (OSC palette recall verb on /eos/{ip|fp|cp|bp}).",
      inputSchema: z.object(paletteRecallFields),
      annotations: { destructiveHint: true },
    },
    paletteRecallHandler
  );

  server.registerTool(
    "palette_fire",
    {
      description: "Recall a palette onto the current selection (alias of palette_recall).",
      inputSchema: z.object(paletteRecallFields),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const result = await paletteRecallHandler(args);
      if (result.isError) return result;
      const body = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      body.action = "palette_fire";
      body.canonicalAction = "palette_recall";
      return jsonResult(body);
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

  const presetRecallFields = {
    preset: z.number().int().positive(),
    ...liveWriteFields,
  };

  const presetRecallHandler = async ({
    preset,
    confirm,
    allow_live,
  }: {
    preset: number;
    confirm?: boolean;
    allow_live?: boolean;
  }) => {
    const blocked = gateLiveWrite(ctx, { confirm, allow_live });
    if (blocked) return blocked;

    const address = presetFire();
    await ctx.client.send(address, preset);
    return jsonResult({ ok: true, action: "preset_recall", address, preset });
  };

  server.registerTool(
    "preset_recall",
    {
      description: "Recall a preset onto the current selection (OSC preset recall on /eos/preset).",
      inputSchema: z.object(presetRecallFields),
      annotations: { destructiveHint: true },
    },
    presetRecallHandler
  );

  server.registerTool(
    "preset_fire",
    {
      description: "Recall a preset onto the current selection (alias of preset_recall).",
      inputSchema: z.object(presetRecallFields),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const result = await presetRecallHandler(args);
      if (result.isError) return result;
      const body = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      body.action = "preset_fire";
      body.canonicalAction = "preset_recall";
      return jsonResult(body);
    }
  );
}
