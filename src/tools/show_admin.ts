import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import { asProgrammingSteps } from "../eos/programming.js";
import {
  buildAttachDeviceCommand,
  buildChannelCheckCommand,
  buildDetachDeviceCommand,
  buildExportShowCommand,
  buildHighlightCommand,
  buildIdentifyFixtureSteps,
  buildLoadShowCommand,
  buildMergeShowCommand,
  buildPatchDisplayStep,
  buildSaveShowCommand,
  type ShowExportTarget,
  type ShowSaveMode,
} from "../eos/show-admin.js";
import {
  gateDestructiveWrite,
  gateLiveWrite,
  gateSystemWrite,
  jsonResult,
  liveWriteFields,
  systemWriteFields,
} from "./helpers.js";

const exportTargetSchema = z.enum([
  "patch",
  "cue",
  "group",
  "show",
  "csv",
  "ascii",
  "lightwright",
  "logs",
]);

async function sendAdminCommand(
  ctx: EosContext,
  built: string | ReturnType<typeof buildSaveShowCommand>,
  options: { waitForShowEventMs?: number }
): Promise<ReturnType<typeof jsonResult>> {
  const { steps, notes } = asProgrammingSteps(built);
  const sent: string[] = [];

  for (const step of steps) {
    const cmd = buildCommand(step, "enter");
    await ctx.client.send("/eos/newcmd", cmd.text);
    sent.push(cmd.text);
  }

  let showEvent: { address: string; args: unknown[] } | undefined;
  if (options.waitForShowEventMs) {
    try {
      showEvent = await ctx.listener.waitFor(/^\/eos\/out\/event\/show\//, options.waitForShowEventMs);
    } catch {
      showEvent = undefined;
    }
  }

  return jsonResult({
    ok: true,
    action: "show_admin",
    path: "/eos/newcmd",
    sent,
    notes: [
      ...(notes ?? []),
      "Show file syntax is version-sensitive — pin EOS_VERSION and verify on your desk.",
      "Advanced merge/export wizards may still need Browser steps on some Eos versions.",
      showEvent ? "Received /eos/out/event/show confirmation." : undefined,
    ].filter(Boolean),
    showEvent,
    eosVersion: ctx.config.eosVersion,
    protocol: ctx.config.protocol,
    tcpPort: ctx.config.protocol === "tcp" ? ctx.config.tcpPort : undefined,
  });
}

export function registerShowAdminTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "show_save",
    {
      description:
        "Save the current show via CLI (/eos/newcmd). quick=Save; save_as accepts name or path. Pin EOS_VERSION.",
      inputSchema: z.object({
        mode: z.enum(["quick", "save", "save_as"]).optional(),
        name: z.string().optional(),
        path: z.string().optional(),
        wait_for_event_ms: z.number().int().positive().max(60000).optional(),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      const built = buildSaveShowCommand({
        mode: args.mode as ShowSaveMode | undefined,
        name: args.name,
        path: args.path,
      });
      return sendAdminCommand(ctx, built, { waitForShowEventMs: args.wait_for_event_ms });
    }
  );

  server.registerTool(
    "show_load",
    {
      description: 'Load/open a show file: Open Show "path". Destructive — prefer Blind. EOS_VERSION-sensitive.',
      inputSchema: z.object({
        path: z.string(),
        wait_for_event_ms: z.number().int().positive().max(60000).optional(),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      return sendAdminCommand(ctx, buildLoadShowCommand({ path: args.path }), {
        waitForShowEventMs: args.wait_for_event_ms ?? 15000,
      });
    }
  );

  server.registerTool(
    "show_merge",
    {
      description:
        'Merge another show: Merge Show "path". Partial merge UI may need Browser {Advanced}. Prefer Blind.',
      inputSchema: z.object({
        path: z.string(),
        wait_for_event_ms: z.number().int().positive().max(60000).optional(),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      return sendAdminCommand(ctx, buildMergeShowCommand({ path: args.path }), {
        waitForShowEventMs: args.wait_for_event_ms ?? 15000,
      });
    }
  );

  server.registerTool(
    "show_export",
    {
      description:
        'Export show data via CLI, e.g. Export Patch "usb1:/patch.csv". Target + path required.',
      inputSchema: z.object({
        target: exportTargetSchema,
        path: z.string(),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      return sendAdminCommand(
        ctx,
        buildExportShowCommand({
          target: args.target as ShowExportTarget,
          path: args.path,
        }),
        {}
      );
    }
  );

  server.registerTool(
    "attach_patch_device",
    {
      description: "Attach dimmer/RDM device to patched channel in Patch display (not network join).",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        enter_patch_display: z.boolean().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      const line = buildAttachDeviceCommand({ channel: args.channel, thru: args.thru });
      const built = args.enter_patch_display
        ? { style: "two_step" as const, steps: [...buildPatchDisplayStep().steps, line] }
        : line;
      return sendAdminCommand(ctx, built, {});
    }
  );

  server.registerTool(
    "detach_patch_device",
    {
      description: "Detach dimmer/RDM device from patched channel in Patch display.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        thru: z.number().int().positive().optional(),
        enter_patch_display: z.boolean().optional(),
        confirm_delete: z.boolean().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateDestructiveWrite(ctx, args);
      if (blocked) return blocked;

      const line = buildDetachDeviceCommand({ channel: args.channel, thru: args.thru });
      const built = args.enter_patch_display
        ? { style: "two_step" as const, steps: [...buildPatchDisplayStep().steps, line] }
        : line;
      return sendAdminCommand(ctx, built, {});
    }
  );

  server.registerTool(
    "channel_check",
    {
      description: "Start channel check at a level (Check softkey). Use Next/Last keys to step.",
      inputSchema: z.object({
        channel: z.number().int().positive(),
        level: z.number().min(0).max(100).optional(),
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      return sendAdminCommand(ctx, buildChannelCheckCommand(args), {});
    }
  );

  server.registerTool(
    "highlight_channels",
    {
      description: "Highlight channels or a group (Highlight softkey / Shift+High pattern).",
      inputSchema: z.object({
        channel: z.number().int().positive().optional(),
        thru: z.number().int().positive().optional(),
        group: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      return sendAdminCommand(ctx, buildHighlightCommand(args), {});
    }
  );

  server.registerTool(
    "identify_fixture",
    {
      description:
        "Identify fixtures via Test Fixture key (test_fixture) after channel/group selection. Prefer Blind.",
      inputSchema: z.object({
        channel: z.number().int().positive().optional(),
        thru: z.number().int().positive().optional(),
        group: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
    },
    async (args) => {
      const blocked = gateLiveWrite(ctx, args);
      if (blocked) return blocked;

      return sendAdminCommand(ctx, buildIdentifyFixtureSteps(args), {});
    }
  );
}
