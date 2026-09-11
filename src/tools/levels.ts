import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { atLevel, channelLevel, channelSelect, groupLevel } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { checkLiveWrite, toolError, toolResult } from "./helpers.js";

const liveSchema = {
  confirm: z.boolean().optional(),
  allowLive: z.boolean().optional(),
};

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
      return toolResult({ channel });
    }
  );

  server.registerTool(
    "channel_set_level",
    {
      description: "Set a channel intensity (0-100)",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        level: z.number().min(0).max(100),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, level, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      await ctx.client.send(channelLevel(channel), level);
      return toolResult({ channel, level });
    }
  );

  server.registerTool(
    "channel_set_dmx",
    {
      description: "Set a channel DMX level (0-255)",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        dmx: z.number().int().min(0).max(255),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, dmx, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      await ctx.client.send(`${channelLevel(channel)}/DMX`, dmx);
      return toolResult({ channel, dmx });
    }
  );

  server.registerTool(
    "group_set_level",
    {
      description: "Set a group intensity (0-100)",
      inputSchema: z.object({
        group: z.number().int().positive(),
        level: z.number().min(0).max(100),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ group, level, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      await ctx.client.send(groupLevel(group), level);
      return toolResult({ group, level });
    }
  );

  server.registerTool(
    "at_set_level",
    {
      description: "Set level for the current OSC selection via /eos/at",
      inputSchema: z.object({
        level: z.number().min(0).max(100),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ level, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      await ctx.client.send(atLevel(), level);
      return toolResult({ level });
    }
  );
}
