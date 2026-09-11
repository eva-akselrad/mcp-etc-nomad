import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { atLevel, channelLevel, channelSelect, groupLevel } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { gateLiveWrite, jsonResult, liveWriteFields } from "./helpers.js";

export function registerLevelTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "channel_select",
    {
      description: "Select an Eos channel (leaves command line unterminated)",
      inputSchema: z.object({
        channel: z.number().int().positive(),
      }),
    },
    async ({ channel }) => {
      await ctx.client.send(channelSelect(), channel);
      return jsonResult({ ok: true, action: "channel_select", channel });
    }
  );

  server.registerTool(
    "channel_set_level",
    {
      description: "Set a channel intensity (0-100). Live writes need allow_live unless EOS_ALLOW_LIVE=true.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        level: z.number().min(0).max(100),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = channelLevel(channel);
      await ctx.client.send(address, level);
      return jsonResult({ ok: true, action: "channel_set_level", address, channel, level });
    }
  );

  server.registerTool(
    "channel_set_dmx",
    {
      description: "Set a channel DMX level (0-255)",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        dmx: z.number().int().min(0).max(255),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, dmx, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = `${channelLevel(channel)}/DMX`;
      await ctx.client.send(address, dmx);
      return jsonResult({ ok: true, action: "channel_set_dmx", address, channel, dmx });
    }
  );

  server.registerTool(
    "group_set_level",
    {
      description: "Set a group intensity (0-100)",
      inputSchema: z.object({
        group: z.number().int().positive(),
        level: z.number().min(0).max(100),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ group, level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = groupLevel(group);
      await ctx.client.send(address, level);
      return jsonResult({ ok: true, action: "group_set_level", address, group, level });
    }
  );

  server.registerTool(
    "at_set_level",
    {
      description: "Set level for the current OSC selection via /eos/at",
      inputSchema: z.object({
        level: z.number().min(0).max(100),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      await ctx.client.send(atLevel(), level);
      return jsonResult({ ok: true, action: "at_set_level", level });
    }
  );
}
