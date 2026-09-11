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
import { gateDestructiveWrite, gateLiveWrite, jsonResult, liveWriteFields } from "./helpers.js";

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
      description: "Record channels into a group via /eos/newcmd.",
      inputSchema: z.object({
        group: z.number().int().positive(),
        channelFrom: z.number().int().positive(),
        channelThru: z.number().int().positive().optional(),
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
        label: args.label,
        mode: args.mode as RecordMode | undefined,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
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
        "Set target label via OSC /eos/set/.../label (Dictionary). Record itself stays CLI.",
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
      description: "Patch via /eos/newcmd. enter_patch_display on Live desk. Pin EOS_VERSION.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        fixtureType: z.string().optional(),
        fixtureTypeNumber: z.number().int().positive().optional(),
        address: z.number().int().nonnegative().optional(),
        universe: z.number().int().positive().optional(),
        enter_patch_display: z.boolean().optional(),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const text = buildPatchCommand({
        channel: args.channel,
        thru: args.thru,
        fixtureType: args.fixtureType,
        fixtureTypeNumber: args.fixtureTypeNumber,
        address: args.address,
        universe: args.universe,
        enterPatchDisplay: args.enter_patch_display,
      });
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
      const built = args.enter_patch_display
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
      const line = buildPatchMoveCommand(args);
      const built = args.enter_patch_display
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

      const line = buildUnpatchCommand({ channel: args.channel, thru: args.thru });
      const built = args.enter_patch_display
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
        cues: z.array(z.number().int().positive()).optional(),
        presets: z.boolean().optional(),
        palettes: z.union([z.boolean(), z.array(paletteTypeSchema)]).optional(),
        subscribe: z.boolean().optional(),
        timeoutMs: z.number().int().positive().max(60000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ groups, cueLists, cues, presets, palettes, subscribe, timeoutMs }) => {
      const result = await syncShowTargets(ctx.client, ctx.listener, {
        groups,
        cueLists,
        cues,
        presets,
        palettes,
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
