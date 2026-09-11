import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  cueListGo,
  cueListStop,
  cueSelect,
  keyPress,
  magicSheet,
} from "../eos/addresses.js";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import { buildGoToCueCommand } from "../eos/programming.js";
import { goToCueBaseSchema, refineGoToCueXor } from "../specs/lighting-ops.js";
import { cueFireFields, gateCueFire, gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

const cueNumber = z.union([z.number(), z.string()]);

const goToCueInputSchema = refineGoToCueXor({
  ...goToCueBaseSchema.shape,
  time: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Fade time override prepended via CLI; 0 = slam (Assert). Omit for cue's own time."),
  assert: z
    .number()
    .optional()
    .default(0)
    .describe("Assert time when time=0 (default 0)."),
  method: z.enum(["cli", "key"]).optional().default("cli"),
  ...cueFireFields,
});

async function sendCliStep(ctx: EosContext, line: string): Promise<string> {
  const cmd = buildCommand(line, "enter");
  await ctx.client.send("/eos/newcmd", cmd.text);
  return cmd.text;
}

type GoToCueRunArgs = {
  cue?: number | string;
  cueList?: number;
  out?: boolean;
  cueZero?: boolean;
  time?: number | string;
  assert?: number;
  method?: "cli" | "key";
  confirm?: boolean;
  allow_live?: boolean;
  override_rate_limit?: boolean;
};

async function runGoToCue(ctx: EosContext, args: GoToCueRunArgs) {
  const blocked = gateCueFire(ctx, args);
  if (blocked) return blocked;

  const { cue, cueList, out, cueZero, time, assert, method } = args;
  const hasCue = cue !== undefined;
  const hasOut = out === true;
  const hasCueZero = cueZero === true;
  const count = [hasCue, hasOut, hasCueZero].filter(Boolean).length;
  if (count !== 1) {
    return jsonResult(
      { ok: false, error: "Provide exactly one of cue, out=true, or cueZero=true (XOR)." },
      true
    );
  }

  const steps: string[] = [];
  const transport = method ?? "cli";

  if (transport === "cli") {
    if (time !== undefined) {
      if (time === 0 || time === "0") {
        if (assert !== undefined && assert !== 0) {
          steps.push(await sendCliStep(ctx, `Assert ${assert}`));
        } else {
          await sendButton(ctx, keyPress("assert"));
          steps.push("/eos/key/assert");
        }
      } else {
        steps.push(await sendCliStep(ctx, `Time ${time}`));
      }
    }

    const line = buildGoToCueCommand({ cue, cueList, out, cueZero });
    steps.push(await sendCliStep(ctx, line));

    return jsonResult({
      ok: true,
      action: "go_to_cue",
      method: "cli",
      path: "/eos/newcmd",
      steps,
      cueList,
      cue,
      out,
      cueZero,
      time,
    });
  }

  if (time !== undefined && (time === 0 || time === "0")) {
    await sendButton(ctx, keyPress("assert"));
    steps.push("/eos/key/assert");
  } else if (time !== undefined) {
    steps.push(await sendCliStep(ctx, `Time ${time}`));
  }

  const gtcAddress = keyPress(hasCueZero ? "go_to_cue_0" : "go_to_cue");
  await sendButton(ctx, gtcAddress);
  steps.push(gtcAddress);

  return jsonResult({
    ok: true,
    action: "go_to_cue",
    method: "key",
    steps,
    cueList,
    cue,
    out,
    cueZero,
    time,
    note: "CLI method preferred; key path does not enter cue digits — select cue first if needed.",
  });
}

export function registerPlaybackTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "cue_select",
    {
      description: "Select a cue (and optional part) on the command line, optionally within a cue list",
      inputSchema: z.object({
        cue: cueNumber,
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
      }),
    },
    async ({ cue, cueList, part }) => {
      if (part !== undefined && cueList !== undefined) {
        await ctx.client.send(cueSelect(cueList, cue), part);
      } else {
        await ctx.client.send(cueSelect(cueList), cue);
      }
      return jsonResult({ ok: true, action: "cue_select", cueList, cue, part });
    }
  );

  server.registerTool(
    "go_to_cue",
    {
      description:
        "Go To Cue (GTC) via CLI /eos/newcmd (preferred): 'Go To Cue 5', 'Go To Cue 1/10', 'Go To Cue Out', 'Go To Cue 0'. NOT /eos/cue/.../fire or /eos/key/go_0. Optional method=key uses /eos/key/go_to_cue or go_to_cue_0.",
      inputSchema: goToCueInputSchema,
      annotations: { destructiveHint: true },
    },
    async (args) => runGoToCue(ctx, args)
  );

  const cueFireInputSchema = z.object({
    cue: cueNumber,
    cueList: z.number().int().positive().optional(),
    assert: z
      .number()
      .optional()
      .default(0)
      .describe("Assert time when slamming (time=0, default 0)."),
    method: z.enum(["cli", "key"]).optional().default("cli"),
    ...cueFireFields,
  });

  const cueFireHandler = async (args: z.infer<typeof cueFireInputSchema>) =>
    runGoToCue(ctx, {
      cue: args.cue,
      cueList: args.cueList,
      time: 0,
      assert: args.assert ?? 0,
      method: args.method,
      confirm: args.confirm,
      allow_live: args.allow_live,
      override_rate_limit: args.override_rate_limit,
    });

  server.registerTool(
    "cue_fire",
    {
      description:
        "Instant cue slam (alias of go_to_cue with time=0: Assert + GTC via /eos/newcmd). NOT /eos/cue/.../fire.",
      inputSchema: cueFireInputSchema,
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const result = await cueFireHandler(args);
      if (result.isError) return result;
      const body = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      body.action = "cue_fire";
      body.canonicalAction = "go_to_cue";
      body.time = 0;
      return jsonResult(body);
    }
  );

  server.registerTool(
    "cue_go",
    {
      description: "Press [Go] via /eos/key/go_0 — sequential advance (NOT Go To Cue).",
      inputSchema: z.object({
        ...cueFireFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allow_live, override_rate_limit }) => {
      const blocked = gateCueFire(ctx, { confirm, allow_live, override_rate_limit });
      if (blocked) return blocked;

      const address = "/eos/key/go_0";
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_go", address });
    }
  );

  server.registerTool(
    "cue_hold",
    {
      description:
        "Stop/Hold via /eos/key/stop (while fading = hold; idle = back). List: /eos/cues/stop or /eos/cues/{list}/stop. Main list: stop_back_main_cuelist.",
      inputSchema: z.object({
        cueList: z.number().int().positive().optional(),
        mainList: z.boolean().optional().describe("Use /eos/key/stop_back_main_cuelist"),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cueList, mainList, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      if (mainList) {
        const address = keyPress("stop_back_main_cuelist");
        await sendButton(ctx, address);
        return jsonResult({ ok: true, action: "cue_hold", address, mainList: true });
      }

      if (cueList === undefined) {
        await sendButton(ctx, "/eos/key/stop");
        return jsonResult({ ok: true, action: "cue_hold", address: "/eos/key/stop" });
      }

      const address = cueListStop(cueList);
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_hold", address, cueList });
    }
  );

  server.registerTool(
    "cue_back",
    {
      description:
        "Explicit Go Back via /eos/key/back (version-sensitive). Prefer cue_hold (/eos/key/stop) which holds while fading and backs when idle.",
      inputSchema: z.object({
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("back");
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_back", address });
    }
  );

  server.registerTool(
    "cue_resume",
    {
      description: "Resume a stopped fade via /eos/key/resume.",
      inputSchema: z.object({
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = keyPress("resume");
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "cue_resume", address, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "cue_stop",
    {
      description:
        "Deprecated alias for cue_hold. Use cue_hold (stop/hold while fading) or cue_back (explicit back key) explicitly.",
      inputSchema: z.object({
        cueList: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cueList, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      if (cueList === undefined) {
        await sendButton(ctx, "/eos/key/stop");
        return jsonResult({
          ok: true,
          action: "cue_stop",
          aliasOf: "cue_hold",
          address: "/eos/key/stop",
        });
      }

      const address = cueListStop(cueList);
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_stop", aliasOf: "cue_hold", address, cueList });
    }
  );

  server.registerTool(
    "cue_list_go",
    {
      description: "Go on a cue list via /eos/cues/{list}/fire (main playback if cueList omitted)",
      inputSchema: z.object({
        cueList: z.number().int().positive().optional(),
        ...cueFireFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cueList, confirm, allow_live, override_rate_limit }) => {
      const blocked = gateCueFire(ctx, { confirm, allow_live, override_rate_limit });
      if (blocked) return blocked;

      const address = cueListGo(cueList);
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_list_go", address, cueList });
    }
  );

  server.registerTool(
    "get_pending_cues",
    {
      description:
        "Return pending cue text, per-list pending stack, and OSC cache from /eos/out/pending/cue/*",
      inputSchema: z.object({
        cueList: z.number().int().positive().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cueList }) => {
      const state = ctx.listener.getState();
      const pendingByList = cueList !== undefined
        ? { [String(cueList)]: state.pendingByCueList[String(cueList)] ?? [] }
        : state.pendingByCueList;
      return jsonResult({
        pendingCue: state.pendingCue,
        pendingCues: state.pendingCues,
        pendingByCueList: pendingByList,
        lastSyncedAt: state.lastSyncedAt,
      });
    }
  );

  server.registerTool(
    "magic_sheet_open",
    {
      description: "Open a magic sheet, optionally a specific view",
      inputSchema: z.object({
        sheet: z.number().int().positive(),
        view: z.number().int().positive().optional(),
      }),
    },
    async ({ sheet, view }) => {
      await ctx.client.send(magicSheet(sheet, view), view ?? sheet);
      return jsonResult({ ok: true, action: "magic_sheet_open", sheet, view });
    }
  );
}
