import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { atLevel, channelDmx, channelLevel } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { sendChannelSelection, sendGroupSelection, sendLevelAdjust } from "../eos/selection.js";
import { channelSelectionFields, groupSelectionFields } from "../specs/lighting-ops.js";
import { gateLiveWrite, jsonResult, liveWriteFields } from "./helpers.js";

export function registerLevelTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "channel_select",
    {
      description:
        "Select channel(s) via /eos/chan with Thru / + support. Intensity levels use 0–100 (not fader 0–1).",
      inputSchema: z.object(channelSelectionFields),
    },
    async (input) => {
      try {
        const steps = await sendChannelSelection(ctx, input);
        return jsonResult({ ok: true, action: "channel_select", steps });
      } catch (error) {
        return jsonResult(
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          true
        );
      }
    }
  );

  server.registerTool(
    "channel_set_level",
    {
      description:
        "Set channel intensity 0–100 (percent, not fader 0–1). Supports selection + Thru/+ before @ level.",
      inputSchema: z.object({
        ...channelSelectionFields,
        level: z.number().min(0).max(100).optional(),
        adjust: z.enum(["plus", "minus"]).optional().describe("Use +% / -% keys instead of absolute level."),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ level, adjust, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const steps: string[] = [];
      const hasSelection =
        selection.channel !== undefined ||
        selection.from !== undefined ||
        (selection.channels?.length ?? 0) > 0 ||
        (selection.ranges?.length ?? 0) > 0;

      if (hasSelection) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }

      if (adjust !== undefined) {
        steps.push(await sendLevelAdjust(ctx, adjust));
        return jsonResult({ ok: true, action: "channel_set_level", steps, adjust });
      }

      if (level === undefined) {
        return jsonResult({ ok: false, error: "Provide level (0–100) or adjust=plus|minus." }, true);
      }

      const address = hasSelection && selection.channel !== undefined
        ? channelLevel(selection.channel)
        : atLevel();
      await ctx.client.send(address, level);
      steps.push(`${address}=${level}`);
      return jsonResult({ ok: true, action: "channel_set_level", steps, level });
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

      const address = channelDmx(channel);
      await ctx.client.send(address, dmx);
      return jsonResult({ ok: true, action: "channel_set_dmx", address, channel, dmx });
    }
  );

  server.registerTool(
    "group_select",
    {
      description: "Select group(s) via /eos/group with Thru / + support.",
      inputSchema: z.object(groupSelectionFields),
    },
    async (input) => {
      try {
        const steps = await sendGroupSelection(ctx, input);
        return jsonResult({ ok: true, action: "group_select", steps });
      } catch (error) {
        return jsonResult(
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          true
        );
      }
    }
  );

  server.registerTool(
    "group_set_level",
    {
      description: "Set a group intensity 0–100 (percent, not fader 0–1)",
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

      const address = `/eos/group/${group}`;
      await ctx.client.send(address, level);
      return jsonResult({ ok: true, action: "group_set_level", address, group, level });
    }
  );

  server.registerTool(
    "at_set_level",
    {
      description: "Set level for the current OSC selection via /eos/at (0–100)",
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
