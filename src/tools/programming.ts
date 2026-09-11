import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { setCueLabel, setGroupLabel } from "../eos/addresses.js";
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
    .describe(
      "one_shot: single CLI line. two_step: Cue N then Record/Update (prefer eos_new_command per step)."
    ),
  refresh_cache: z
    .boolean()
    .optional()
    .describe("Re-run sync_show_targets after success (default true). Do not trust stale cache."),
};

type SendOptions = {
  confirm?: boolean;
  allow_live?: boolean;
  refresh_cache?: boolean;
  cueList?: number;
};

/** Programming uses /eos/newcmd so leftover CLI text does not corrupt the next action. */
async function sendProgrammingSteps(
  ctx: EosContext,
  built: string | ReturnType<typeof buildRecordCommand>,
  options: SendOptions
): Promise<ReturnType<typeof jsonResult>> {
  const blocked = gateLiveWrite(ctx, options);
  if (blocked) return blocked;

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
      "Programming uses /eos/newcmd (clears line). String RX must be enabled or cmd silently fails.",
      "Commands run as OSC user — Blind/Live and selection are per that user.",
      refresh
        ? "Cache refreshed via sync_show_targets."
        : "Cache refresh skipped or failed — call sync_show_targets before trusting resources.",
    ],
    refresh,
    eosVersion: ctx.config.eosVersion,
  });
}

