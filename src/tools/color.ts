import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { channelColorHs, channelColorRgb, channelParam, paramSet } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { rgbPercentSchema } from "../specs/lighting-ops.js";
import { gateLiveWrite, jsonResult, liveWriteFields } from "./helpers.js";

export function registerColorTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "color_set_hs",
    {
      description:
        "Set hue/saturation on selection (/eos/color/hs) or a channel (/eos/chan/{n}/color/hs). Hue 0–360, saturation 0–100.",
      inputSchema: z.object({
        hue: z.number().min(0).max(360),
        saturation: z.number().min(0).max(100),
        channel: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ hue, saturation, channel, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = channelColorHs(channel);
      await ctx.client.send(address, hue, saturation);
      return jsonResult({ ok: true, action: "color_set_hs", address, hue, saturation, channel });
    }
  );

  server.registerTool(
    "color_set_rgb",
    {
      description:
        "Set RGB color on selection (/eos/color/rgb) or channel (/eos/chan/{n}/color/rgb). Components r/g/b 0–100 (mapped to OSC 0.0–1.0).",
      inputSchema: z.object({
        r: rgbPercentSchema,
        g: rgbPercentSchema,
        b: rgbPercentSchema,
        channel: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ r, g, b, channel, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = channelColorRgb(channel);
      const oscR = r / 100;
      const oscG = g / 100;
      const oscB = b / 100;
      await ctx.client.send(address, oscR, oscG, oscB);
      return jsonResult({
        ok: true,
        action: "color_set_rgb",
        address,
        r,
        g,
        b,
        osc: { r: oscR, g: oscG, b: oscB },
        channel,
      });
    }
  );

  server.registerTool(
    "channel_set_param",
    {
      description:
        "Set a moving-light parameter (pan, tilt, gobo, …) via /eos/chan/{n}/param/{name} or /eos/param/{name} for selection. value 0–100.",
      inputSchema: z.object({
        param: z.string().describe("Parameter name, e.g. pan, tilt, gobo"),
        value: z.number().min(0).max(100).describe("Parameter value 0–100 (canonical)."),
        level: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Deprecated alias of value."),
        channel: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ param, value, level, channel, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const effectiveValue = value ?? level;
      if (effectiveValue === undefined) {
        return jsonResult({ ok: false, error: "Pass value (0–100) for channel_set_param." }, true);
      }

      const address = channel !== undefined ? channelParam(channel, param) : paramSet(param);
      await ctx.client.send(address, effectiveValue);
      return jsonResult({
        ok: true,
        action: "channel_set_param",
        address,
        param,
        value: effectiveValue,
        channel,
      });
    }
  );
}
