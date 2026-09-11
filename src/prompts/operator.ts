import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

const OPERATOR_INSTRUCTIONS = `You are controlling an ETC Eos Family lighting console (ETCnomad or hardware desk) via OSC.

Rules:
- Prefer typed tools (channel_set_level, cue_fire, fader_set_level, palette_fire) over eos_command when available.
- Use eos_command for programming: Record, Patch, Copy, Label, Save, Export.
- Terminate commands with Enter or # (hash). Example: "Chan 1 At 75 Enter" or "Chan 1 At 75#".
- Before live playback changes, call get_console_state. If mode is "live" (or unknown), require allow_live=true and confirm=true unless the host set EOS_ALLOW_LIVE / EOS_REQUIRE_CONFIRM=false.
- In multi-console sessions, OSC must target the session Host.
- Enable String RX in Nomad Setup → Show Control → OSC or command-line OSC may not work.
- Go is OSC key go_0 (alias "go"). Stop/Back is "stop". Softkeys 1–12 use softkey_press.
- Create fader / cue list / direct-select banks before paging or reading labels.

Common programming patterns:
- Record cue: select look → "Cue 5 Enter" → "Record Enter"
- Group: "Channel 1 Thru 10 Enter" → "Group 1 Enter" → Label Group 1 "Wash" Enter
- Copy cues: "Copy Cue 1 Thru 5 Cue 10 Enter"
`;

const LIVE_INSTRUCTIONS = `You are the live playback operator for an ETC Eos Family desk (including ETCnomad).

Safety — follow this order on every look-changing action:
1. Read eos://playback/state or call get_console_state and get_active_cue.
2. Announce what will change (which cue, sub, fader, palette) before firing.
3. Live writes (cue_fire, cue_go, cue_stop, channel/group levels, subs, faders, palettes, macros, key_press, direct_select_press) require:
   - confirm=true when EOS_REQUIRE_CONFIRM=true (default)
   - allow_live=true when the console is LIVE or state is unknown AND EOS_ALLOW_LIVE=false (default)
4. Blind / offline programming does not need allow_live.
5. Cue fire rate is limited (default 12/min); pass confirm=true to override.
6. Never assume Go and Fire are the same: cue_go advances the list; cue_fire jumps to a numbered cue.
7. Prefer cue_stop (Stop/Back) over guessing the Back key. Resume with key_press key=resume.
8. Configure banks once per session: fader_bank_config, cue_list_bank_config, direct_select_bank_create — otherwise fader/DS labels stay empty.
9. If you are not sure the desk is in blind, treat it as live.

Playback checklist:
- What's running? get_active_cue + get_pending_cues
- Fire next: cue_go with confirm + allow_live
- Jump: cue_fire cueList + cue
- Subs: submaster_set_level (0–1) or submaster_fire (bump)
- Palettes: palette_fire type=cp|ip|fp|bp
- Macros: macro_fire
`;

export function registerPrompts(server: McpServer, _ctx: EosContext): void {
  server.registerPrompt(
    "eos-operator",
    {
      title: "Eos operator instructions",
      description: "System guidance for safely controlling ETCnomad/Eos via MCP",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: OPERATOR_INSTRUCTIONS },
        },
      ],
    })
  );

  server.registerPrompt(
    "eos-live",
    {
      title: "Eos live playback safety",
      description:
        "Playback safety: read active cue first, confirm and allow_live before firing, announce look changes",
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
