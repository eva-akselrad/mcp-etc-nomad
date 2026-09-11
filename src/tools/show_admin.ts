import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { keyPress } from "../eos/addresses.js";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import { isUnverifiedBrowserOscKey, isVerifiedOscKey, normalizeOscKey } from "../eos/keys.js";
import { asProgrammingSteps } from "../eos/programming.js";
import {
  buildAttachDeviceCommand,
  buildChannelCheckCommand,
  buildDetachDeviceCommand,
  buildHighlightCommand,
  buildIdentifyFixtureSteps,
  buildLoadShowWorkflow,
  buildMergeShowWorkflow,
  buildPatchDisplayStep,
  buildSaveShowWorkflow,
  exportManualInstructions,
  UNVERIFIED_BROWSER_KEY_SEQUENCES,
  type ShowExportTarget,
  type ShowSaveMode,
  type ShowWorkflowSteps,
} from "../eos/show-admin.js";
import { syncShowTargets } from "../eos/sync.js";
import {
  gateDestructiveWrite,
  gateLiveWrite,
  gateLoadMerge,
  gateShowSave,
  gateSystemWrite,
  jsonResult,
  liveWriteFields,
  loadMergeFields,
  sendButton,
  showSaveFields,
  systemWriteFields,
} from "./helpers.js";

const exportTargetSchema = z.enum(["patch", "csv", "ascii", "lightwright", "logs", "show"]);

