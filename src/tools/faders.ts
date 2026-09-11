import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  faderAction,
  faderBankConfig,
  faderBankPage,
  faderBankReset,
  faderLevel,
  subFire,
  subLevel,
  subSelect,
  type FaderAction,
} from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";
import { submasterLevelSchema } from "../specs/lighting-ops.js";

const faderActionEnum = z.enum([
  "load",
  "unload",
  "stop",
  "fire",
  "home",
  "out",
  "min",
  "max",
  "full",
  "level",
]);

export function registerFaderTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "fader_bank_config",
    {
      description:
        "Create an OSC fader bank so faders can be read and driven. Required before paging or get_fader_labels_levels. Bank 0 is the master fader.",
      inputSchema: z.object({
        bank: z.number().int().min(0).describe("1-based OSC fader bank index; 0 = master fader"),
        count: z.number().int().positive().describe("Faders per page"),
        page: z.number().int().positive().optional().describe("Optional page to jump to when creating"),
      }),
    },
    async ({ bank, count, page }) => {
      const address = faderBankConfig(bank, count, page);
      await ctx.client.send(address);
      return jsonResult({ ok: true, action: "fader_bank_config", address, bank, count, page });
    }
  );

  server.registerTool(
    "fader_set_level",
    {
      description: "Set an OSC fader level (0.0–1.0). Bank must exist (fader_bank_config).",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        level: z.number().min(0).max(1),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = faderLevel(bank, fader);
      await ctx.client.send(address, level);
      return jsonResult({ ok: true, action: "fader_set_level", address, bank, fader, level });
    }
  );

  server.registerTool(
    "fader_load",
    {
      description:
        "Press Load on a fader. Optionally put an unterminated target on the command line first (e.g. 'Sub 5') — Eos assigns by [target] then [Load], not 'Fader n Sub m'.",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        target: z
          .string()
          .optional()
          .describe("Optional command-line target to load, e.g. 'Sub 5' or 'Cue 1'"),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, target, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      if (target?.trim()) {
        await ctx.client.send("/eos/newcmd", target.trim());
      }
      const address = faderAction(bank, fader, "load");
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "fader_load", address, bank, fader, target });
    }
  );

  server.registerTool(
    "fader_unload",
    {
      description: "Unload a fader (clear its target)",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, confirm, allow_live }) => {
      return faderButton(ctx, bank, fader, "unload", { confirm, allow_live });
    }
  );

  server.registerTool(
    "fader_stop",
    {
      description: "Stop the fade on a fader",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, confirm, allow_live }) => {
      return faderButton(ctx, bank, fader, "stop", { confirm, allow_live });
    }
  );

  server.registerTool(
    "fader_fire",
    {
      description: "Fire (bump/assert) a fader",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, confirm, allow_live }) => {
      return faderButton(ctx, bank, fader, "fire", { confirm, allow_live });
    }
  );

  server.registerTool(
    "fader_bank_page",
    {
      description: "Page an OSC fader bank. Positive delta pages down, negative pages up.",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        delta: z.number().int().describe("Pages to move (e.g. 1, -1, 10)"),
      }),
    },
    async ({ bank, delta }) => {
      const address = faderBankPage(bank, delta);
      await ctx.client.send(address);
      return jsonResult({ ok: true, action: "fader_bank_page", address, bank, delta });
    }
  );

  server.registerTool(
    "fader_bank_reset",
    {
      description: "Reset an OSC fader bank configuration",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        confirm: z.boolean().optional(),
      }),
    },
    async ({ bank, confirm }) => {
      if (ctx.config.requireConfirm && !confirm) {
        return jsonResult({ ok: false, error: "Pass confirm=true to reset the fader bank." }, true);
      }
      const address = faderBankReset(bank);
      await ctx.client.send(address);
      return jsonResult({ ok: true, action: "fader_bank_reset", address, bank });
    }
  );

  server.registerTool(
    "submaster_set_level",
    {
      description: "Set a submaster level 0–100% (mapped to /eos/sub/{n} as 0.0–1.0)",
      inputSchema: z.object({
        sub: z.number().int().positive(),
        level: submasterLevelSchema,
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ sub, level, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const faderValue = level / 100;
      const address = subLevel(sub);
      await ctx.client.send(address, faderValue);
      return jsonResult({
        ok: true,
        action: "submaster_set_level",
        address,
        sub,
        level,
        faderValue,
      });
    }
  );

  const subBumpFields = {
    sub: z.number().int().positive(),
    edge: z.enum(["down", "up", "tap"]).optional(),
    ...liveWriteFields,
  };

  const subBumpHandler = async ({
    sub,
    edge,
    confirm,
    allow_live,
  }: {
    sub: number;
    edge?: "down" | "up" | "tap";
    confirm?: boolean;
    allow_live?: boolean;
  }) => {
    const blocked = gateLiveWrite(ctx, { confirm, allow_live });
    if (blocked) return blocked;

    const address = subFire(sub);
    await sendButton(ctx, address, edge);
    return jsonResult({
      ok: true,
      action: "submaster_bump",
      address,
      sub,
      edge: edge ?? "tap",
    });
  };

  server.registerTool(
    "submaster_bump",
    {
      description:
        "Bump a submaster (OSC button edge on /eos/sub/{n}). edge=down holds bump; edge=up releases; tap (default) press+release. Set level with submaster_set_level first if needed.",
      inputSchema: z.object(subBumpFields),
      annotations: { destructiveHint: true },
    },
    subBumpHandler
  );

  server.registerTool(
    "submaster_fire",
    {
      description: "Bump a submaster (legacy alias of submaster_bump).",
      inputSchema: z.object(subBumpFields),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const result = await subBumpHandler(args);
      if (result.isError) return result;
      const body = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      body.action = "submaster_fire";
      body.canonicalAction = "submaster_bump";
      return jsonResult(body);
    }
  );

  server.registerTool(
    "submaster_select",
    {
      description: "Select a submaster on the command line via /eos/sub",
      inputSchema: z.object({
        sub: z.number().int().positive(),
      }),
    },
    async ({ sub }) => {
      await ctx.client.send(subSelect(), sub);
      return jsonResult({ ok: true, action: "submaster_select", sub });
    }
  );
}

async function faderButton(
  ctx: EosContext,
  bank: number,
  fader: number,
  action: FaderAction,
  options: { confirm?: boolean; allow_live?: boolean }
) {
  const blocked = gateLiveWrite(ctx, options);
  if (blocked) return blocked;

  const address = faderAction(bank, fader, action);
  await sendButton(ctx, address);
  return jsonResult({ ok: true, action: `fader_${action}`, address, bank, fader });
}
