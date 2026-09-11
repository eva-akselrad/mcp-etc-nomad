import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  cueFire,
  cueListGo,
  cueListStop,
  cueSelect,
  keyPress,
  magicSheet,
} from "../eos/addresses.js";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import { cueFireFields, gateCueFire, gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

const cueNumber = z.union([z.number(), z.string()]);

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
        "Go To Cue (GTC): select cue then /eos/key/go_to_cue. Default uses cue's own time; time=0 slams (Assert). Prefer over cue_fire for timed playback.",
      inputSchema: z.object({
        cue: cueNumber,
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        time: z
          .union([z.number(), z.string()])
          .optional()
          .describe("Fade time override; 0 = slam (Assert). Omit to use cue's own time."),
        out: z.string().optional().describe("Out-time override before GTC."),
        assert: z
          .number()
          .optional()
          .default(0)
          .describe("Assert time (default 0). Used when time=0 for slam."),
        ...cueFireFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cue, cueList, part, time, out, assert, confirm, allow_live, override_rate_limit }) => {
      const blocked = gateCueFire(ctx, { confirm, allow_live, override_rate_limit });
      if (blocked) return blocked;

      const steps: string[] = [];

      if (part !== undefined && cueList !== undefined) {
        await ctx.client.send(cueSelect(cueList, cue), part);
      } else {
        await ctx.client.send(cueSelect(cueList), cue);
      }
      steps.push(`cue_select ${cueList ?? ""}/${cue}`);

      if (out !== undefined) {
        const outCmd = buildCommand(`Out ${out}`, "enter");
        await ctx.client.send("/eos/newcmd", outCmd.text);
        steps.push(outCmd.text);
      }

      if (time !== undefined) {
        if (time === 0 || time === "0") {
          await sendButton(ctx, keyPress("assert"));
          steps.push("/eos/key/assert");
          if (assert !== undefined && assert !== 0) {
            const assertCmd = buildCommand(`Assert ${assert}`, "enter");
            await ctx.client.send("/eos/newcmd", assertCmd.text);
            steps.push(assertCmd.text);
          }
        } else {
          const timeCmd = buildCommand(`Time ${time}`, "enter");
          await ctx.client.send("/eos/newcmd", timeCmd.text);
          steps.push(timeCmd.text);
        }
      }

      const gtcAddress = keyPress("go_to_cue");
      await sendButton(ctx, gtcAddress);
      steps.push(gtcAddress);

      return jsonResult({
        ok: true,
        action: "go_to_cue",
        steps,
        cueList,
        cue,
        part,
        time,
        out,
        assert,
      });
    }
  );

  server.registerTool(
    "cue_fire",
    {
      description:
        "Fire a specific cue immediately (slam/jump — no fade sequencing). Prefer go_to_cue for timed playback; cue_fire remains for instant recall.",
      inputSchema: z.object({
        cue: cueNumber,
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        ...cueFireFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cue, cueList, part, confirm, allow_live, override_rate_limit }) => {
      const blocked = gateCueFire(ctx, { confirm, allow_live, override_rate_limit });
      if (blocked) return blocked;

      const address = cueFire(cueList, cue, part);
      if (cueList === undefined) {
        await ctx.client.send(address, cue);
      } else {
        await ctx.client.send(address, 1.0);
      }
      return jsonResult({ ok: true, action: "cue_fire", address, cueList, cue, part });
    }
  );

  server.registerTool(
    "cue_go",
    {
      description: "Press the console Go key (Go_0) — sequential advance on the main playback",
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
      description: "Hold/Stop — halt a running fade and stay (/eos/key/stop). Does not go back.",
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
      description: "Go Back a cue via /eos/key/back (version-sensitive; use cue_hold to stop fades).",
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
    "cue_stop",
    {
      description:
        "Deprecated alias for cue_hold (stop fade, stay). Use cue_hold or cue_back explicitly.",
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
