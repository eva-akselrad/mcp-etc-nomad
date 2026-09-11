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
import { sendChannelSelection, sendGroupSelection } from "../eos/selection.js";
import {
  channelSelectionFields,
  grandmasterLevelSchema,
  hasChannelSelection,
  highlightStateSchema,
} from "../specs/lighting-ops.js";
import { gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

async function sendCliStep(ctx: EosContext, line: string): Promise<string> {
  const cmd = buildCommand(line, "enter");
  await ctx.client.send("/eos/newcmd", cmd.text);
  return cmd.text;
}

function highlightEdge(state: "on" | "off" | "toggle"): "down" | "up" | "tap" {
  if (state === "on") return "down";
  if (state === "off") return "up";
  return "tap";
}

export function registerOperatorTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "grandmaster_set_level",
    {
      description:
        "Set grand master 0–100% via mapped OSC fader /eos/fader/0/1 (internal 0.0–1.0). Separate from blackout — never use GM=0 as BO.",
      inputSchema: z.object({
        level: grandmasterLevelSchema,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const faderValue = level / 100;
      const address = grandmasterLevel();
      await ctx.client.send(address, faderValue);
      return jsonResult({
        ok: true,
        action: "grandmaster_set_level",
        address,
        level,
        faderValue,
      });
    }
  );

  server.registerTool(
    "blackout",
    {
      description:
        "Console Blackout via /eos/key/blackout. Separate from grandmaster_set_level(0). Never Chan Thru Out.",
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
      description:
        "Highlight channel-check mode via /eos/key/highlight. With channels/ranges: select then highlight (default on). Without selection: mode only (state required). No level arg.",
      inputSchema: z.object({
        state: highlightStateSchema.optional(),
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ state, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const hasSelection = hasChannelSelection(selection);
      const effectiveState = state ?? (hasSelection ? "on" : undefined);
      if (!effectiveState) {
        return jsonResult(
          { ok: false, error: "Pass state (on|off|toggle) when no channel selection is given." },
          true
        );
      }

      const steps: string[] = [];
      if (hasSelection) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }

      const address = keyPress("highlight");
      const edge = highlightEdge(effectiveState);
      await sendButton(ctx, address, edge);
      steps.push(`${address} (${edge})`);

      return jsonResult({
        ok: true,
        action: "highlight",
        state: effectiveState,
        steps,
        address,
        edge,
      });
    }
  );

  server.registerTool(
    "rem_dim",
    {
      description:
        "Rem Dim via /eos/at/remdim, /eos/chan/{n}/remdim, /eos/group/{n}/remdim, or /eos/key/rem_dim. Same selection shape as highlight.",
      inputSchema: z.object({
        state: highlightStateSchema.optional(),
        group: z.number().int().positive().optional(),
        use_key: z.boolean().optional().describe("Force /eos/key/rem_dim instead of target remdim path."),
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ state, group, use_key, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const hasSelection = hasChannelSelection(selection) || group !== undefined;
      const effectiveState = state ?? (hasSelection ? "on" : undefined);
      if (!effectiveState) {
        return jsonResult(
          { ok: false, error: "Pass state (on|off|toggle) when no selection is given." },
          true
        );
      }

      const steps: string[] = [];
      if (group !== undefined) {
        steps.push(...(await sendGroupSelection(ctx, { group })));
      } else if (hasChannelSelection(selection)) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }

      const singleChannel =
        selection.channel !== undefined &&
        !(selection.channels?.length) &&
        !(selection.ranges?.length) &&
        selection.from === undefined;

      let address: string;
      if (use_key) {
        address = keyPress("rem_dim");
      } else if (group !== undefined) {
        address = groupRemdim(group);
      } else if (singleChannel) {
        address = channelRemdim(selection.channel!);
      } else if (hasSelection) {
        address = atRemdim();
      } else {
        address = keyPress("rem_dim");
      }

      const edge = highlightEdge(effectiveState);
      await sendButton(ctx, address, edge);
      steps.push(`${address} (${edge})`);

      return jsonResult({
        ok: true,
        action: "rem_dim",
        state: effectiveState,
        address,
        group,
        steps,
        edge,
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
        "Home selected targets via /eos/at/home, /eos/chan/{n}/home, /eos/group/{n}/home, fader home, or /eos/key/home. Selection required.",
      inputSchema: z.object({
        group: z.number().int().positive().optional(),
        faderBank: z.number().int().min(0).optional(),
        fader: z.number().int().positive().optional(),
        use_key: z.boolean().optional(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...channelSelectionFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ group, faderBank, fader, use_key, edge, confirm, allow_live, ...selection }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const hasChannel = hasChannelSelection(selection);
      const hasFader = faderBank !== undefined && fader !== undefined;
      const hasGroup = group !== undefined;

      if (!hasChannel && !hasGroup && !hasFader && !use_key) {
        return jsonResult(
          {
            ok: false,
            error:
              "home requires selection: channels/ranges, group, faderBank+fader, or use_key=true.",
          },
          true
        );
      }

      const steps: string[] = [];
      if (hasGroup) {
        steps.push(...(await sendGroupSelection(ctx, { group })));
      } else if (hasChannel) {
        steps.push(...(await sendChannelSelection(ctx, selection)));
      }

      const singleChannel =
        selection.channel !== undefined &&
        !(selection.channels?.length) &&
        !(selection.ranges?.length) &&
        selection.from === undefined;

      let address: string;
      if (use_key) {
        address = keyPress("home");
      } else if (hasGroup) {
        address = groupHome(group!);
      } else if (singleChannel) {
        address = channelHome(selection.channel!);
      } else if (hasFader) {
        address = faderAction(faderBank!, fader!, "home");
      } else if (hasChannel) {
        address = atHome();
      } else {
        address = keyPress("home");
      }

      await sendButton(ctx, address, edge);
      steps.push(address);

      return jsonResult({
        ok: true,
        action: "home",
        address,
        group,
        faderBank,
        fader,
        steps,
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
}
