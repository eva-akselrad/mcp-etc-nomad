# MCP ETC Nomad

[![CI](https://github.com/eva-akselrad/mcp-etc-nomad/actions/workflows/ci.yml/badge.svg)](https://github.com/eva-akselrad/mcp-etc-nomad/actions/workflows/ci.yml)

**GitHub:** https://github.com/eva-akselrad/mcp-etc-nomad

TypeScript [Model Context Protocol](https://modelcontextprotocol.io) server for **ETC Eos Family** lighting consoles — including **ETCnomad** on PC/Mac.

Control ETCnomad and Eos desks over **OSC** so an LLM can operate cues, levels, subs, macros, and the full Eos command line.

> See **[PLAN.md](./PLAN.md)** for the full roadmap to operator parity.

## Phase status

| Phase | Status |
|-------|--------|
| 0 Foundation | Implemented |
| 1 Playback parity | Implemented |
| 2 Programming parity | Implemented |
| **3 Show & system admin** | **Implemented** |
| **4 Hardening & distribution** | **Implemented** |

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

## Phase 2 (programming)

Programming writes use the same `confirm` / `allow_live` gates as playback. Destructive deletes also require `confirm_delete=true` when `EOS_REQUIRE_CONFIRM=true`.

| Group | Tools |
|-------|--------|
| Record / update | `record_cue`, `update_cue`, `record_group`, `record_preset`, `record_palette` |
| Copy / move / delete | `copy_target`, `move_target`, `delete_target` (+ `confirm_delete`) |
| OSC set | `label_target`, `group_set_channels` (`/eos/set/...`; Thru as `>`) |
| Patch | `patch_channel`, `patch_copy_to`, `patch_move`, `unpatch_channel` |
| Sync / get | `sync_show_targets`, `get_groups`, `get_cuelists`, `get_cues`, `get_presets`, `get_palettes` |
| Command line | `eos_command`, `eos_new_command` (typed tools use **newcmd**); no `/eos/record` verb |

**Resources:** `eos://show/groups`, `eos://show/cuelists`, `eos://show/cues/{list}`, `eos://show/presets`, `eos://show/palettes/{type}`

**Prompts:** `eos-programmer`, `eos-patch`

Sync uses OSC `/eos/get/*` request/response (node-eos-console / EosSyncLib pattern): count → index → cache in listener state. Subscribe with `/eos/subscribe` + int arg `1` on sync (default).

## Phase 3 (show & system admin)

Eos OSC domain rules: **no OSC Save/Load verbs** — Browser + `key_press` + CLI only. Never invent `usb1:/` or `.esf` paths.

| Group | Tools |
|-------|--------|
| Show files | **`show_save`** (priority: `confirm_save` + path echo), `show_load`, `show_merge`, `show_export`; `get_show_path` |
| Patch extras | `attach_patch_device`, `detach_patch_device` |
| Troubleshoot | `identify_fixture`, `channel_check`, `highlight_channels` |
| Network | `get_session_info`, `osc_set_user`, `network_session_join`, `network_session_leave` |

**Gates:** `user_intent` for load/merge/join; `confirm_save` / `confirm_path` when `EOS_REQUIRE_CONFIRM=true`. Prefer Blind for load/merge. After load/merge, `sync_show_targets` + reconfigure banks.

**TCP transport (real TCP OSC, not UDP retarget):** `EOS_PROTOCOL=tcp`. `3032` = OSC TCP 1.0 length headers (bidirectional); `3037` = Third Party OSC 1.1 SLIP (~realtime `/eos/out`). Custom ports OK (4703–4727+). Enable OSC RX+TX in Setup. UDP remains default; ETC prefers TCP.

**Resources:** `eos://console/info`, `eos://console/session`, `eos://console/version`, `eos://show/path`

**Prompts:** `nomad-setup`, `eos-showfile`

## Phase 4 (hardening & distribution)

| Item | Status |
|------|--------|
| OSC address + CLI test suite | `test/addresses-full.test.ts`, `test/cli-tools.test.ts`, `test/golden-replay.test.ts` |
| Golden trace replay | `test/fixtures/golden-traces.json` → listener state parser |
| CI (no hardware) | GitHub Actions — `npm run typecheck`, `build`, `test` with mock OSC peer |
| npm package | `mcp-etc-nomad@1.0.0` — `bin`, `files`, `prepublishOnly` |
| Cloudflare Worker relay | **Not implemented** — no prior sketch; documented as future remote-desk option |

## Install

### From npm (recommended)

```bash
npm install -g mcp-etc-nomad
# or as a project dependency:
npm install mcp-etc-nomad
```

Run the MCP server (stdio):

```bash
mcp-etc-nomad
# equivalent: npx mcp-etc-nomad
```

### From source

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

**Mock OSC (no Nomad hardware):** `test/harness.ts` + `test/mock-osc-peer.ts` listen on a local UDP port, capture MCP tool TX packets, and send canned `/eos/out/*` replies (see PLAN.md §11.1).

```bash
npm test
```

| File | Coverage |
|------|----------|
| `test/osc-harness.test.ts` | Address builders, `assertLiveAllowed` gates, fader/cue bank TX sequencing |
| `test/addresses-full.test.ts` | Full `addresses.ts` Dictionary path coverage + user prefix |
| `test/command.test.ts` | CLI Enter/`#`/none terminators |
| `test/keys.test.ts` | OSC hardkey aliases (`go` → `go_0`, etc.) |
| `test/cli-tools.test.ts` | `eos_command`, keys, palettes, macros, user prefix, mock CLI echo |
| `test/golden-replay.test.ts` | Anonymized `/eos/out/*` trace replay (PLAN §11.3) |
| `test/programming.test.ts` | CLI programming builders (Copy/Delete Thru), tool TX, `sync_show_targets` mock-peer integration |
| `test/show-admin.test.ts` | Show save/load/**merge**/export gates (`user_intent`, LIVE refuse, `confirm_path`, `needsManual`); **network_session_leave** `user_intent`; TCP framing |
| `test/mock-osc-peer.ts` | Canned `/eos/get/*`, `/eos/out/cmd`, active cue, preset/palette replies |
| `test/fixtures/golden-traces.json` | Recorded Nomad-style OSC captures for regression |

Fader level tests assert **TX only** — Eos echoes `/eos/out/fader` after ~3s, so the harness does not expect an immediate echo.

Programming tools (`record_cue`, `update_cue`, etc.) refuse LIVE/unknown console state unless `allow_live=true` (mock tests cover this). `sync_show_targets` + `get_groups` / `get_cuelists` / `get_cues` populate listener cache; MCP resources `eos://show/*` read that cache.

**Automated gates in `test/show-admin.test.ts`:** `show_load` / `show_merge` require `user_intent` (≥8 chars), refuse LIVE/unknown without `allow_live`, and require `confirm_path` when `EOS_REQUIRE_CONFIRM=true`. Default path is `needsManual` (no unverified Browser OSC keys); opt-in via `press_unverified_browser_keys`. `network_session_leave` requires `user_intent` when gating is on.

**Nomad offline smoke (manual):** with ETCnomad running and OSC enabled (see above):

1. **Playback / programming:** channel level, cue fire, group+cue record via CLI (`record_cue`), delete with `confirm_delete`
2. **Show files (Browser):** `show_save` (quick save + path echo); `show_load` and `show_merge` with `user_intent` + `confirm_path` — complete the CIA Browser wizard on the desk (tools return `needsManual`; no auto-load/merge)
3. **Network:** `network_session_leave` with `user_intent` to exit mirror mode; confirm exit key or Stop Mirroring softkey on desk
4. **Gates:** verify `show_merge` / `show_load` refuse LIVE without `allow_live`; `network_session_leave` requires `user_intent` when gating is on

Full checklist: PLAN.md §11.2.

## Cursor / Claude Desktop

```json
{
  "mcpServers": {
    "etc-nomad": {
      "command": "mcp-etc-nomad",
      "args": [],
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

When installed from source instead of npm, use `"command": "node"` with `"args": ["/absolute/path/to/mcp-etc-nomad/dist/index.js"]`.

## Project layout

```
src/
├── index.ts              # MCP stdio entry
├── config.ts             # Environment config
├── eos/
│   ├── client.ts         # OSC TX
│   ├── listener.ts       # OSC RX + state cache (+ multipart /list/0)
│   ├── state.ts          # Typed desk state
│   ├── addresses.ts      # OSC path builders
│   ├── keys.ts           # OSC Dictionary hardkey map + aliases
│   ├── command.ts        # CLI terminators
│   ├── context.ts        # Shared context + live/confirm gates
│   ├── sync.ts           # sync_show_targets (/eos/get/* cache)
│   ├── show-admin.ts     # Phase 3 show-file workflow builders
│   └── programming.ts    # Phase 2 CLI builders
├── tools/                # MCP tools (Phase 0–3)
├── resources/            # MCP resources (playback + show + console)
└── prompts/              # eos-operator, eos-live, eos-programmer, eos-patch, nomad-setup, eos-showfile
```

## License

MIT
