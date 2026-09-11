import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import {
  buildCopyCommand,
  buildDeleteCommand,
  buildGroupFromChannelsCommand,
  buildLabelCommand,
  buildMoveCommand,
  buildPatchCommand,
  buildRecordCommand,
  buildUpdateCommand,
  type ProgrammingTarget,
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
    .describe("Required for delete operations when EOS_REQUIRE_CONFIRM=true (destructive)."),
};

async function sendProgrammingCommand(
  ctx: EosContext,
  text: string,
  options: { confirm?: boolean; allow_live?: boolean }
): Promise<ReturnType<typeof jsonResult>> {
  const blocked = gateLiveWrite(ctx, options);
  if (blocked) return blocked;

  const built = buildCommand(text, "enter");
  await ctx.client.send("/eos/cmd", built.text);
  return jsonResult({ ok: true, action: "eos_command", sent: built.text, path: "/eos/cmd" });
}

export function registerProgrammingTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "cue_record",
    {
      description:
        "Record the current programmer selection into a cue via command line. Prefer blind mode for programming.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]).describe("Cue number (supports point cues like 1.5)"),
        cueList: z.number().int().positive().optional().describe("Cue list (default: active list)"),
        part: z.number().int().nonnegative().optional(),
        label: z.string().optional(),
        block: z.boolean().optional(),
        merge: z.boolean().optional(),
        time: z.string().optional().describe('Optional timing clause, e.g. "Time 3"'),
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
      });
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "cue_update",
    {
      description: "Update an existing cue with the current programmer selection.",
      inputSchema: z.object({
        cue: z.union([z.number(), z.string()]).optional(),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().nonnegative().optional(),
        block: z.boolean().optional(),
        merge: z.boolean().optional(),
        time: z.string().optional(),
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
      });
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "programming_copy",
    {
      description:
        'Copy show targets via CLI, e.g. "Copy Cue 1 Thru 5 Cue 10" or copy effects/groups.',
      inputSchema: z.object({
        sourceType: programmingTargetSchema,
        sourceFrom: z.union([z.number(), z.string()]),
        sourceThru: z.union([z.number(), z.string()]).optional(),
        sourceCueList: z.number().int().positive().optional(),
        destType: programmingTargetSchema,
        dest: z.union([z.number(), z.string()]),
        destCueList: z.number().int().positive().optional(),
        time: z.string().optional(),
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
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "programming_move",
    {
      description: 'Move show targets via CLI, e.g. "Move Cue 5 At Cue 10".',
      inputSchema: z.object({
        sourceType: programmingTargetSchema,
        source: z.union([z.number(), z.string()]),
        sourceCueList: z.number().int().positive().optional(),
        destType: programmingTargetSchema,
        dest: z.union([z.number(), z.string()]),
        destCueList: z.number().int().positive().optional(),
        time: z.string().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const text = buildMoveCommand({
        sourceType: args.sourceType as ProgrammingTarget,
        source: args.source,
        sourceCueList: args.sourceCueList,
        destType: args.destType as ProgrammingTarget,
        dest: args.dest,
        destCueList: args.destCueList,
        time: args.time,
      });
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "programming_delete",
    {
      description:
        "Delete show targets via CLI (destructive — requires confirm_delete when EOS_REQUIRE_CONFIRM=true).",
      inputSchema: z.object({
        target: programmingTargetSchema,
        from: z.union([z.number(), z.string()]),
        thru: z.union([z.number(), z.string()]).optional(),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().nonnegative().optional(),
        ...liveWriteFields,
        ...destructiveFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateDestructiveWrite(ctx, {
        confirm: args.confirm,
        confirm_delete: args.confirm_delete,
      });
      if (blocked) return blocked;

      const text = buildDeleteCommand({
        target: args.target as ProgrammingTarget,
        from: args.from,
        thru: args.thru,
        cueList: args.cueList,
        part: args.part,
      });
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "group_record",
    {
      description:
        "Record channels into a group, optionally with a label. Example: channels 1–10 into group 1.",
      inputSchema: z.object({
        group: z.number().int().positive(),
        channelFrom: z.number().int().positive(),
        channelThru: z.number().int().positive().optional(),
        label: z.string().optional(),
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const text = buildGroupFromChannelsCommand({
        group: args.group,
        channelFrom: args.channelFrom,
        channelThru: args.channelThru,
        label: args.label,
      });
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "target_label",
    {
      description: 'Label a cue, group, effect, or other show target, e.g. Label Group 1 "Wash".',
      inputSchema: z.object({
        target: programmingTargetSchema,
        number: z.union([z.number(), z.string()]),
        label: z.string(),
        cueList: z.number().int().positive().optional(),
        part: z.number().int().nonnegative().optional(),
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const text = buildLabelCommand({
        target: args.target as ProgrammingTarget,
        number: args.number,
        label: args.label,
        cueList: args.cueList,
        part: args.part,
      });
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "patch_channel",
    {
      description:
        "Patch a channel or range via CLI. Phase 3 will add richer patch helpers; this covers basic patch syntax.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        fixtureType: z.string().optional(),
        address: z.number().int().nonnegative().optional(),
        universe: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const text = buildPatchCommand({
        channel: args.channel,
        thru: args.thru,
        fixtureType: args.fixtureType,
        address: args.address,
        universe: args.universe,
      });
      return sendProgrammingCommand(ctx, text, args);
    }
  );

  server.registerTool(
    "sync_show_targets",
    {
      description:
        "Refresh cached groups, cue lists, and cues via OSC /eos/get/* (EosSyncLib-style). Read-only on the programmer; triggers OSC get requests.",
      inputSchema: z.object({
        groups: z.boolean().optional().describe("Sync groups (default true)"),
        cueLists: z.boolean().optional().describe("Sync cue list index (default true)"),
        cues: z
          .array(z.number().int().positive())
          .optional()
          .describe("Cue lists to sync cues for; default all known lists after cuelist sync"),
        subscribe: z
          .boolean()
          .optional()
          .describe("Send /eos/subscribe=1 for ongoing updates (default true)"),
        timeoutMs: z.number().int().positive().max(60000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ groups, cueLists, cues, subscribe, timeoutMs }) => {
      const result = await syncShowTargets(ctx.client, ctx.listener, {
        groups,
        cueLists,
        cues,
        subscribe,
        timeoutMs,
      });
      return jsonResult({ ok: true, ...result });
    }
  );

  server.registerTool(
    "query_groups",
    {
      description: "Return cached groups from the last sync_show_targets (or live OSC get replies).",
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
    "query_cuelists",
    {
      description: "Return cached cue lists from sync.",
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
    "query_cues",
    {
      description: "Return cached cues for a cue list (run sync_show_targets first).",
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
      });
    }
  );
}
