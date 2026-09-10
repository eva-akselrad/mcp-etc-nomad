import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { atLevel, channelLevel, channelSelect, groupLevel } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { assertLiveAllowed } from "../eos/context.js";

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
      return {
        content: [{ type: "text" as const, text: `Selected channel ${channel}` }],
      };
    }
  );

  server.registerTool(
    "channel_set_level",
    {
      description: "Set a channel intensity (0-100)",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        level: z.number().min(0).max(100),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, level, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(channelLevel(channel), level);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ channel, level }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "channel_set_dmx",
    {
      description: "Set a channel DMX level (0-255)",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        dmx: z.number().int().min(0).max(255),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, dmx, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(`${channelLevel(channel)}/DMX`, dmx);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ channel, dmx }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "group_set_level",
    {
      description: "Set a group intensity (0-100)",
      inputSchema: z.object({
        group: z.number().int().positive(),
        level: z.number().min(0).max(100),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ group, level, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(groupLevel(group), level);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ group, level }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "at_set_level",
    {
      description: "Set level for the current OSC selection via /eos/at",
      inputSchema: z.object({
        level: z.number().min(0).max(100),
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ level, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      await ctx.client.send(atLevel(), level);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ level }, null, 2) }],
      };
    }
  );
}
