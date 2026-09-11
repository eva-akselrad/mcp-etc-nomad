import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  atHome,
  atRemdim,
  channelHome,
  channelRemdim,
  faderAction,
  grandmasterLevel,
  groupHome,
  groupRemdim,
  keyPress,
} from "../eos/addresses.js";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import {
  buildMakeManualCommand,
  buildParkCommand,
  buildSetCueTimingCommand,
  buildUnparkCommand,
} from "../eos/programming.js";
import { sendChannelSelection } from "../eos/selection.js";
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
        "Set grand master via mapped OSC fader /eos/fader/0/1 (0.0–1.0) after fader_bank_config. No /eos/gm. Readback on /eos/out/fader/... (~3s delay).",
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
        "Console Blackout via /eos/key/blackout. No /eos/blackout verb; never Chan Thru Out. Live-destructive.",
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
      description:
        "Park via CLI 'Chan N Park' (/eos/newcmd) or key /eos/key/park after channel select. Requires confirm + allow_live.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        method: z.enum(["cli", "key"]).optional().default("cli"),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, thru, method, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const steps: string[] = [];
      const transport = method ?? "cli";
      if (transport === "key") {
        steps.push(...(await sendChannelSelection(ctx, { channel, thru })));
        const address = keyPress("park");
        await sendButton(ctx, address);
        steps.push(address);
      } else {
        steps.push(await sendCliStep(ctx, buildParkCommand({ channel, thru })));
      }

      const parked = thru !== undefined
        ? Array.from({ length: thru - channel + 1 }, (_, i) => channel + i)
        : [channel];
      ctx.listener.getState().parkedChannels = [
        ...new Set([...ctx.listener.getState().parkedChannels, ...parked]),
      ];
      return jsonResult({ ok: true, action: "park_channel", method, steps, parked });
    }
  );

  server.registerTool(
    "unpark_channel",
    {
      description: "Unpark via CLI 'Chan N Unpark' (/eos/newcmd). Requires confirm + allow_live.",
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
      description: "Highlight channel-check mode via /eos/key/highlight.",
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
      description:
        "Rem Dim via /eos/at/remdim, /eos/chan/{n}/remdim, /eos/group/{n}/remdim, or /eos/key/rem_dim.",
      inputSchema: z.object({
        channel: z.number().int().positive().optional(),
        group: z.number().int().positive().optional(),
        use_key: z.boolean().optional().describe("Force /eos/key/rem_dim instead of target remdim path."),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, group, use_key, edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      let address: string;
      if (use_key) {
        address = keyPress("rem_dim");
      } else if (channel !== undefined) {
        address = channelRemdim(channel);
      } else if (group !== undefined) {
        address = groupRemdim(group);
      } else {
        address = atRemdim();
      }

      await sendButton(ctx, address, edge);
      return jsonResult({
        ok: true,
        action: "rem_dim",
        address,
        channel,
        group,
        edge: edge ?? "tap",
      });
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
      description: "Press [Sneak] via /eos/key/sneak (or CLI Sneak via eos_command).",
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
      description:
        "Home via /eos/at/home, /eos/chan/{n}/home, /eos/group/{n}/home, /eos/fader/{bank}/{n}/home, or /eos/key/home.",
      inputSchema: z.object({
        channel: z.number().int().positive().optional(),
        group: z.number().int().positive().optional(),
        faderBank: z.number().int().min(0).optional(),
        fader: z.number().int().positive().optional(),
        use_key: z.boolean().optional(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, group, faderBank, fader, use_key, edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      let address: string;
      if (use_key) {
        address = keyPress("home");
      } else if (channel !== undefined) {
        address = channelHome(channel);
      } else if (group !== undefined) {
        address = groupHome(group);
      } else if (faderBank !== undefined && fader !== undefined) {
        address = faderAction(faderBank, fader, "home");
      } else {
        address = atHome();
      }

      await sendButton(ctx, address, edge);
      return jsonResult({
        ok: true,
        action: "home",
        address,
        channel,
        group,
        faderBank,
        fader,
        edge: edge ?? "tap",
      });
    }
  );

  server.registerTool(
    "make_manual",
    {
      description: "Make Manual via /eos/newcmd only (no OSC verb). Required after Go before Update.",
      inputSchema: z.object({
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const sent = await sendCliStep(ctx, buildMakeManualCommand());
      return jsonResult({ ok: true, action: "make_manual", path: "/eos/newcmd", sent });
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
      description:
        "Quick-save show via Shift+Update (/eos/key/shift hold + /eos/key/update). No OSC Save verb; full save uses Browser on desk. System-class confirm required.",
      inputSchema: z.object({
        confirm_save: z
          .boolean()
          .optional()
          .describe("Required when EOS_REQUIRE_CONFIRM=true — explicit save confirmation."),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm_save, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      if (ctx.config.requireConfirm && !confirm_save) {
        return jsonResult(
          {
            ok: false,
            error:
              "Pass confirm_save=true for show quick-save (EOS_REQUIRE_CONFIRM=true). Full save path requires Browser on desk.",
          },
          true
        );
      }

      const shiftAddress = keyPress("shift");
      const updateAddress = keyPress("update");
      await sendButton(ctx, shiftAddress, "down");
      await sendButton(ctx, updateAddress);
      await sendButton(ctx, shiftAddress, "up");

      return jsonResult({
        ok: true,
        action: "show_save",
        method: "shift_update",
        steps: [shiftAddress, updateAddress],
        note: "Quick-save only. No invented USB/path — use Browser on desk for named saves.",
      });
    }
  );
}
