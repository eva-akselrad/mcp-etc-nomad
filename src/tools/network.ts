import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { keyPress } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { normalizeOscKey } from "../eos/keys.js";
import { UNVERIFIED_BROWSER_KEY_SEQUENCES } from "../eos/show-admin.js";
import {
  gateSystemWrite,
  jsonResult,
  liveWriteFields,
  sendButton,
  systemWriteFields,
  unverifiedBrowserKeyFields,
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
          `TCP ${ctx.config.tcpPort} OSC ${ctx.config.tcpOscVersion} (${ctx.config.tcpMode}) — bidirectional on one socket; /eos/out/* not UDP ${ctx.config.portRx}. Enable OSC RX+TX in Setup. 3037 Third Party ≈ realtime /eos/out; 3032 ≈ 1Hz. Firewall both directions.`
        );
      } else {
        warnings.push(
          `UDP (MCP default): TX→console:${ctx.config.portTx}, MCP listens ${ctx.config.portRx}. ETC prefers TCP for reliability. Firewall both directions or state stays empty.`
        );
      }

      return jsonResult({
        ok: true,
        host: ctx.config.host,
        oscUserId: ctx.config.userId,
        protocol: ctx.config.protocol,
        tcpPort: ctx.config.protocol === "tcp" ? ctx.config.tcpPort : undefined,
        tcpMode: ctx.config.protocol === "tcp" ? ctx.config.tcpMode : undefined,
        tcpOscVersion: ctx.config.protocol === "tcp" ? ctx.config.tcpOscVersion : undefined,
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
    "osc_set_user",
    {
      description:
        "Set OSC virtual user routing for subsequent commands (/eos/user/{id} prefix). -1 = match console.",
      inputSchema: z.object({
        user_id: z
          .number()
          .int()
          .min(-1)
          .max(99)
          .describe("OSC user 0–99; 0 = background (avoid for Browser dialogs); -1 = match console."),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ user_id }) => {
      ctx.config.userId = user_id;
      const warnings: string[] = [];
      if (user_id === 0) {
        warnings.push("OSC user 0 is background — avoid for interactive save/load Browser workflows.");
      }
      if (user_id >= 0) {
        await ctx.client.send("/eos/user", user_id);
      }
      return jsonResult({
        ok: true,
        oscUserId: user_id,
        note:
          user_id < 0
            ? "Subsequent commands use console-matched user (no /eos/user prefix)."
            : `Subsequent commands prefixed /eos/user/${user_id}/…`,
        warnings,
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
          .describe(
            "When true, press unverified open_mirror_dialog key (Tab 7 verification). Default false — needsManual + facepanel steps."
          ),
        ...liveWriteFields,
        ...systemWriteFields,
        ...unverifiedBrowserKeyFields,
      }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      const blocked = gateSystemWrite(ctx, args);
      if (blocked) return blocked;

      const sent: string[] = [];
      const pressKeys = args.open_mirror_dialog === true || args.press_unverified_browser_keys === true;
      if (pressKeys) {
        for (const raw of UNVERIFIED_BROWSER_KEY_SEQUENCES.join) {
          const address = keyPress(normalizeOscKey(raw));
          await sendButton(ctx, address);
          sent.push(address);
        }
      }

      return jsonResult({
        ok: true,
        action: "network_session_join",
        needsManual: true,
        browserPath: "Facepanel / Shell: mirror dialog or ECU Welcome Screen at boot",
        sent,
        notes: [
          "No session-join OSC verb — role is ECU Welcome Screen (Browser > File > Exit Eos).",
          "Mirror dialog lists Hosts; user selects in CIA. Offline Nomad ≠ live Client.",
          "Verify Host with get_session_info (/eos/get/processors, userlist).",
          "EOS_HOST must be the session Host console IP.",
          "Unverified open_mirror_dialog key is not sent unless open_mirror_dialog=true or press_unverified_browser_keys=true (Tab 7 verification).",
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
        needsManual: true,
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
