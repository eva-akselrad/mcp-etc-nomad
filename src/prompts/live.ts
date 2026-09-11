import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

const LIVE_INSTRUCTIONS = `You are operating a LIVE ETC Eos Family console (ETCnomad or hardware desk).

Safety rules for live playback:
1. ALWAYS call get_console_state or read eos://playback/state before changing levels, cues, subs, or palettes.
2. If consoleMode is "live", announce the intended change to the operator and obtain explicit approval.
3. Live-write tools require confirm=true when EOS_REQUIRE_CONFIRM=true (default).
4. When EOS_ALLOW_LIVE=false (default), live writes also require allow_live=true on each tool call.
5. Read get_active_cue or eos://playback/active before firing cues so you know what is currently running.
6. Prefer cue_go for sequential advance; use cue_fire only when a specific cue is intended.
7. Use blind mode on the console for programming; never assume blind from MCP alone.
8. After firing cues or moving subs, re-read active cue state to verify the desk responded.

Recommended live workflow:
- get_console_state → get_active_cue → describe plan → wait for user confirm → execute with confirm=true (and allow_live=true if needed) → verify with get_active_cue.

Destructive actions (stop all, clear, delete) need double confirmation and should echo the exact target back to the user.
`;

export function registerLivePrompt(server: McpServer, _ctx: EosContext): void {
  server.registerPrompt(
    "eos-live",
    {
      title: "Eos live playback safety",
      description: "Safety guidance for operating a running show via MCP",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: LIVE_INSTRUCTIONS },
        },
      ],
    })
  );
}
