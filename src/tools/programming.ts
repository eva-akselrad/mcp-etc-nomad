import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  setCueLabel,
  setGroupChannels,
  setGroupLabel,
  setPaletteLabel,
  setPresetLabel,
  type PaletteType,
} from "../eos/addresses.js";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import {
  asProgrammingSteps,
  buildCopyCommand,
  buildCueMoveCommand,
  buildDeleteCommand,
  buildEffectMoveCommand,
  buildGroupFromChannelsCommand,
  buildLabelCommand,
  buildPatchCommand,
  buildPatchCopyCommand,
  buildPatchMoveCommand,
  buildRecordCommand,
  buildUnpatchCommand,
  buildUpdateCommand,
  type ProgrammingTarget,
  type RecordMode,
  type RecordStyle,
  type UpdateScope,
} from "../eos/programming.js";
import { syncShowTargets } from "../eos/sync.js";
import { formatGroupChannelsString } from "../eos/show-types.js";
import { ensurePatchDisplay, gateDestructiveWrite, gateLiveWrite, jsonResult, liveWriteFields } from "./helpers.js";

const programmingTargetSchema = z.enum([
  "cue",
  "group",
  "preset",
  "effect",
  "macro",
  "snapshot",
  "curve",
  "pixmap",
  "ms",
  "sub",
  "ip",
  "fp",
  "cp",
  "bp",
]);

const paletteTypeSchema = z.enum(["ip", "fp", "cp", "bp"]);

const destructiveFields = {
  confirm_delete: z
    .boolean()
    .optional()
    .describe(
      "Required for delete/unpatch when EOS_REQUIRE_CONFIRM=true (destructive double-confirm)."
    ),
};

const programmingTransportFields = {
  style: z
    .enum(["one_shot", "two_step"])
    .optional()
    .describe("one_shot or two_step (Cue N then Record/Update via separate /eos/newcmd lines)."),
  refresh_cache: z
    .boolean()
    .optional()
    .describe("Re-run sync_show_targets after success (default true)."),
};

type SendOptions = {
  confirm?: boolean;
  allow_live?: boolean;
  refresh_cache?: boolean;
  cueList?: number;
  /** Metadata labels skip live/confirm gates (Dictionary /eos/set or Label CLI). */
  gateLive?: boolean;
  /** Runs after the CLI steps are sent, before the cache refresh. */
  afterSend?: () => Promise<string | undefined>;
};

/** Programming uses /eos/newcmd — no /eos/record verb. */
async function sendProgrammingSteps(
  ctx: EosContext,
  built: string | ReturnType<typeof buildRecordCommand>,
  options: SendOptions
): Promise<ReturnType<typeof jsonResult>> {
  if (options.gateLive !== false) {
    const blocked = gateLiveWrite(ctx, options);
    if (blocked) return blocked;
  }

  const { steps, style, notes } = asProgrammingSteps(built);
  const sent: string[] = [];

  for (const step of steps) {
    const cmd = buildCommand(step, "enter");
    await ctx.client.send("/eos/newcmd", cmd.text);
    sent.push(cmd.text);
  }

  if (options.afterSend) {
    const extra = await options.afterSend();
    if (extra) sent.push(extra);
  }

  let refresh: Awaited<ReturnType<typeof syncShowTargets>> | undefined;
  if (options.refresh_cache !== false) {
    try {
      refresh = await syncShowTargets(ctx.client, ctx.listener, {
        groups: true,
        cueLists: true,
        cues: options.cueList !== undefined ? [options.cueList] : undefined,
        presets: true,
        palettes: true,
        subscribe: false,
        timeoutMs: 5000,
      });
    } catch {
      refresh = undefined;
    }
  }

  return jsonResult({
    ok: true,
    action: "programming",
    path: "/eos/newcmd",
    style,
    sent,
    notes: [
      ...(notes ?? []),
      "No /eos/record verb — programming is CLI via /eos/newcmd only.",
      "String RX must be on or commands silently fail. Prefer Blind for programming.",
      refresh ? "Cache refreshed via sync_show_targets." : "Call sync_show_targets before trusting resources.",
    ],
    refresh,
    eosVersion: ctx.config.eosVersion,
  });
}

