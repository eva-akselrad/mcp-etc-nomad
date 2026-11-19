import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { keyPress } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { channelSelectionFields } from "../specs/lighting-ops.js";
import { gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

/*
 * Effect tools. Syntax verified on ETCnomad 3.3.9 over /eos/newcmd:
 *   apply:   "Chan 201 Thru 204 Effect 950 Enter"          (Live)
 *   stop:    "Effect 901 @ Enter"  (whole effect)  |  "Chan 201 Thru 204 Effect Enter"  (those channels)
 *   create:  "Effect 950 Enter" -> "Create Type" prompt -> /eos/key/linear|stepbased|absolute
 *            only while the Effect List / editor has focus. /eos/key/open_effect_blind opens it
 *            (/eos/key/effect twice over OSC does not); the tools press it when needed.
 *   timing:  "Effect 950 CycleTime 5 Enter"                 (Effect display)
 *   label:   "Effect 950 Label MCP Test Linear Enter"       (no quotes — Eos keeps them literally)
 * The [Stop Effect] key/word gave "Syntax Error" in every form tried, so it is not used.
 */

type Selection = {
  channel?: number;
  channels?: number[];
  ranges?: Array<{ from: number; thru: number }>;
  from?: number;
  thru?: number;
  minus?: number[];
  group?: number;
};

function selectionText(sel: Selection): string | undefined {
  if (sel.group !== undefined) return `Group ${sel.group}`;
  const items: string[] = [];
  if (sel.channel !== undefined) items.push(`${sel.channel}`);
  if (sel.from !== undefined) {
    items.push(sel.thru !== undefined && sel.thru !== sel.from ? `${sel.from} Thru ${sel.thru}` : `${sel.from}`);
  }
  for (const r of sel.ranges ?? []) items.push(r.thru !== r.from ? `${r.from} Thru ${r.thru}` : `${r.from}`);
  for (const ch of sel.channels ?? []) items.push(`${ch}`);
  if (items.length === 0) return undefined;
  let text = `Chan ${items.join(" + ")}`;
  for (const ch of sel.minus ?? []) text += ` - ${ch}`;
  return text;
}

function formatTime(value: number | string): string {
  // Eos reads "5" as 5 s and "1:30" as 1 min 30 s.
  return String(value).trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendLine(ctx: EosContext, text: string): Promise<string | undefined> {
  await ctx.client.send("/eos/newcmd", text);
  await sleep(400);
  return ctx.listener.getState().commandLine;
}

function hasError(commandLine?: string): string | undefined {
  if (!commandLine) return undefined;
  const m = commandLine.match(/Error:?\s*(.*?)(#|$)/i);
  return m ? m[1].trim() || "Error" : undefined;
}

function effectDisplayFocused(ctx: EosContext): boolean {
  // Prompt reads e.g. "BLIND: Effect  901 : " when the Effect List / editor has focus.
  return /^(BLIND|LIVE)?:?\s*Effect\s+\d+\s*:/.test(ctx.listener.getState().commandLine ?? "");
}

/** Open the Effect List (blind) via /eos/key/open_effect_blind — verified on ETCnomad 3.3.9. */
async function ensureEffectDisplay(ctx: EosContext): Promise<{ ok: boolean; opened: boolean }> {
  if (effectDisplayFocused(ctx)) return { ok: true, opened: false };
  await sendButton(ctx, keyPress("open_effect_blind"), "tap");
  await sleep(600);
  return { ok: effectDisplayFocused(ctx), opened: true };
}

const effectNumber = z.number().int().positive().describe("Effect number");
const groupField = { group: z.number().int().positive().optional().describe("Apply to a group instead of channels") };

export function registerEffectTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "apply_effect",
    {
      description:
        "Apply an existing effect to channels or a group in Live: 'Chan 201 Thru 204 Effect 950 Enter'. " +
        "Step-based effects carry their own channels, so applying them to other channels changes nothing.",
      inputSchema: z.object({ effect: effectNumber, ...channelSelectionFields, ...groupField, ...liveWriteFields }),
      annotations: { destructiveHint: true },
    },
    async ({ effect, confirm, allow_live, ...sel }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;
      const target = selectionText(sel);
      if (!target) return jsonResult({ ok: false, error: "Provide channel(s), ranges or group." }, true);
      const sent = `${target} Effect ${effect} Enter`;
      const commandLine = await sendLine(ctx, sent);
      const error = hasError(commandLine);
      return jsonResult({ ok: !error, action: "apply_effect", sent, commandLine, error }, Boolean(error));
    }
  );

  server.registerTool(
    "stop_effect",
    {
      description:
        "Stop an effect. With effect: stops that effect everywhere ('Effect 901 @ Enter'). " +
        "With channels/group: stops effects on those channels ('Chan 201 Thru 204 Effect Enter').",
      inputSchema: z.object({
        effect: effectNumber.optional(),
        ...channelSelectionFields,
        ...groupField,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ effect, confirm, allow_live, ...sel }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;
      const target = selectionText(sel);
      let sent: string;
      if (target) sent = `${target} Effect Enter`;
      else if (effect !== undefined) sent = `Effect ${effect} @ Enter`;
      else return jsonResult({ ok: false, error: "Provide effect, or channel(s)/group." }, true);
      const commandLine = await sendLine(ctx, sent);
      const error = hasError(commandLine);
      return jsonResult({ ok: !error, action: "stop_effect", sent, commandLine, error }, Boolean(error));
    }
  );

  server.registerTool(
    "create_effect",
    {
      description:
        "Create a new effect with a type and optional cycle time and label. Opens the Effect List (blind) " +
        "via open_effect_blind if needed — the desk ends up in Blind. " +
        "If the number already exists (e.g. built-in 9xx effects), nothing is changed.",
      inputSchema: z.object({
        effect: effectNumber,
        type: z.enum(["linear", "stepbased", "absolute"]),
        cycleTime: z.union([z.number().positive(), z.string()]).optional().describe("Seconds, or m:ss"),
        label: z.string().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ effect, type, cycleTime, label, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;
      const display = await ensureEffectDisplay(ctx);
      if (!display.ok) {
        return jsonResult({
          ok: false,
          needsManual: true,
          error: "Could not focus the Effect List (open_effect_blind). On the desk press [Effect][Effect], then retry.",
          commandLine: ctx.listener.getState().commandLine,
        }, true);
      }
      const steps: string[] = display.opened ? ["/eos/key/open_effect_blind"] : [];
      const first = `Effect ${effect} Enter`;
      let commandLine = await sendLine(ctx, first);
      steps.push(first);
      if (!/Create Type/i.test(commandLine ?? "")) {
        return jsonResult({
          ok: false,
          action: "create_effect",
          exists: true,
          error: `Effect ${effect} already exists (no "Create Type" prompt); left unchanged.`,
          steps,
          commandLine,
        }, true);
      }
      await sendButton(ctx, keyPress(type), "tap");
      await sleep(400);
      steps.push(`/eos/key/${type}`);
      commandLine = ctx.listener.getState().commandLine;
      if (cycleTime !== undefined) {
        const line = `Effect ${effect} CycleTime ${formatTime(cycleTime)} Enter`;
        commandLine = await sendLine(ctx, line);
        steps.push(line);
      }
      if (label) {
        const line = `Effect ${effect} Label ${label.replace(/[\r\n]+/g, " ").trim()} Enter`;
        commandLine = await sendLine(ctx, line);
        steps.push(line);
      }
      const error = hasError(commandLine);
      return jsonResult({ ok: !error, action: "create_effect", effect, type, steps, commandLine, error }, Boolean(error));
    }
  );

  server.registerTool(
    "set_effect_timing",
    {
      description:
        "Set an effect's cycle time: 'Effect 950 CycleTime 5 Enter'. Opens the Effect List (blind) via open_effect_blind if needed.",
      inputSchema: z.object({
        effect: effectNumber,
        cycleTime: z.union([z.number().positive(), z.string()]).describe("Seconds, or m:ss"),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ effect, cycleTime, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;
      const display = await ensureEffectDisplay(ctx);
      if (!display.ok) {
        return jsonResult({
          ok: false,
          needsManual: true,
          error: "Could not focus the Effect List (open_effect_blind). On the desk press [Effect][Effect], then retry.",
          commandLine: ctx.listener.getState().commandLine,
        }, true);
      }
      const sent = `Effect ${effect} CycleTime ${formatTime(cycleTime)} Enter`;
      const commandLine = await sendLine(ctx, sent);
      const error = hasError(commandLine);
      return jsonResult({ ok: !error, action: "set_effect_timing", sent, commandLine, error }, Boolean(error));
    }
  );
}
