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
- Subs: submaster_set_level (0–1) for intensity; submaster_fire for bump (edge only — set level first if needed)
- Palettes: palette_fire type=cp|ip|fp|bp
- Macros: macro_fire
`;

const PROGRAMMER_INSTRUCTIONS = `You are programming an ETC Eos Family console via MCP (Eos OSC domain rules).

## Transport
1. Programming ≈ /eos/cmd or /eos/newcmd — there is NO OSC Record verb. Typed tools use eos_new_command (/eos/newcmd) so leftover CLI does not corrupt the next action. Prefer eos_new_command for multi-step flows.
2. Always terminate with # or Enter. Unterminated text stays on the command line.
3. String RX must be ON (Setup → Show Control → OSC) or commands silently fail.
4. /eos/event and /eos/newevent are background/event semantics — NOT interactive programming.
5. Commands run as the OSC user. Blind/Live and selection are per that user. Patch wants Blind; live Record changes the running look.

## Record / Update
6. Record needs look + target:
   - Two-step: Cue 5 Enter → Record Enter (style=two_step)
   - One-shot: Record Cue 5 Enter (style=one_shot, default)
7. Record vs Record Only (mode=record_only) — wrong choice overwrites or leaves empty targets.
8. Update only commits manual/red values. After Go, Make Manual or re-select channels — else Update is useless.
9. Pass scope on cue_update: all | cue_only | track. Live vs Blind Update dialogs differ on desk.
10. Parts: Cue 1 Part 2 Enter then Record/Update — never assume multipart from bare cue number.

## Copy / Move / Delete
11. Cue copy: Copy Cue 1 Thru 5 Cue 10 Enter (programming_copy). Omit cueList on active list.
12. Channel Copy To ≠ patch copy. Live levels vs patch 111 Copy To 116 (patch_copy_to). {Plus Show}/{Only Show} softkeys change scope.
13. Patch MOVE = double Copy To: 116 Copy To Copy To 120 (patch_move). Single Copy To is NOT move.
14. Move Effect 1 At Effect 2 (programming_move sourceType=effect) — do not reuse cue copy templates.
15. Delete: confirm=true AND confirm_delete=true. Desk may need second Enter. Prefer Blind. Sneak/Home/Out are NOT Delete.
16. After record/copy/delete, refresh_cache runs sync_show_targets — do not trust stale eos://show/* resources.

## Tools
- cue_record, cue_update, programming_copy, programming_move, programming_delete
- patch_copy_to, patch_move, unpatch_channel (unpatch ≠ delete)
- group_record, target_label (use_osc=true for /eos/set/.../label on group/cue)
- sync_show_targets, query_groups / query_cuelists / query_cues

Pin EOS_VERSION in env for syntax hints. eos_command remains the parity backstop.
`;

const PATCH_INSTRUCTIONS = `You are patching fixtures on an ETC Eos Family console via MCP (Eos OSC domain rules).

## Transport
- Patch programming uses /eos/newcmd (typed tools) or /eos/cmd — String RX required or silent failure.
- Commands run as OSC user; prefer Blind for patch work.

## Patch rules
17. Enter Patch display first on Live CLI (enter_patch_display=true) or syntax may misread.
18. Pin EOS_VERSION — patch syntax is version-sensitive (check tool responses for eosVersion).
19. Prefer explicit Address and Universe in patch_channel templates.
20. Unpatch (unpatch_channel) ≠ Delete channel data (programming_delete).
21. Prefer fixtureTypeNumber over fixtureType names when automating (spaces in library names).

## Examples
- patch_channel channel=101 address=1 universe=1 fixtureTypeNumber=42 enter_patch_display=true
- patch_copy_to sourceChannel=111 destChannel=116 (patch only, not live Copy To)
- patch_move sourceChannel=116 destChannel=120 (double Copy To)
- unpatch_channel channel=101 confirm=true confirm_delete=true

## After patch
- Run sync_show_targets before trusting eos://show/groups or cue caches.
- Labels: target_label with use_osc=true sends /eos/set/group|cue/.../label; Record stays CLI.

Nomad offline: dongle tier caps outputs. Multi-console: OSC to session Host only.
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
    "eos-programmer",
    {
      title: "Eos programming patterns",
      description: "OSC/cmd transport, record/update/copy/move/delete, sync, Eos domain constraints",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: PROGRAMMER_INSTRUCTIONS },
        },
      ],
    })
  );

  server.registerPrompt(
    "eos-patch",
    {
      title: "Eos patch syntax",
      description: "Patch display, Copy To vs move, unpatch, EOS_VERSION, Address/Universe",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: PATCH_INSTRUCTIONS },
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
