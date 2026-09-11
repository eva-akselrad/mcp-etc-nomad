import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import { keyPress } from "../eos/addresses.js";
import { normalizeOscKey } from "../eos/keys.js";
import { gateSystemWrite, jsonResult, liveWriteFields, sendButton, systemWriteFields } from "./helpers.js";

export function registerNetworkTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "get_session_info",
    {
      description:
        "Query multi-console session + show path via /eos/get/session and /eos/get/show/path (OSC cache).",
      inputSchema: z.object({
        timeoutMs: z.number().int().positive().max(30000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ timeoutMs }) => {
      await ctx.client.send("/eos/get/session");
      await ctx.client.send("/eos/get/show/path");
      await ctx.client.send("/eos/get/version");

      const waitMs = timeoutMs ?? 3000;
      const results: Record<string, unknown> = {};

      try {
        results.session = await ctx.listener.waitFor(/^\/eos\/out\/get\/session$/, waitMs);
      } catch {
        results.session = null;
      }

      try {
        results.showPath = await ctx.listener.waitFor(/^\/eos\/out\/get\/show\/path$/, waitMs);
      } catch {
        results.showPath = null;
      }

      try {
        results.version = await ctx.listener.waitFor(/^\/eos\/out\/get\/version$/, waitMs);
      } catch {
        results.version = null;
      }

      const state = ctx.listener.getState();
      return jsonResult({
        ok: true,
        host: ctx.config.host,
        protocol: ctx.config.protocol,
        tcpPort: ctx.config.protocol === "tcp" ? ctx.config.tcpPort : undefined,
        cached: {
          showPath: state.showPath,
          session: state.session,
          showFile: state.showFile,
        },
        replies: results,
        notes: [
          "OSC must target the session Host in multi-console systems.",
          "Role assignment (Primary/Backup/Client) is set in ECU Welcome Screen at boot.",
        ],
      });
    }
  );

  server.registerTool(
    "network_session_join",
    {
      description:
        "Join a multi-console session as client/backup mirror, or open mirror dialog. Full role join requires ECU at boot.",
      inputSchema: z.object({
        mode: z
          .enum(["mirror_dialog", "mirror_host_index"])
          .optional()
          .describe("mirror_dialog opens host list; mirror_host_index selects by list index (1-based)."),
        host_index: z.number().int().positive().optional(),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      const sent: string[] = [];

      if (args.mode === "mirror_host_index" && args.host_index !== undefined) {
        await ctx.client.send("/eos/newcmd", buildCommand("Displays", "enter").text);
        sent.push("Displays Enter");
        await sendButton(ctx, keyPress(normalizeOscKey("open_mirror_dialog")));
        sent.push("/eos/key/open_mirror_dialog");
        const digits = String(args.host_index).split("");
        for (const digit of digits) {
          await sendButton(ctx, keyPress(normalizeOscKey(digit)));
          sent.push(`/eos/key/${digit}`);
        }
        await sendButton(ctx, keyPress(normalizeOscKey("enter")));
        sent.push("/eos/key/enter");
      } else {
        await sendButton(ctx, keyPress(normalizeOscKey("open_mirror_dialog")));
        sent.push("/eos/key/open_mirror_dialog");
      }

      return jsonResult({
        ok: true,
        action: "network_session_join",
        mode: args.mode ?? "mirror_dialog",
        sent,
        notes: [
          "Primary/Backup/Client role is chosen in ECU Welcome Screen (Browser > File > Exit Eos).",
          "Mirror mode follows a Host; use get_session_info to verify connectivity.",
          "Software versions must match across all session devices.",
        ],
        eosVersion: ctx.config.eosVersion,
      });
    }
  );

  server.registerTool(
    "network_session_leave",
    {
      description:
        "Leave mirror mode (Stop Mirroring) or detach from a mirrored session. Does not change ECU role.",
      inputSchema: z.object({
        mode: z.enum(["exit_mirror"]).optional(),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      const sent: string[] = [];
      await sendButton(ctx, keyPress(normalizeOscKey("exit")));
      sent.push("/eos/key/exit");

      return jsonResult({
        ok: true,
        action: "network_session_leave",
        mode: args.mode ?? "exit_mirror",
        sent,
        notes: [
          "Stop Mirroring softkey / ALT+F2 also exits mirror mode (no documented OSC name).",
          "Clients without a dongle cannot exit mirror mode.",
          "ECU role (Primary/Backup/Client) requires reboot via ECU Welcome Screen.",
          "Use detach_patch_device for dimmer/RDM detach in Patch — not this tool.",
        ],
      });
    }
  );
}
