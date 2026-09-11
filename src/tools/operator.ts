import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { grandmasterLevel, keyPress } from "../eos/addresses.js";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import {
  buildMakeManualCommand,
  buildParkCommand,
  buildSetCueTimingCommand,
  buildShowSaveCommand,
  buildUnparkCommand,
} from "../eos/programming.js";
import { gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

async function sendCliStep(ctx: EosContext, line: string): Promise<string> {
  const cmd = buildCommand(line, "enter");
  await ctx.client.send("/eos/newcmd", cmd.text);
  return cmd.text;
}

export function registerOperatorTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "grandmaster_set_level",
    {
      description:
        "Set grand master level via /eos/fader/0/1 (0.0–1.0). First-class GM — not channel intensity.",
      inputSchema: z.object({
        level: z.number().min(0).max(1),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = grandmasterLevel();
      await ctx.client.send(address, level);
      return jsonResult({ ok: true, action: "grandmaster_set_level", address, level });
    }
  );

  server.registerTool(
    "blackout",
    {
      description:
        "Toggle console Blackout (BO) via /eos/key/blackout. Never uses Chan Thru Out.",
      inputSchema: z.object({
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("blackout");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "blackout", address, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "park_channel",
    {
      description: "Park channel(s) via CLI Park. Keeps output at park level.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, thru, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const sent = await sendCliStep(ctx, buildParkCommand({ channel, thru }));
      const parked = thru !== undefined
        ? Array.from({ length: thru - channel + 1 }, (_, i) => channel + i)
        : [channel];
      ctx.listener.getState().parkedChannels = [
        ...new Set([...ctx.listener.getState().parkedChannels, ...parked]),
      ];
      return jsonResult({ ok: true, action: "park_channel", sent, parked });
    }
  );

  server.registerTool(
    "unpark_channel",
    {
      description: "Unpark channel(s) via CLI Unpark.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, thru, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const sent = await sendCliStep(ctx, buildUnparkCommand({ channel, thru }));
      const unparked = thru !== undefined
        ? Array.from({ length: thru - channel + 1 }, (_, i) => channel + i)
        : [channel];
      ctx.listener.getState().parkedChannels = ctx.listener
        .getState()
        .parkedChannels.filter((ch) => !unparked.includes(ch));
      return jsonResult({ ok: true, action: "unpark_channel", sent, unparked });
    }
  );

  server.registerTool(
    "get_parked",
    {
      description: "Return channels parked this session (CLI park/unpark tracking + sync hint).",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        parkedChannels: state.parkedChannels,
        count: state.parkedChannels.length,
        note: "Run sync_show_targets patch=true for full patch state; park list is session-tracked.",
      });
    }
  );

  server.registerTool(
    "highlight",
    {
      description: "Enter Highlight channel-check mode via /eos/key/highlight.",
      inputSchema: z.object({
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("highlight");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "highlight", address, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "rem_dim",
    {
      description: "Rem Dim — dim unselected channels via /eos/key/rem_dim.",
      inputSchema: z.object({
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("rem_dim");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "rem_dim", address, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "timing_disable",
    {
      description: "Press [Timing Disable] via /eos/key/timing_disable.",
      inputSchema: z.object({
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("timing_disable");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "timing_disable", address, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "sneak",
    {
      description: "Press [Sneak] via /eos/key/sneak.",
      inputSchema: z.object({
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("sneak");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "sneak", address, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "home",
    {
      description: "Press [Home] on current selection via /eos/key/home.",
      inputSchema: z.object({
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("home");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "home", address, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "make_manual",
    {
      description: "Make Manual via CLI — required after Go before Update commits manual values.",
      inputSchema: z.object({
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const sent = await sendCliStep(ctx, buildMakeManualCommand());
      return jsonResult({ ok: true, action: "make_manual", sent });
    }
  );

  server.registerTool(
    "set_cue_timing",
    {
      description:
        "Set cue timing (Time, Delay, Follow/Hang, down, focus/color/beam, Block) via CLI.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        upTime: z.string().optional(),
        upDelay: z.string().optional(),
        downTime: z.string().optional(),
        downDelay: z.string().optional(),
        focusTime: z.string().optional(),
        colorTime: z.string().optional(),
        beamTime: z.string().optional(),
        follow: z.boolean().optional(),
        hang: z.string().optional(),
        block: z.boolean().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      const sent = await sendCliStep(ctx, buildSetCueTimingCommand(args));
      return jsonResult({ ok: true, action: "set_cue_timing", sent, cueList: args.cueList, cue: args.cue });
    }
  );

  server.registerTool(
    "show_save",
    {
      description: "Save show now via CLI (path required). confirm=true when EOS_REQUIRE_CONFIRM=true.",
      inputSchema: z.object({
        path: z.string().describe('Save destination, e.g. "usb1:/show.esf2"'),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ path, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const sent = await sendCliStep(ctx, buildShowSaveCommand(path));
      return jsonResult({ ok: true, action: "show_save", sent, path });
    }
  );
}
