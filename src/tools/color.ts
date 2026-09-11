import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { channelColorHs, channelColorRgb, channelParam, paramSet } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
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
        "Set RGB color on selection (/eos/color/rgb) or channel (/eos/chan/{n}/color/rgb). Components 0.0–1.0.",
      inputSchema: z.object({
        red: z.number().min(0).max(1),
        green: z.number().min(0).max(1),
        blue: z.number().min(0).max(1),
        channel: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ red, green, blue, channel, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = channelColorRgb(channel);
      await ctx.client.send(address, red, green, blue);
      return jsonResult({ ok: true, action: "color_set_rgb", address, red, green, blue, channel });
    }
  );

  server.registerTool(
    "channel_set_param",
    {
      description:
        "Set a moving-light parameter (pan, tilt, gobo, …) via /eos/chan/{n}/param/{name} (0–100) or /eos/param/{name} for selection.",
      inputSchema: z.object({
        param: z.string().describe("Parameter name, e.g. pan, tilt, gobo"),
        level: z.number().min(0).max(100),
        channel: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ param, level, channel, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = channel !== undefined ? channelParam(channel, param) : paramSet(param);
      await ctx.client.send(address, level);
      return jsonResult({ ok: true, action: "channel_set_param", address, param, level, channel });
    }
  );
}
