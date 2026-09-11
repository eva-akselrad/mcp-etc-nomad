import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { keyPress } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { normalizeOscKey } from "../eos/keys.js";
import {
  gateSystemWrite,
  jsonResult,
  liveWriteFields,
  sendButton,
  systemWriteFields,
} from "./helpers.js";

async function waitForGetReply(
  ctx: EosContext,
  pattern: RegExp,
  timeoutMs: number
): Promise<{ address: string; args: unknown[] } | null> {
  try {
    return await ctx.listener.waitFor(pattern, timeoutMs);
  } catch {
    return null;
  }
}

export function registerNetworkTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "get_session_info",
    {
      description:
        "Session/console identity via /eos/get/processors, userlist, show/path, version. EOS_HOST must be session Host.",
      inputSchema: z.object({
        timeoutMs: z.number().int().positive().max(30000).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ timeoutMs }) => {
      const waitMs = timeoutMs ?? 3000;

      await ctx.client.send("/eos/get/processors");
      await ctx.client.send("/eos/get/userlist");
      await ctx.client.send("/eos/get/show/path");
      await ctx.client.send("/eos/get/version");
      await ctx.client.send("/eos/get/session");

      const replies = {
        processors: await waitForGetReply(ctx, /^\/eos\/out\/get\/processors$/, waitMs),
        userlist: await waitForGetReply(ctx, /^\/eos\/out\/get\/userlist$/, waitMs),
        showPath: await waitForGetReply(ctx, /^\/eos\/out\/get\/show\/path$/, waitMs),
        version: await waitForGetReply(ctx, /^\/eos\/out\/get\/version$/, waitMs),
        session: await waitForGetReply(ctx, /^\/eos\/out\/get\/session$/, waitMs),
      };

      const state = ctx.listener.getState();
      const warnings: string[] = [
        "OSC must target the session Host IP (EOS_HOST) — not backup/client consoles.",
        "Offline Nomad is not a Client of a live session.",
        "OSC user (EOS_USER_ID) ≠ console login; avoid user 0 for interactive Browser dialogs.",
      ];

      if (ctx.config.userId === 0) {
        warnings.push("EOS_USER_ID=0 (background) — avoid for save/load Browser workflows.");
      }

      if (ctx.config.protocol === "tcp") {
        warnings.push(
          `TCP port ${ctx.config.tcpPort} (${ctx.config.tcpMode}) is bidirectional — /eos/out/* arrives on the same socket, not UDP ${ctx.config.portRx}. Firewall both directions.`
        );
      } else {
        warnings.push(
          `UDP: TX→console:${ctx.config.portTx}, MCP listens ${ctx.config.portRx}. Firewall both directions or state stays empty.`
        );
      }

      return jsonResult({
        ok: true,
        host: ctx.config.host,
        oscUserId: ctx.config.userId,
        protocol: ctx.config.protocol,
        tcpPort: ctx.config.protocol === "tcp" ? ctx.config.tcpPort : undefined,
        tcpMode: ctx.config.protocol === "tcp" ? ctx.config.tcpMode : undefined,
        eosVersion: ctx.config.eosVersion,
        cached: {
          showPath: state.showPath,
          session: state.session,
          showFile: state.showFile,
        },
        replies,
        warnings,
        notes: [
          "Join/leave session roles are ECU Shell UI at boot — no session join OSC verb.",
          "Use identify_fixture for lamp flash; processors/userlist for console identity.",
        ],
      });
    }
  );

  server.registerTool(
    "network_session_join",
    {
      description:
        "Open mirror dialog (Shell/Browser UI). Full Primary/Backup/Client join requires ECU at boot — not OSC.",
      inputSchema: z.object({
        open_mirror_dialog: z
          .boolean()
          .optional()
          .describe("When true (default), press open_mirror_dialog key to list Hosts."),
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      const sent: string[] = [];
      if (args.open_mirror_dialog !== false) {
        const address = keyPress(normalizeOscKey("open_mirror_dialog"));
        await sendButton(ctx, address);
        sent.push(address);
      }

      return jsonResult({
        ok: true,
        action: "network_session_join",
        manualStepRequired: true,
        sent,
        notes: [
          "No session-join OSC verb — role is ECU Welcome Screen (Browser > File > Exit Eos).",
          "Mirror dialog lists Hosts; user selects in CIA. Offline Nomad ≠ live Client.",
          "Verify Host with get_session_info (/eos/get/processors, userlist).",
          "EOS_HOST must be the session Host console IP.",
        ],
        eosVersion: ctx.config.eosVersion,
      });
    }
  );

  server.registerTool(
    "network_session_leave",
    {
      description:
        "Exit mirror mode (exit key). ECU role unchanged. Stop Mirroring softkey / ALT+F2 also works.",
      inputSchema: z.object({
        ...liveWriteFields,
        ...systemWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      const address = keyPress(normalizeOscKey("exit"));
      await sendButton(ctx, address);

      return jsonResult({
        ok: true,
        action: "network_session_leave",
        manualStepRequired: true,
        sent: [address],
        notes: [
          "Stop Mirroring softkey / ALT+F2 exits mirror (no documented OSC name).",
          "Leaving session role requires ECU reboot — not this tool.",
          "detach_patch_device is for dimmer/RDM in Patch, not network leave.",
        ],
      });
    }
  );
}