export function registerProgrammingTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "cue_record",
    {
      description:
        "Record programmer look into a cue via CLI (/eos/newcmd). No OSC Record verb. Prefer Blind; live Record changes the running look.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]).describe("Cue number (point cues OK). Omit part unless recording a part."),
        cueList: z.number().int().positive().optional(),
        part: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Multipart: Cue N Part P — do not assume part from bare cue number."),
        label: z.string().optional(),
        block: z.boolean().optional(),
        merge: z.boolean().optional(),
        time: z.string().optional(),
        mode: z
          .enum(["record", "record_only"])
          .optional()
          .describe("Record vs Record Only — wrong choice overwrites or leaves empty targets."),
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
    "cue_update",
    {
      description:
        "Update cue from manual/red programmer values. After Go, Make Manual first or Update is useless. Prefer explicit scope.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]).optional(),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        block: z.boolean().optional(),
        merge: z.boolean().optional(),
        time: z.string().optional(),
        scope: z
          .enum(["all", "cue_only", "track"])
          .optional()
          .describe("Update scope: All / Cue Only / Track (Live vs Blind dialogs differ on desk)."),
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
    "programming_copy",
    {
      description:
        'Cue copy: "Copy Cue 1 Thru 5 Cue 10". Not channel Copy To or patch copy — use patch_copy_to for patch.',
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
    "programming_move",
    {
      description:
        'Move cues or effects only. Cues: "Move Cue 5 At Cue 10". Effects: "Move Effect 1 At Effect 2". Patch move uses patch_move (double Copy To).',
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
        return jsonResult(
          {
            ok: false,
            error: "Cross-type move not supported. Use cue+cue or effect+effect.",
          },
          true
        );
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
    "patch_copy_to",
    {
      description:
        "Patch-only copy: \"111 Copy To 116\". Not live channel Copy To. {Plus Show}/{Only Show} softkeys change scope on desk.",
      inputSchema: z.object({
        sourceChannel: z.number().int().positive(),
        destChannel: z.number().int().positive(),
        enter_patch_display: z
          .boolean()
          .optional()
          .describe("Send Patch Enter first — required on Live CLI before patch syntax."),
        ...programmingTransportFields,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const steps = asProgrammingSteps(
        args.enter_patch_display
          ? { style: "two_step", steps: ["Patch", buildPatchCopyCommand(args)] }
          : buildPatchCopyCommand(args)
      );
      return sendProgrammingSteps(ctx, steps, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: args.refresh_cache,
      });
    }
  );

  server.registerTool(
    "patch_move",
    {
      description:
        'Patch MOVE = double Copy To: "116 Copy To Copy To 120". Single Copy To is copy, not move.',
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
    "programming_delete",
    {
      description:
        "Delete show targets via CLI. Destructive: confirm + confirm_delete. Desk may prompt second Enter. Sneak/Home/Out are NOT Delete. Prefer Blind.",
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
    "unpatch_channel",
    {
      description:
        "Unpatch removes patch assignment — not Delete channel data. Destructive: confirm + confirm_delete.",
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

  server.registerTool(
    "group_record",
    {
      description: "Record channels into a group. Channel range then Group N Record.",
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
    "target_label",
    {
      description:
        'Label via CLI, or OSC /eos/set/.../label for group/cue when use_osc=true. Record itself stays CLI.',
      inputSchema: z.object({
        target: programmingTargetSchema,
        number: z.union([z.number(), z.string()]),
        label: z.string(),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        use_osc: z
          .boolean()
          .optional()
          .describe("Send /eos/set/group|cue/.../label instead of CLI (group and cue only)."),
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      if (args.use_osc && args.target === "group") {
        await ctx.client.send(setGroupLabel(Number(args.number)), args.label);
        return jsonResult({
          ok: true,
          action: "set_label",
          path: setGroupLabel(Number(args.number)),
          label: args.label,
        });
      }

      if (args.use_osc && args.target === "cue" && args.cueList !== undefined) {
        const path = setCueLabel(args.cueList, args.number);
        await ctx.client.send(path, args.label);
        return jsonResult({ ok: true, action: "set_label", path, label: args.label });
      }

      const text = buildLabelCommand({
        target: args.target as ProgrammingTarget,
        number: args.number,
        label: args.label,
        cueList: args.cueList,
        part: args.part,
      });
      return sendProgrammingSteps(ctx, text, {
        confirm: args.confirm,
        allow_live: args.allow_live,
        refresh_cache: false,
      });
    }
  );

  server.registerTool(
    "patch_channel",
    {
      description:
        "Patch via CLI. Enter Patch display first on Live desk. Pin EOS_VERSION — syntax is version-sensitive. Prefer fixtureTypeNumber and explicit Address/Universe.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        fixtureType: z.string().optional(),
        fixtureTypeNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Prefer type number over name when automating (spaces in type names)."),
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
    "sync_show_targets",
    {
      description:
        "Refresh cached groups/cues via /eos/get/*. Call after record/copy/delete — do not trust stale OSC cache for resources.",
      inputSchema: z.object({
        groups: z.boolean().optional(),
        cueLists: z.boolean().optional(),
        cues: z.array(z.number().int().positive()).optional(),
        subscribe: z.boolean().optional().describe("Send /eos/subscribe=1 (default true on manual sync)"),
        timeoutMs: z.number().int().positive().max(60000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ groups, cueLists, cues, subscribe, timeoutMs }) => {
      const result = await syncShowTargets(ctx.client, ctx.listener, {
        groups,
        cueLists,
        cues,
        subscribe: subscribe ?? true,
        timeoutMs,
      });
      return jsonResult({ ok: true, ...result, eosVersion: ctx.config.eosVersion });
    }
  );

  server.registerTool(
    "query_groups",
    {
      description: "Cached groups — run sync_show_targets after programming changes.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        groups: Object.values(state.groups),
        count: Object.keys(state.groups).length,
        lastSyncedAt: state.syncStatus.groupsAt ?? state.lastSyncedAt,
        staleWarning: "Re-sync after record/copy/delete before trusting this cache.",
      });
    }
  );

  server.registerTool(
    "query_cuelists",
    {
      description: "Cached cue lists — run sync_show_targets after programming changes.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        cueLists: Object.values(state.cueLists),
        count: Object.keys(state.cueLists).length,
        lastSyncedAt: state.syncStatus.cueListsAt ?? state.lastSyncedAt,
        staleWarning: "Re-sync after record/copy/delete before trusting this cache.",
      });
    }
  );

  server.registerTool(
    "query_cues",
    {
      description: "Cached cues for a list — run sync_show_targets after programming changes.",
      inputSchema: z.object({
        cueList: z.number().int().positive(),
      }),
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
        staleWarning: "Re-sync after record/copy/delete before trusting this cache.",
      });
    }
  );
}
