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
      description: "Set a channel intensity from a DMX-style value (0-255), converted to percent",
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

      // Eos has no per-channel raw DMX entry over OSC (/eos/chan/N/dmx and "@ DMX" both
      // land near 1%). Convert 0-255 to an intensity percent and set it on the CLI instead.
      const percent = Math.round((dmx / 255) * 100);
      const text = `Chan ${channel} @ ${percent} Enter`;
      await ctx.client.send("/eos/newcmd", text);
      return jsonResult({
        ok: true,
        action: "channel_set_dmx",
        address: "/eos/newcmd",
        sent: text,
        channel,
        dmx,
        percent,
        note: "Converted DMX 0-255 to intensity percent; Eos sets levels in percent.",
      });
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
  server.registerTool(
    "set_xyz_focus",
    {
      description:
        "Aim channels at an XYZ point (decimal metres, Augment3d coordinates) via /eos/chan/<n>/xyz. " +
        "Needs each fixture's Augment3d position set (see set_fixture_3d). Optional intensity sets the level first. Live output change.",
      inputSchema: z.object({
        channels: z.array(z.number().int().positive()).min(1).max(100),
        x: z.number(),
        y: z.number(),
        z: z.number(),
        intensity: z.number().min(0).max(100).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channels, x, y, z: zz, intensity, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;
      const sent: string[] = [];
      if (ctx.listener.getState().consoleMode !== "live") {
        await ctx.client.send("/eos/newcmd", "Live Enter");
        sent.push("/eos/newcmd Live Enter");
      }
      for (const ch of channels) {
        await ctx.client.send(`/eos/chan/${ch}/xyz`, x, y, zz);
        sent.push(`/eos/chan/${ch}/xyz ${x} ${y} ${zz}`);
      }
      if (intensity !== undefined) {
        const line = `Chan ${channels.join(" + ")} @ ${intensity} Enter`;
        await ctx.client.send("/eos/newcmd", line);
        sent.push(`/eos/newcmd ${line}`);
      }
      return jsonResult({ ok: true, action: "set_xyz_focus", target: [x, y, zz], sent });
    }
  );
}
