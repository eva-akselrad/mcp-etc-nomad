# MCP ETC Nomad

**GitHub:** https://github.com/eva-akselrad/mcp-etc-nomad

TypeScript [Model Context Protocol](https://modelcontextprotocol.io) server for **ETC Eos Family** lighting consoles — including **ETCnomad** on PC/Mac.

Control ETCnomad and Eos desks over **OSC** so an LLM can operate cues, levels, subs, macros, and the full Eos command line.

> See **[PLAN.md](./PLAN.md)** for the full roadmap to operator parity.

## Phase status

| Phase | Status |
|-------|--------|
| 0 Foundation | Implemented |
| **1 Playback parity** | **Implemented** |
| 2 Programming parity | Not started |
| 3 Show & system admin | Not started |
| 4 Hardening & distribution | Not started |

## Phase 1 (playback)

Live-write tools require `confirm=true` when `EOS_REQUIRE_CONFIRM=true` (default) and `allow_live=true` when the console is **LIVE** (or state is unknown) and `EOS_ALLOW_LIVE=false` (default). Read `get_console_state` / `eos://playback/state` first.

| Group | Tools |
|-------|--------|
| Playback | `cue_select`, `cue_fire`, `cue_go`, `cue_stop`, `cue_list_go`, `get_active_cue`, `get_pending_cues` |
| Cue list banks | `cue_list_bank_config`, `cue_list_bank_page`, `cue_list_bank_select`, `cue_list_bank_reset` |
| Faders / subs | `fader_bank_config`, `fader_set_level`, `fader_load` / `_unload` / `_stop` / `_fire`, `fader_bank_page`, `fader_bank_reset`, `submaster_set_level`, `submaster_fire`, `submaster_select` |
| Palettes / presets | `palette_select`, `palette_fire`, `preset_select`, `preset_fire` |
| Keys / macros | `key_press`, `softkey_press`, `macro_select`, `macro_fire`, `staging_mode_toggle`, `list_osc_keys` |
| Direct selects | `direct_select_bank_create`, `direct_select_bank_page`, `direct_select_press` |
| Command line | `eos_command`, `eos_new_command`, `eos_event` |
| Levels | `channel_select`, `channel_set_level`, `channel_set_dmx`, `group_set_level`, `at_set_level` |
| Queries | `get_console_state`, `get_command_line`, `get_fader_labels_levels`, `get_direct_selects`, `wait_for_osc`, `osc_reset`, `magic_sheet_open` |

**Resources:** `eos://playback/active`, `eos://playback/pending`, `eos://playback/state`, `eos://playback/faders`, `eos://console/keys`

**Prompts:** `eos-operator`, `eos-live`

OSC addresses follow the [ETC OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm). Go is `go_0`; Stop/Back is `stop`. Create fader / cue-list / direct-select banks before paging or reading labels.

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
├── tools/                # MCP tools (Phase 0–1)
├── resources/            # MCP resources
└── prompts/              # eos-operator, eos-live
```

## License

MIT
