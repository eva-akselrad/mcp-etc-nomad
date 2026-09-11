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
import { buttonEdgeValue, checkLiveWrite, toolError, toolResult } from "./helpers.js";

const paletteTypeSchema = z.enum(["ip", "fp", "cp", "bp"]);

const liveSchema = {
  confirm: z.boolean().optional(),
  allowLive: z.boolean().optional(),
  edge: z.enum(["down", "up", "tap"]).optional(),
};

export function registerPaletteTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "palette_select",
    {
      description: "Select an intensity, focus, color, or beam palette (ip/fp/cp/bp)",
      inputSchema: z.object({
        type: paletteTypeSchema,
        palette: z.number().int().positive(),
      }),
    },
    async ({ type, palette }) => {
      const address = paletteSelect(type as PaletteType);
      await ctx.client.send(address, palette);
      return toolResult({ type, palette, address });
    }
  );

  server.registerTool(
    "palette_fire",
    {
      description: "Fire (recall) an intensity, focus, color, or beam palette",
      inputSchema: z.object({
        type: paletteTypeSchema,
        palette: z.number().int().positive(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ type, palette, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = paletteFire(type as PaletteType, palette);
      const edgeValue = buttonEdgeValue(edge);
      if (edgeValue === undefined) {
        await ctx.client.send(address);
      } else {
        await ctx.client.send(address, edgeValue);
      }
      return toolResult({ type, palette, address });
    }
  );

  server.registerTool(
    "preset_select",
    {
      description: "Select a preset by number",
      inputSchema: z.object({
        preset: z.number().int().positive(),
      }),
    },
    async ({ preset }) => {
      const address = presetSelect();
      await ctx.client.send(address, preset);
      return toolResult({ preset, address });
    }
  );

  server.registerTool(
    "preset_fire",
    {
      description: "Fire (recall) a preset by number",
      inputSchema: z.object({
        preset: z.number().int().positive(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ preset, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = presetFire(preset);
      const edgeValue = buttonEdgeValue(edge);
      if (edgeValue === undefined) {
        await ctx.client.send(address);
      } else {
        await ctx.client.send(address, edgeValue);
      }
      return toolResult({ preset, address });
    }
  );
}
