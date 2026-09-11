import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  cueFire,
  cueListGo,
  cueListStop,
  cueSelect,
  magicSheet,
} from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { gateCueFire, gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

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
    "cue_fire",
    {
      description:
        "Fire a specific cue immediately (does not follow GO sequencing). Use cue_go to advance.",
      inputSchema: z.object({
        cue: cueNumber,
        cueList: z.number().int().positive().optional(),
        part: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cue, cueList, part, confirm, allow_live }) => {
      const blocked = gateCueFire(ctx, { confirm, allow_live });
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
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allow_live }) => {
      const blocked = gateCueFire(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = "/eos/key/go_0";
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_go", address });
    }
  );

  server.registerTool(
    "cue_stop",
    {
      description:
        "Stop/Back: halt a running fade, or go back a cue if nothing is fading. Optional cue list uses /eos/cues/{n}/stop.",
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
        return jsonResult({ ok: true, action: "cue_stop", address: "/eos/key/stop" });
      }

      const address = cueListStop(cueList);
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_stop", address, cueList });
    }
  );

  server.registerTool(
    "cue_list_go",
    {
      description: "Go on a cue list via /eos/cues/{list}/fire (main playback if cueList omitted)",
      inputSchema: z.object({
        cueList: z.number().int().positive().optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ cueList, confirm, allow_live }) => {
      const blocked = gateCueFire(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = cueListGo(cueList);
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "cue_list_go", address, cueList });
    }
  );

  server.registerTool(
    "get_pending_cues",
    {
      description: "Return pending cue text and OSC cache entries from /eos/out/pending/cue/*",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = ctx.listener.getState();
      return jsonResult({
        pendingCue: state.pendingCue,
        pendingCues: state.pendingCues,
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