export function registerProgrammingTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "record_cue",
    {
      description:
        "Record programmer look into a cue via /eos/newcmd. No OSC Record verb. Prefer Blind.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        label: z.string().optional(),
        block: z.boolean().optional(),
        merge: z.boolean().optional(),
        time: z.string().optional(),
        mode: z.enum(["record", "record_only"]).optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const text = buildRecordCommand({
        target: "cue",
        number: args.cue,
        cueList: args.cueList,
        part: args.part,
        label: args.label,
        block: args.block,
        merge: args.merge,
        time: args.time,
        mode: args.mode as RecordMode | undefined,
        style: args.style as RecordStyle | undefined,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
        cueList: args.cueList,
        afterSend: args.label
          ? async () => {
              const path = setCueLabel(args.cueList ?? 1, args.cue);
              await ctx.client.send(path, args.label as string);
              return `${path} ${JSON.stringify(args.label)}`;
            }
          : undefined,
      });
    }
  );

  server.registerTool(
    "update_cue",
    {
      description: "Update cue from manual/red values via /eos/newcmd. Use scope; Make Manual after Go.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]).optional(),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        block: z.boolean().optional(),
        merge: z.boolean().optional(),
        time: z.string().optional(),
        scope: z.enum(["all", "cue_only", "track"]).optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const mode = ctx.listener.getState().consoleMode;
      if ((mode === "live" || mode === "unknown") && args.cue === undefined) {
        return jsonResult(
          {
            ok: false,
            error:
              "update_cue refuses Live update without an explicit cue number. Pass cue= and allow_live=true.",
          },
          true
        );
      }

      const text = buildUpdateCommand({
        target: "cue",
        number: args.cue,
        cueList: args.cueList,
        part: args.part,
        block: args.block,
        merge: args.merge,
        time: args.time,
        scope: args.scope as UpdateScope | undefined,
        style: args.style as RecordStyle | undefined,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
        cueList: args.cueList,
      });
    }
  );

  server.registerTool(
    "record_group",
    {
      description:
        "Record channels into a group via /eos/newcmd. Supports current selection, discrete channels, or Thru ranges.",
      inputSchema: z.object({
        group: z.number().int().positive(),
        channelFrom: z.number().int().positive().optional(),
        channelThru: z.number().int().positive().optional(),
        channels: z.array(z.number().int().positive()).optional(),
        ranges: z
          .array(z.object({ from: z.number().int().positive(), thru: z.number().int().positive() }))
          .optional(),
        use_current_selection: z.boolean().optional(),
        label: z.string().optional(),
        mode: z.enum(["record", "record_only"]).optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const text = buildGroupFromChannelsCommand({
        group: args.group,
        channelFrom: args.channelFrom,
        channelThru: args.channelThru,
        channels: args.channels,
        ranges: args.ranges,
        useCurrentSelection: args.use_current_selection,
        label: args.label,
        mode: args.mode as RecordMode | undefined,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
        afterSend: args.label
          ? async () => {
              const path = setGroupLabel(args.group);
              await ctx.client.send(path, args.label as string);
              return `${path} ${JSON.stringify(args.label)}`;
            }
          : undefined,
      });
    }
  );

  server.registerTool(
    "record_preset",
    {
      description: "Record current selection into a preset via /eos/newcmd.",
      inputSchema: z.object({
        preset: z.number().int().positive(),
        mode: z.enum(["record", "record_only"]).optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const text = buildRecordCommand({
        target: "preset",
        number: args.preset,
        mode: args.mode as RecordMode | undefined,
        style: args.style as RecordStyle | undefined,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
      });
    }
  );

  server.registerTool(
    "record_palette",
    {
      description: "Record current selection into an intensity/focus/color/beam palette via /eos/newcmd.",
      inputSchema: z.object({
        type: paletteTypeSchema,
        palette: z.number().int().positive(),
        mode: z.enum(["record", "record_only"]).optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const text = buildRecordCommand({
        target: args.type as ProgrammingTarget,
        number: args.palette,
        mode: args.mode as RecordMode | undefined,
        style: args.style as RecordStyle | undefined,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
      });
    }
  );

  server.registerTool(
    "copy_target",
    {
      description: 'Copy targets via CLI: "Copy Cue 1 Thru 5 Cue 10". Patch copy uses patch_copy_to.',
      inputSchema: z.object({
        sourceType: programmingTargetSchema,
        sourceFrom: z.union([z.number(), z.string()]),
        sourceThru: z.union([z.number(), z.string()]).optional(),
        sourceCueList: z.number().int().positive().optional(),
        destType: programmingTargetSchema,
        dest: z.union([z.number(), z.string()]),
        destCueList: z.number().int().positive().optional(),
        time: z.string().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const text = buildCopyCommand({
        sourceType: args.sourceType as ProgrammingTarget,
        sourceFrom: args.sourceFrom,
        sourceThru: args.sourceThru,
        sourceCueList: args.sourceCueList,
        destType: args.destType as ProgrammingTarget,
        dest: args.dest,
        destCueList: args.destCueList,
        time: args.time,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
        cueList: args.destCueList ?? args.sourceCueList,
      });
    }
  );

  server.registerTool(
    "move_target",
    {
      description:
        'Move cues or effects: "Move Cue 5 At Cue 10" or "Move Effect 1 At Effect 2". Patch move uses patch_move.',
      inputSchema: z.object({
        sourceType: z.enum(["cue", "effect"]),
        source: z.union([z.number(), z.string()]),
        sourceCueList: z.number().int().positive().optional(),
        destType: z.enum(["cue", "effect"]),
        dest: z.union([z.number(), z.string()]),
        destCueList: z.number().int().positive().optional(),
        time: z.string().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      let text: string;
      if (args.sourceType === "effect" && args.destType === "effect") {
        text = buildEffectMoveCommand({ source: args.source, dest: args.dest });
      } else if (args.sourceType === "cue" && args.destType === "cue") {
        text = buildCueMoveCommand({
          source: args.source,
          dest: args.dest,
          sourceCueList: args.sourceCueList,
          destCueList: args.destCueList,
          time: args.time,
        });
      } else {
        return jsonResult({ ok: false, error: "Cross-type move not supported." }, true);
      }
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
        cueList: args.destCueList ?? args.sourceCueList,
      });
    }
  );

  server.registerTool(
    "delete_target",
    {
      description:
        "Delete show targets via /eos/newcmd. Requires confirm + confirm_delete. Sneak/Home/Out are NOT Delete.",
      inputSchema: z.object({
        target: programmingTargetSchema,
        from: z.union([z.number(), z.string()]),
        thru: z.union([z.number(), z.string()]).optional(),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
        ...destructiveFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateDestructiveWrite(ctx, {
        confirm: args.confirm,
        confirm_delete: args.confirm_delete,
        allow_live: args.allow_live,
      });
      if (blocked) return blocked;

      const text = buildDeleteCommand({
        target: args.target as ProgrammingTarget,
        from: args.from,
        thru: args.thru,
        cueList: args.cueList,
        part: args.part,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
        cueList: args.cueList,
      });
    }
  );

  server.registerTool(
    "label_target",
    {
      description:
        "Set a label via OSC /eos/set/<target>/<n>/label: groups, cues, presets, palettes, macros, subs, effects, curves, snapshots, pixel maps, magic sheets, patch channels (number = channel), cue lists.",
      inputSchema: z.object({
        target: z.enum([
          "group",
          "cue",
          "preset",
          "ip",
          "fp",
          "cp",
          "bp",
          "macro",
          "sub",
          "effect",
          "curve",
          "snap",
          "pixmap",
          "ms",
          "patch",
          "cuelist",
        ]),
        number: z.union([z.number(), z.string()]),
        label: z.string(),
        cueList: z.number().int().positive().optional(),
      }),
    },
    async (args) => {
      const n = Number(args.number);
      let path: string;
      if (args.target === "group") {
        path = setGroupLabel(n);
      } else if (args.target === "cue" && args.cueList !== undefined) {
        path = setCueLabel(args.cueList, args.number);
      } else if (["macro", "sub", "effect", "curve", "snap", "pixmap", "ms", "patch", "cuelist"].includes(args.target)) {
        // Direct OSC label set (Eos v3.2 manual, OSC Set): /eos/set/<target>/<n>/label.
        const seg = args.target === "effect" ? "fx" : args.target;
        path = `/eos/set/${seg}/${n}/label`;
      } else if (args.target === "preset") {
        path = setPresetLabel(n);
      } else if (["ip", "fp", "cp", "bp"].includes(args.target)) {
        path = setPaletteLabel(args.target as PaletteType, n);
      } else {
        const text = buildLabelCommand({
          target: args.target as ProgrammingTarget,
          number: args.number,
          label: args.label,
          cueList: args.cueList,
        });
        return sendProgrammingSteps(ctx, text, {
          refresh_cache: false,
          gateLive: false,
        });
      }

      await ctx.client.send(path, args.label);
      return jsonResult({ ok: true, action: "label_target", path, label: args.label });
    }
  );

  server.registerTool(
    "set_fixture_3d",
    {
      description:
        "Set Augment3d position (metres) and orientation (degrees; 0/0/0 = pointing straight down) for one or more " +
        "channels via the Patch-display command line (Chan N Position x / y / z; Chan N Orientation x / y / z). Reads each one back to verify. " +
        "Patch data only (no output change), but it edits the show, so EOS_REQUIRE_CONFIRM applies.",
      inputSchema: z.object({
        fixtures: z
          .array(
            z.object({
              channel: z.number().int().positive(),
              part: z.number().int().positive().optional(),
              position: z.tuple([z.number(), z.number(), z.number()]),
              orientation: z.tuple([z.number(), z.number(), z.number()]).optional(),
            })
          )
          .min(1)
          .max(200),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ fixtures, confirm, allow_live }) => {
      void allow_live;
      if (ctx.config.requireConfirm && !confirm) {
        return jsonResult({ ok: false, error: "Pass confirm=true to execute this action (EOS_REQUIRE_CONFIRM=true)." }, true);
      }
      const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
      const results: Array<Record<string, unknown>> = [];
      for (const f of fixtures) {
        const part = f.part ?? 1;
        const ori = f.orientation ?? [0, 0, 0];
        // The OSC /eos/set/.../augment3d/position setter is accepted but not stored (Eos 3.2, verified);
        // the Patch-display command line works: "Chan N Position x / y / z" [+ "Chan N Orientation ...].
        const value = [...f.position, ...ori].map(fmt).join(",");
        const chanRef = part > 1 ? `Chan ${f.channel} Part ${part}` : `Chan ${f.channel}`;
        await ctx.client.send("/eos/newcmd", "Patch Enter");
        await ctx.client.send("/eos/newcmd", `${chanRef} Position ${f.position.map(fmt).join(" / ")} Enter`);
        if (f.orientation) {
          await ctx.client.send("/eos/newcmd", `${chanRef} Orientation ${ori.map(fmt).join(" / ")} Enter`);
        }
        await new Promise((res) => setTimeout(res, 150));
        let readback: unknown = undefined;
        let match = false;
        try {
          await ctx.client.send(`/eos/get/patch/${f.channel}/${part}/augment3d/position`);
          const msg = await ctx.listener.waitFor(
            new RegExp(`^/eos/out/get/patch/${f.channel}/${part}/augment3d/position(?:/list/\\d+/\\d+)?$`),
            2000
          );
          const got = msg.args.slice(2, 8).map((a) => (typeof a === "number" ? a : NaN));
          readback = got;
          const want = [...f.position, ...ori];
          match = got.every((g, i) => Math.abs(g - want[i]) < 0.01);
        } catch {
          readback = "no reply";
        }
        results.push({ channel: f.channel, part, sent: value, readback, match });
      }
      return jsonResult({
        ok: results.every((r) => r.match),
        action: "set_fixture_3d",
        results,
        summary: `${results.filter((r) => r.match).length} of ${results.length} verified.`,
      });
    }
  );

  server.registerTool(
    "patch_set_info",
    {
      description:
        "Set a patched channel's label, notes and/or gel via OSC (/eos/set/patch/<ch>/label|notes|gel). " +
        "Text only — does not change addresses or fixture types.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        label: z.string().optional(),
        notes: z.string().optional(),
        gel: z.string().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ channel, label, notes, gel, confirm, allow_live }) => {
      // Text metadata only (no output change), so no Live gate — but still honour EOS_REQUIRE_CONFIRM.
      void allow_live;
      if (ctx.config.requireConfirm && !confirm) {
        return jsonResult({ ok: false, error: "Pass confirm=true to execute this action (EOS_REQUIRE_CONFIRM=true)." }, true);
      }
      const sent: string[] = [];
      for (const [field, value] of [["label", label], ["notes", notes], ["gel", gel]] as const) {
        if (value === undefined) continue;
        const path = `/eos/set/patch/${channel}/${field}`;
        await ctx.client.send(path, value);
        sent.push(`${path} ${JSON.stringify(value)}`);
      }
      if (!sent.length) return jsonResult({ ok: false, error: "Provide label, notes or gel." }, true);
      return jsonResult({ ok: true, action: "patch_set_info", channel, sent });
    }
  );

  server.registerTool(
    "group_set_channels",
    {
      description:
        'Set group channel membership via /eos/set/group/{n}/chans. Thru ranges as "from > thru" (Dictionary).',
      inputSchema: z.object({
        group: z.number().int().positive(),
        channels: z.array(z.number().int().positive()).optional(),
        ranges: z
          .array(
            z.object({
              from: z.number().int().positive(),
              thru: z.number().int().positive(),
            })
          )
          .optional(),
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      const chans = formatGroupChannelsString({
        channels: args.channels,
        ranges: args.ranges,
      });
      const path = setGroupChannels(args.group);
      await ctx.client.send(path, chans);
      return jsonResult({ ok: true, action: "group_set_channels", path, chans });
    }
  );

  // --- Patch helpers (eos-patch prompt); still CLI via newcmd ---

  server.registerTool(
    "patch_channel",
    {
      description:
        "Patch a channel's address in the Patch display ('997 Address 10 / 1'). To give it a fixture type, " +
        "pass copyTypeFrom = an already-patched channel of that type: Eos copies its patch (type included), " +
        "then the address is set. Fixture types otherwise come only from the on-screen library ({Type}).",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        copyTypeFrom: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Existing channel whose fixture type to copy (verified: 201 Force 2 -> 997)"),
        fixtureType: z.string().optional().describe("Not supported over OSC — use copyTypeFrom"),
        fixtureTypeNumber: z.number().int().positive().optional().describe("Not supported over OSC — use copyTypeFrom"),
        address: z.number().int().nonnegative().optional(),
        universe: z.number().int().positive().optional(),
        enter_patch_display: z.boolean().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      if (args.fixtureType !== undefined || args.fixtureTypeNumber !== undefined) {
        return jsonResult(
          {
            ok: false,
            error:
              "Eos has no command-line form for choosing a fixture type (it is picked from the {Type} library on screen). " +
              "Pass copyTypeFrom with a channel already patched as that type, or pick the type on the desk.",
          },
          true
        );
      }
      if (args.copyTypeFrom !== undefined && args.thru !== undefined) {
        return jsonResult({ ok: false, error: "copyTypeFrom works on one channel at a time." }, true);
      }
      const forcePatchDisplay = ensurePatchDisplay(ctx) || args.enter_patch_display;
      const built = buildPatchCommand({
        channel: args.channel,
        thru: args.thru,
        address: args.address,
        universe: args.universe,
        enterPatchDisplay: forcePatchDisplay,
      });
      let text = built;
      if (args.copyTypeFrom !== undefined) {
        // "201 Copy_To 997" copies the patch (fixture type + address); then re-address the copy.
        const steps = typeof built === "string" ? [built] : [...built.steps];
        const at = forcePatchDisplay ? 1 : 0;
        steps.splice(at, 0, `${args.copyTypeFrom} Copy_To ${args.channel}`);
        if (args.address === undefined) {
          // Without a new address the copy shares the source's address (double patch).
          steps.splice(at + 1, 1);
        }
        text = {
          style: "two_step",
          steps,
          notes: [
            `Fixture type copied from channel ${args.copyTypeFrom}.`,
            ...(args.address === undefined
              ? ["No address given: the copy shares the source channel's address until you re-address it."]
              : []),
          ],
        };
      }
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
      });
    }
  );

  server.registerTool(
    "patch_copy_to",
    {
      description: 'Patch copy: "111 Copy To 116". Not live channel Copy To.',
      inputSchema: z.object({
        sourceChannel: z.number().int().positive(),
        destChannel: z.number().int().positive(),
        enter_patch_display: z.boolean().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const forcePatchDisplay = ensurePatchDisplay(ctx) || args.enter_patch_display;
      const built = forcePatchDisplay
        ? { style: "two_step" as const, steps: ["Patch", buildPatchCopyCommand(args)] }
        : buildPatchCopyCommand(args);
      return sendProgrammingSteps(ctx, built, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
      });
    }
  );

  server.registerTool(
    "patch_move",
    {
      description: 'Patch move: "116 Copy To Copy To 120" (double Copy To).',
      inputSchema: z.object({
        sourceChannel: z.number().int().positive(),
        destChannel: z.number().int().positive(),
        enter_patch_display: z.boolean().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const forcePatchDisplay = ensurePatchDisplay(ctx) || args.enter_patch_display;
      const line = buildPatchMoveCommand(args);
      const built = forcePatchDisplay
        ? { style: "two_step" as const, steps: ["Patch", line] }
        : line;
      return sendProgrammingSteps(ctx, built, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
      });
    }
  );

  server.registerTool(
    "unpatch_channel",
    {
      description: "Unpatch ≠ delete channel data. Requires confirm + confirm_delete.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        enter_patch_display: z.boolean().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
        ...destructiveFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateDestructiveWrite(ctx, {
        confirm: args.confirm,
        confirm_delete: args.confirm_delete,
        allow_live: args.allow_live,
      });
      if (blocked) return blocked;

      const forcePatchDisplay = ensurePatchDisplay(ctx) || args.enter_patch_display;
      const line = buildUnpatchCommand({ channel: args.channel, thru: args.thru });
      const built = forcePatchDisplay
        ? { style: "two_step" as const, steps: ["Patch", line] }
        : line;
      return sendProgrammingSteps(ctx, built, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
      });
    }
  );

  // --- Sync + get_* (Dictionary /eos/get → /eos/out/get multipart) ---

  server.registerTool(
    "sync_show_targets",
    {
      description:
        "Refresh show cache via /eos/get/* multipart replies. Run after record/copy/delete.",
      inputSchema: z.object({
        groups: z.boolean().optional(),
        cueLists: z.boolean().optional(),
        cues: z.array(z.number().int().positive()).optional().describe("Cue lists whose cues to fetch. Omit for none."),
        allCues: z.boolean().optional().describe("Fetch cues for every list (slow on big shows)."),
        presets: z.boolean().optional(),
        palettes: z.union([z.boolean(), z.array(paletteTypeSchema)]).optional(),
        patch: z.boolean().optional(),
        extras: z
          .array(z.enum(["macro", "sub", "fx", "snap", "ms"]))
          .optional()
          .describe("Also read macros (with text), subs, effects (fx), snapshots, magic sheets"),
        subscribe: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(60000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ groups, cueLists, cues, allCues, presets, palettes, patch, extras, subscribe, timeoutMs }) => {
      const result = await syncShowTargets(ctx.client, ctx.listener, {
        allCues,
        extras,
        groups,
        cueLists,
        cues,
        presets,
        palettes,
        patch,
        subscribe: subscribe ?? true,
        timeoutMs,
      });
      return jsonResult({ ok: true, ...result, eosVersion: ctx.config.eosVersion });
    }
  );

  server.registerTool(
    "get_groups",
    {
      description: "Cached groups from last sync_show_targets (/eos/out/get/group multipart).",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        groups: Object.values(state.groups),
        count: Object.keys(state.groups).length,
        lastSyncedAt: state.syncStatus.groupsAt ?? state.lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "get_cuelists",
    {
      description: "Cached cue lists from sync.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        cueLists: Object.values(state.cueLists),
        count: Object.keys(state.cueLists).length,
        lastSyncedAt: state.syncStatus.cueListsAt ?? state.lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "get_cues",
    {
      description: "Cached cues for a cue list from sync.",
      inputSchema: z.object({ cueList: z.number().int().positive() }),
      annotations: { readOnlyHint: true },
    },
    async ({ cueList }) => {
      const state = ctx.listener.getState();
      const cues = Object.values(state.cues).filter((c) => c.cueList === cueList);
      return jsonResult({
        cueList,
        cues,
        count: cues.length,
        lastSyncedAt: state.syncStatus.cuesAt[String(cueList)] ?? state.lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "get_presets",
    {
      description: "Cached presets from sync.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        presets: Object.values(state.presets),
        count: Object.keys(state.presets).length,
        lastSyncedAt: state.syncStatus.presetsAt ?? state.lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "get_patch",
    {
      description:
        "Cached patch from sync_show_targets (patch=true). Defaults to a summary (fixture types, channel ranges, universes). " +
        "Use view=list with channelFrom/channelThru, fixtureType, offset/limit (default 100) for rows; include_raw adds raw OSC args.",
      inputSchema: z.object({
        view: z.enum(["summary", "list"]).optional(),
        channelFrom: z.number().int().positive().optional(),
        channelThru: z.number().int().positive().optional(),
        fixtureType: z.string().optional().describe("Case-insensitive substring match on fixture type or manufacturer"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().positive().max(500).optional(),
        include_raw: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const state = ctx.listener.getState();
      const all = Object.values(state.patch).sort((a, b) => a.channel - b.channel || (a.part ?? 1) - (b.part ?? 1));
      const fmtAddr = (abs?: number) =>
        abs === undefined || abs <= 0 ? undefined : `${Math.floor((abs - 1) / 512) + 1}/${((abs - 1) % 512) + 1}`;
      const needle = args.fixtureType?.toLowerCase();
      const filtered = all.filter(
        (p) =>
          (args.channelFrom === undefined || p.channel >= args.channelFrom) &&
          (args.channelThru === undefined || p.channel <= args.channelThru) &&
          (!needle ||
            String(p.fixtureType ?? "").toLowerCase().includes(needle) ||
            String(p.manufacturer ?? "").toLowerCase().includes(needle))
      );
      const lastSyncedAt = state.syncStatus.patchAt ?? state.lastSyncedAt;

      if ((args.view ?? "summary") === "summary") {
        const byType = new Map<string, number[]>();
        const universes = new Map<number, number>();
        for (const p of filtered) {
          const key = `${p.manufacturer ?? ""} ${p.fixtureType ?? ""}`.trim();
          (byType.get(key) ?? byType.set(key, []).get(key)!).push(p.channel);
          if (p.address && p.address > 0) {
            const u = Math.floor((p.address - 1) / 512) + 1;
            universes.set(u, (universes.get(u) ?? 0) + 1);
          }
        }
        const ranges = (chs: number[]) => {
          const sorted = [...new Set(chs)].sort((a, b) => a - b);
          const out: string[] = [];
          for (let i = 0; i < sorted.length; i++) {
            const start = sorted[i];
            while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
            out.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`);
          }
          return out.join(", ");
        };
        return jsonResult({
          view: "summary",
          count: filtered.length,
          totalPatched: all.length,
          fixtureTypes: [...byType.entries()]
            .map(([type, chs]) => ({ type, count: chs.length, channels: ranges(chs) }))
            .sort((a, b) => b.count - a.count),
          universes: [...universes.entries()].sort((a, b) => a[0] - b[0]).map(([universe, fixtures]) => ({ universe, fixtures })),
          labelled: filtered.filter((p) => p.label).length,
          lastSyncedAt,
          hint: "Use view=list with channelFrom/channelThru or fixtureType for per-channel rows.",
        });
      }

      const offset = args.offset ?? 0;
      const limit = args.limit ?? 100;
      const page = filtered.slice(offset, offset + limit).map((p) => {
        const { raw, ...rest } = p as typeof p & { raw?: unknown };
        return {
          ...rest,
          dmx: fmtAddr(p.address),
          endDmx: fmtAddr(p.endAddress),
          ...(args.include_raw ? { raw } : {}),
        };
      });
      return jsonResult({
        view: "list",
        count: filtered.length,
        offset,
        limit,
        returned: page.length,
        nextOffset: offset + page.length < filtered.length ? offset + page.length : undefined,
        patch: page,
        lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "get_show_targets",
    {
      description:
        "Cached macros (with command text), submasters, effects (type, duration...), snapshots and magic sheets. " +
        "Run sync_show_targets with extras first.",
      inputSchema: z.object({ type: z.enum(["macro", "sub", "fx", "snap", "ms"]) }),
      annotations: { readOnlyHint: true },
    },
    async ({ type }) => {
      const items = Object.values(ctx.listener.getState().extraTargets[type] ?? {}).sort((a, b) => a.number - b.number);
      return jsonResult({
        type,
        count: items.length,
        items: items.map(({ raw: _raw, ...rest }) => rest),
        hint: items.length ? undefined : `Run sync_show_targets with extras: ["${type}"] first.`,
      });
    }
  );

  server.registerTool(
    "get_palettes",
    {
      description: "Cached palettes (ip/fp/cp/bp) from sync.",
      inputSchema: z.object({
        type: paletteTypeSchema.optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ type }) => {
      const state = ctx.listener.getState();
      const palettes = Object.values(state.palettes).filter((p) => !type || p.type === type);
      return jsonResult({
        type: type ?? "all",
        palettes,
        count: palettes.length,
        lastSyncedAt: type
          ? state.syncStatus.palettesAt[type]
          : state.lastSyncedAt,
      });
    }
  );
}