function parseShowWorkflowResult(result: ReturnType<typeof jsonResult>): Record<string, unknown> {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

async function sendWorkflowKeys(
  ctx: EosContext,
  keys: string[],
  options?: { allowUnverifiedBrowserKeys?: boolean }
): Promise<string[]> {
  const sent: string[] = [];
  for (const raw of keys) {
    if (!options?.allowUnverifiedBrowserKeys && isUnverifiedBrowserOscKey(raw)) {
      continue;
    }
    if (!isVerifiedOscKey(raw) && !isUnverifiedBrowserOscKey(raw)) {
      throw new Error(`Unrecognized workflow key token "${raw}"`);
    }
    if (raw === "shift") {
      await sendButton(ctx, keyPress(normalizeOscKey("shift")), "down");
      sent.push("/eos/key/shift (down)");
      continue;
    }
    if (raw === "update") {
      await sendButton(ctx, keyPress(normalizeOscKey("shift")), "down");
      await sendButton(ctx, keyPress(normalizeOscKey("update")), "tap");
      await sendButton(ctx, keyPress(normalizeOscKey("shift")), "up");
      sent.push("/eos/key/shift+update (quick save)");
      continue;
    }
    const address = keyPress(normalizeOscKey(raw));
    await sendButton(ctx, address);
    sent.push(address);
  }
  return sent;
}

async function sendUnverifiedBrowserKeys(
  ctx: EosContext,
  sequence: keyof typeof UNVERIFIED_BROWSER_KEY_SEQUENCES
): Promise<string[]> {
  return sendWorkflowKeys(ctx, UNVERIFIED_BROWSER_KEY_SEQUENCES[sequence], {
    allowUnverifiedBrowserKeys: true,
  });
}

async function runShowWorkflow(
  ctx: EosContext,
  workflow: ShowWorkflowSteps,
  options: {
    action?: string;
    waitForShowEventMs?: number;
    refreshAfterShowEvent?: boolean;
    needsManual?: boolean;
    pressUnverifiedBrowserKeys?: boolean;
    unverifiedBrowserSequence?: keyof typeof UNVERIFIED_BROWSER_KEY_SEQUENCES;
  } = {}
): Promise<ReturnType<typeof jsonResult>> {
  const { steps, notes, keys, browserPath } = workflow;
  const sent: string[] = [];
  const needsManual = options.needsManual ?? workflow.needsManual ?? false;

  if (keys?.length) {
    sent.push(
      ...(await sendWorkflowKeys(ctx, keys, {
        allowUnverifiedBrowserKeys: options.pressUnverifiedBrowserKeys,
      }))
    );
  }

  if (options.pressUnverifiedBrowserKeys && options.unverifiedBrowserSequence) {
    sent.push(...(await sendUnverifiedBrowserKeys(ctx, options.unverifiedBrowserSequence)));
  }

  for (const step of steps) {
    if (step === "") {
      await ctx.client.send("/eos/newcmd", buildCommand("", "enter").text);
      sent.push("Enter (confirm)");
      continue;
    }
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

  let refresh: Awaited<ReturnType<typeof syncShowTargets>> | undefined;
  if (options.refreshAfterShowEvent && showEvent) {
    try {
      refresh = await syncShowTargets(ctx.client, ctx.listener, {
        groups: true,
        cueLists: true,
        presets: true,
        palettes: true,
        subscribe: true,
        timeoutMs: 10000,
      });
    } catch {
      refresh = undefined;
    }
  }

  let echoedPath: string | undefined;
  if (showEvent?.args[0] !== undefined) {
    echoedPath = String(showEvent.args[0]);
  } else {
    try {
      await ctx.client.send("/eos/get/show/path");
      const pathMsg = await ctx.listener.waitFor(/^\/eos\/out\/get\/show\/path$/, 2000);
      echoedPath = pathMsg.args[0] !== undefined ? String(pathMsg.args[0]) : undefined;
    } catch {
      echoedPath = ctx.listener.getState().showPath;
    }
  }

  return jsonResult({
    ok: true,
    action: options.action ?? "show_admin",
    needsManual,
    browserPath: needsManual ? browserPath : undefined,
    sent,
    echoedPath,
    savedPath: echoedPath,
    pathEchoed: echoedPath !== undefined,
    notes: [
      ...(notes ?? []),
      "No OSC Save/Load verbs — Browser/key_press/CLI only. Never invent file paths.",
      refresh
        ? "Ran sync_show_targets after show event — reconfigure fader/cue-list banks before trusting labels."
        : needsManual
          ? "Complete file selection in Browser CIA, then sync_show_targets."
          : undefined,
    ].filter(Boolean),
    showEvent: showEvent
      ? { address: showEvent.address, args: showEvent.args }
      : undefined,
    refresh,
    eosVersion: ctx.config.eosVersion,
    protocol: ctx.config.protocol,
    transportNote:
      ctx.config.protocol === "tcp"
        ? `TCP ${ctx.config.tcpPort} OSC ${ctx.config.tcpOscVersion} (${ctx.config.tcpMode}) — bidirectional; /eos/out/* on same socket. Enable OSC RX+TX in Setup. Not UDP ${ctx.config.portTx}/${ctx.config.portRx}.`
        : `UDP TX→${ctx.config.portTx} RX←${ctx.config.portRx} (MCP default; ETC prefers TCP for reliability)`,
  });
}

export function registerShowAdminTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "show_save",
    {
      description:
        "PRIORITY: Save show via keys/CLI (no path args). quick=Shift+Update; save=Save CLI; save_as=Browser. Requires confirm_save + user_intent when gated; echoes saved path from /eos/out/event/show/saved.",
      inputSchema: z.object({
        mode: z.enum(["quick", "save", "save_as"]).optional(),
        wait_for_event_ms: z.number().int().positive().max(60000).optional(),
        ...liveWriteFields,
        ...systemWriteFields,
        ...showSaveFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateShowSave(ctx, args);
      if (blocked) return blocked;

      const workflow = buildSaveShowWorkflow({
        mode: args.mode as ShowSaveMode | undefined,
        confirmSave: args.confirm_save,
      });
      const mode = (args.mode as ShowSaveMode | undefined) ?? "quick";
      const result = await runShowWorkflow(ctx, workflow, {
        action: "show_save",
        waitForShowEventMs: args.wait_for_event_ms ?? 10000,
        needsManual: mode === "save_as" ? true : undefined,
        pressUnverifiedBrowserKeys: args.press_unverified_browser_keys,
        unverifiedBrowserSequence: mode === "save_as" ? "save_as" : undefined,
      });
      const body = parseShowWorkflowResult(result);
      if (!body.pathEchoed) {
        body.notes = [
          ...(Array.isArray(body.notes) ? body.notes : []),
          "No path echo yet — retry get_show_path or extend wait_for_event_ms after desk confirm.",
        ];
        return jsonResult(body);
      }
      return result;
    }
  );

  server.registerTool(
    "show_load",
    {
      description:
        "Load show via Browser (needsManual + CIA path). User picks show — never auto-load. Prefer Blind.",
      inputSchema: z.object({
        wait_for_event_ms: z.number().int().positive().max(120000).optional(),
        refresh_after_event: z.boolean().optional(),
        ...liveWriteFields,
        ...systemWriteFields,
        ...loadMergeFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateLoadMerge(ctx, args);
      if (blocked) return blocked;

      return runShowWorkflow(ctx, buildLoadShowWorkflow({ confirmPath: args.confirm_path }), {
        needsManual: true,
        pressUnverifiedBrowserKeys: args.press_unverified_browser_keys,
        unverifiedBrowserSequence: "load",
        waitForShowEventMs: args.wait_for_event_ms,
        refreshAfterShowEvent: args.refresh_after_event ?? true,
      });
    }
  );

  server.registerTool(
    "show_merge",
    {
      description:
        "Merge show via Browser (needsManual + CIA path). User selects source; partial merge needs {Advanced}. Prefer Blind.",
      inputSchema: z.object({
        wait_for_event_ms: z.number().int().positive().max(120000).optional(),
        refresh_after_event: z.boolean().optional(),
        ...liveWriteFields,
        ...systemWriteFields,
        ...loadMergeFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateLoadMerge(ctx, args);
      if (blocked) return blocked;

      return runShowWorkflow(ctx, buildMergeShowWorkflow({ confirmPath: args.confirm_path }), {
        needsManual: true,
        pressUnverifiedBrowserKeys: args.press_unverified_browser_keys,
        unverifiedBrowserSequence: "merge",
        waitForShowEventMs: args.wait_for_event_ms,
        refreshAfterShowEvent: args.refresh_after_event ?? true,
      });
    }
  );

  server.registerTool(
    "show_export",
    {
      description:
        "Export via Browser wizard only — returns needsManual. No /eos/export OSC or invented paths.",
      inputSchema: z.object({
        target: exportTargetSchema,
        open_browser: z
          .boolean()
          .optional()
          .describe(
            "When true, press unverified open_browser + export_folder keys (Tab 7 verification). Default false — needsManual only."
          ),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      const manual = exportManualInstructions(args.target as ShowExportTarget);
      const sent: string[] = [];

      if (args.open_browser) {
        sent.push(...(await sendUnverifiedBrowserKeys(ctx, "export")));
      }

      return jsonResult({
        ok: true,
        action: "show_export",
        needsManual: true,
        target: manual.target,
        browserPath: manual.browserPath,
        sent,
        notes: manual.notes,
        eosVersion: ctx.config.eosVersion,
      });
    }
  );

  server.registerTool(
    "get_show_path",
    {
      description: "Query cached or live show path via /eos/get/show/path (no invented paths).",
      inputSchema: z.object({
        timeoutMs: z.number().int().positive().max(30000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ timeoutMs }) => {
      await ctx.client.send("/eos/get/show/path");
      let path: string | undefined;
      try {
        const msg = await ctx.listener.waitFor(/^\/eos\/out\/get\/show\/path$/, timeoutMs ?? 3000);
        path = msg.args[0] !== undefined ? String(msg.args[0]) : undefined;
      } catch {
        path = ctx.listener.getState().showPath;
      }
      return jsonResult({
        ok: true,
        path,
        eosVersion: ctx.config.eosVersion,
        lastShowEvent: ctx.listener.getState().showFile,
      });
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
      return runShowWorkflow(ctx, asProgrammingSteps(built));
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
      return runShowWorkflow(ctx, asProgrammingSteps(built));
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

      return runShowWorkflow(ctx, asProgrammingSteps(buildChannelCheckCommand(args)));
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

      return runShowWorkflow(ctx, asProgrammingSteps(buildHighlightCommand(args)));
    }
  );

  server.registerTool(
    "identify_fixture",
    {
      description:
        "Identify fixtures via Test Fixture key after channel/group select. Session identity: get_session_info.",
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

      return runShowWorkflow(ctx, buildIdentifyFixtureSteps(args));
    }
  );
}
