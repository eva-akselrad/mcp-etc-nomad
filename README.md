# MCP ETC Nomad

**GitHub:** https://github.com/eva-akselrad/mcp-etc-nomad

TypeScript [Model Context Protocol](https://modelcontextprotocol.io) server for **ETC Eos Family** lighting consoles — including **ETCnomad** on PC/Mac.

Control ETCnomad and Eos desks over **OSC** so an LLM can operate cues, levels, subs, macros, and the full Eos command line.

> See **[PLAN.md](./PLAN.md)** for the full roadmap to operator parity.

## Phase status

| Phase | Status |
|-------|--------|
| 0 Foundation | Implemented |
| 1 Playback parity | Implemented |
| **2 Programming parity** | **Implemented** |
| 2.5 Lighting Expert pack | **Implemented** |
| 3 Show & system admin | Partial (`show_save`; full load/merge/export pending) |
| 4 Hardening & distribution | Not started |

## Phase 1 (playback)

Live-write tools require `confirm=true` when `EOS_REQUIRE_CONFIRM=true` (default) and `allow_live=true` when the console is **LIVE** (or state is unknown) and `EOS_ALLOW_LIVE=false` (default). Read `get_console_state` / `eos://playback/state` first.

**Intensity scales:** channel/group levels are **0–100** (percent). Faders, subs, and grandmaster use **0.0–1.0**. Cue-fire rate limit (default 12/min) is bypassed with `override_rate_limit=true` — `confirm` does **not** bypass rate limits.

| Group | Tools |
|-------|--------|
| Playback | `go_to_cue` (CLI GTC preferred), `cue_select`, `cue_fire`, `cue_go`, `cue_hold`, `cue_back`, `cue_resume`, `cue_stop` (deprecated→hold), `cue_list_go`, `get_active_cue`, `get_pending_cues` |
| GM / BO | `grandmaster_set_level` (0–1), `blackout` (BO key — never Chan Thru Out) |
| Channel check | `highlight`, `rem_dim`, `timing_disable`, `sneak`, `home` |
| Park | `park_channel`, `unpark_channel`, `get_parked` |
| Cue list banks | `cue_list_bank_config`, `cue_list_bank_page`, `cue_list_bank_select`, `cue_list_bank_reset` |
| Faders / subs | `fader_bank_config`, `fader_set_level`, `fader_load` / `_unload` / `_stop` / `_fire`, `fader_bank_page`, `fader_bank_reset`, `submaster_set_level`, `submaster_fire`, `submaster_select` |
| Palettes / presets | `palette_select`, `palette_fire`, `preset_select`, `preset_fire` |
| Keys / macros | `key_press`, `softkey_press`, `macro_select`, `macro_fire`, `staging_mode_toggle`, `list_osc_keys` |
| Direct selects | `direct_select_bank_create`, `direct_select_bank_page`, `direct_select_press` |
| Command line | `eos_command`, `eos_new_command`, `eos_event` |
| Levels | `channel_select` (Thru/+), `channel_set_level` (0–100), `channel_set_dmx`, `group_select`, `group_set_level`, `at_set_level` |
| Color / params | `color_set_hs`, `color_set_rgb`, `channel_set_param` |
| Queries | `get_console_state`, `get_command_line`, `get_fader_labels_levels`, `get_direct_selects`, `wait_for_osc`, `osc_reset`, `magic_sheet_open` |

**Resources:** `eos://playback/active`, `eos://playback/pending`, `eos://playback/state`, `eos://playback/faders`, `eos://console/keys`

**Prompts:** `eos-operator`, `eos-live`

OSC addresses follow the [ETC OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm). Go is `go_0`; Stop/Back is `stop`. Create fader / cue-list / direct-select banks before paging or reading labels.

## Phase 2 (programming)

Programming writes use the same `confirm` / `allow_live` gates as playback. Destructive deletes also require `confirm_delete=true` when `EOS_REQUIRE_CONFIRM=true`.

| Group | Tools |
|-------|--------|
| Record / update | `record_cue`, `update_cue`, `make_manual`, `set_cue_timing`, `record_group`, `record_preset`, `record_palette`, `show_save` (Shift+Update quick-save) |
| Copy / move / delete | `copy_target`, `move_target`, `delete_target` (+ `confirm_delete`) |
| OSC set | `label_target`, `group_set_channels` (`/eos/set/...`; Thru as `>`) |
| Patch | `patch_channel`, `patch_copy_to`, `patch_move`, `unpatch_channel` |
| Sync / get | `sync_show_targets` (optional `patch=true`), `get_groups`, `get_cuelists`, `get_cues`, `get_presets`, `get_palettes`, `get_patch` |
| Command line | `eos_command`, `eos_new_command` (typed tools use **newcmd**); no `/eos/record` verb |

**Resources:** `eos://show/groups`, `eos://show/cuelists`, `eos://show/cues/{list}`, `eos://show/patch`, `eos://show/presets`, `eos://show/palettes/{type}`

**Prompts:** `eos-programmer`, `eos-patch`

Sync uses OSC `/eos/get/*` request/response (node-eos-console / EosSyncLib pattern): count → index → cache in listener state. Subscribe with `/eos/subscribe=1` on sync (default).

## Quick start

```bash
npm install
npm run build
npm start
```

Development:

```bash
npm run dev
```

## ETCnomad OSC setup

Setup → System Settings → Show Control → OSC:

| Setting | Value |
|---------|-------|
| OSC RX | On |
| OSC TX | On |
| String RX | On |
| UDP RX Port | `8000` (match `EOS_PORT_TX`) |
| UDP TX Port | `9001` (match `EOS_PORT_RX`) |

Use the console IP from Nomad Shell (not always `127.0.0.1` when MCP runs on another machine).

Copy `.env.example` to `.env` and adjust.

## Testing

**Mock OSC (no Nomad hardware):** the test harness in `test/` listens on a local UDP port, captures MCP tool TX packets, and sends canned `/eos/out/*` replies (see PLAN.md §11.1).

```bash
npm test
```

Runs address builders, live/confirm gate checks, bank-config sequencing, and mock-peer integration tests. Fader level tests assert **TX only** — Eos echoes `/eos/out/fader` after ~3s, so the harness does not expect an immediate echo.

**Nomad offline smoke (manual):** with ETCnomad running and OSC enabled (see above), verify channel level, cue fire, and a command-line record. Full checklist: PLAN.md §11.2.

## Cursor / Claude Desktop

```json
{
  "mcpServers": {
    "etc-nomad": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-etc-nomad/dist/index.js"],
      "env": {
        "EOS_HOST": "192.168.1.50",
        "EOS_PORT_TX": "8000",
        "EOS_PORT_RX": "9001",
        "EOS_ALLOW_LIVE": "false",
        "EOS_REQUIRE_CONFIRM": "true"
      }
    }
  }
}
```

## Project layout

```
src/
├── index.ts              # MCP stdio entry
├── config.ts             # Environment config
├── eos/
│   ├── client.ts         # OSC TX
│   ├── listener.ts       # OSC RX + state cache
│   ├── state.ts          # Typed desk state
│   ├── addresses.ts      # OSC path builders
│   ├── keys.ts           # OSC Dictionary hardkey map + aliases
│   ├── command.ts        # CLI terminators
│   └── context.ts        # Shared context + live/confirm gates
├── tools/                # MCP tools (Phase 0–2)
├── resources/            # MCP resources (playback + show)
└── prompts/              # eos-operator, eos-live, eos-programmer, eos-patch
```

## License

MIT
