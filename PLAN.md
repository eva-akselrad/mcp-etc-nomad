# Plan: Full MCP for ETC Eos / ETCnomad Lighting Control

**Goal:** Build a TypeScript MCP server that gives an LLM **functional parity with a skilled human operator** on the ETC Eos Family — including **ETCnomad** (Nomad on PC/Mac), hardware consoles (Element, Ion, Gio, etc.), and multi-console sessions.

**Primary integration surface:** [Open Sound Control (OSC)](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Eos_Control.htm) over UDP/TCP.

**Escape hatch for full parity:** Eos **command line** via `/eos/cmd`, `/eos/newcmd`, and `/eos/event` — anything typed in the CIA can be sent remotely.

---

## 1. Executive summary

ETCnomad and all Eos Family consoles expose **no official REST/gRPC API**. Remote control is done through:

| Surface | Role in MCP |
|---------|-------------|
| **OSC (inbound `/eos/...`)** | Structured control: levels, cues, faders, palettes, keys, banks |
| **OSC (outbound `/eos/out/...`)** | State feedback: active cue, fader levels, labels, blind/live |
| **Command line OSC** | **Universal fallback** — record, patch, copy, delete, setup, export |
| **UDP strings / MIDI / serial gateways** | Phase 2+ for non-OSC integrations |
| **Show file (.esf / .esf2 / .esf3d)** | Offline read/write is **not** officially supported; use command line + export while Eos is running |

The MCP will be a **bidirectional OSC bridge** with:

- **~80–120 typed tools** grouped by domain (not one giant `run_command` — but one `eos_command` fallback exists)
- **Resources** exposing cached show state (patch, groups, cue lists, active playback)
- **Prompts** teaching the model Eos syntax, safety rules, and Nomad networking
- **Guardrails** for live-show operations (confirmations, blind mode awareness, rate limits)

Reference implementations to learn from (not fork blindly):

- [MaybeItsAdam/etcnomad-mcp](https://github.com/MaybeItsAdam/etcnomad-mcp) — Python/FastMCP, OSC tool layout
- [douglasfinlay/node-eos-console](https://github.com/douglasfinlay/node-eos-console) — TypeScript OSC client + show-data cache
- [ETCLabs/EosSyncLib](https://github.com/ETCLabs/EosSyncLib) — OSC sync patterns for show targets

---

## 2. What “anything a regular person can do” means

A human operator on Nomad can roughly do four classes of work. The MCP must cover all four.

### 2.1 Live playback (show running)

- Fire cues, go/back, stop, pause, resume
- Raise/lower submasters, faders, grand master
- Bump subs, load/unload fader pages
- Recall palettes and presets live
- Run macros
- Toggle blind, preview, staging mode
- Monitor active cue progress and pending cues

**MCP coverage:** OSC playback + fader + cue tools; subscribe to `/eos/out/active/*`.

### 2.2 Programming (building the show)

- Patch/fixtures, universes, profiles, RDM discovery
- Record cues, update parts, block/copy/move/delete
- Build groups, presets, palettes, effects, snapshots
- Magic sheets, pixel maps, curves
- Set fade/delay/timing, tracking, block/merge
- Label everything

**MCP coverage:** Mostly **`eos_command`** (command line) because OSC has limited “record/store” verbs. Examples:

```
Cue 1 Enter
Record Enter
Group 1 Enter
Channel 1 Thru 10 At Full Record Preset 1 Enter
```

### 2.3 Setup & system (desk configuration)

- Network, session roles (primary/backup/client/offline)
- OSC ports, string RX, cue string formats
- Output routing (Net3/sACN/Art-Net, gadgets, gateways)
- User settings, keymaps, shell preferences
- Show file save/load/merge/import/export

**MCP coverage:** Command line + a few OSC status queries. Some GUI-only flows (Augment3d model import) may require **human-in-the-loop** or OS-level automation (out of scope for v1).

### 2.4 Troubleshooting & maintenance

- View channel levels, DMX output, park/unpark
- Identify/fixture check, highlight, locate
- Diagnose network/session issues
- Backup show files

**MCP coverage:** Command line queries + OSC level/param reads + MCP resources mirroring cached state.

---

## 3. Capability parity matrix

| Human action | Primary MCP tool(s) | Protocol |
|--------------|---------------------|----------|
| Set channel 1 to 75% | `channel_set_level` | OSC `/eos/chan/1=75` |
| Select group 5, full | `group_set_level` | OSC `/eos/group/5/full` |
| Pan/tilt/color wheels | `wheel_adjust`, `color_set_rgb` | OSC wheel/color |
| Fire cue 10 on list 1 | `cue_fire` | OSC `/eos/cue/1/10/fire` |
| Go next cue | `key_press` (Go) | OSC `/eos/key/go` |
| Set sub 3 to 50% | `submaster_set_level` | OSC `/eos/sub/3=0.5` |
| Recall color palette 2 | `palette_fire` | OSC `/eos/cp/fire=2` |
| Run macro 5 | `macro_fire` | OSC `/eos/macro/fire=5` |
| Record cue 1.5 | `eos_command` | `Cue 1.5 Enter Record Enter` |
| Patch channel 101 | `eos_command` | `Patch 101 Enter` |
| Copy cue 1 thru 5 cue 10 | `eos_command` | `Copy Cue 1 Thru 5 Cue 10 Enter` |
| Save show | `eos_command` | Browser path or hotkey via `key_press` |
| List all groups | `query_groups` | OSC cache + `/eos/out/*` sync |
| Is console blind? | `get_console_state` | OSC `/eos/out/event/state` |
| Open magic sheet 3 | `magic_sheet_open` | OSC `/eos/ms=3` |

**Rule:** If no dedicated tool exists yet, `eos_command` must still achieve parity.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Host (Cursor, Claude Desktop, etc.)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ stdio (JSON-RPC MCP)
┌───────────────────────────▼─────────────────────────────────┐
│  mcp-etc-nomad (TypeScript)                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Tool layer  │  │ Resource     │  │ Prompts             │ │
│  │ (domain)    │  │ (cached show)│  │ (Eos syntax/safety) │ │
│  └──────┬──────┘  └──────▲───────┘  └─────────────────────┘ │
│         │                │                                   │
│  ┌──────▼────────────────┴───────────────────────────────┐ │
│  │ EosClient — OSC TX + listener thread + state cache      │ │
│  └──────┬───────────────────────────────▲──────────────────┘ │
└─────────┼───────────────────────────────┼────────────────────┘
          │ UDP/TCP OSC                   │ /eos/out/*
┌─────────▼───────────────────────────────▼────────────────────┐
│  ETCnomad / Eos Family (Host in multi-console session)       │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 Package layout (TypeScript)

```
src/
├── index.ts                 # serveStdio entry
├── config.ts                # EOS_IP, ports, protocol, user id
├── eos/
│   ├── client.ts            # send OSC, await correlated replies
│   ├── listener.ts          # bind RX port, parse /eos/out/*
│   ├── state.ts             # typed cache (channels, cues, faders…)
│   ├── addresses.ts         # OSC path builders (avoid typos)
│   └── command.ts           # command-line builder + terminator
├── tools/
│   ├── levels.ts            # chan, group, addr, at, param
│   ├── color_position.ts    # color, pantilt, xyz, wheels
│   ├── selection.ts         # chan, group, preset, fx, curve…
│   ├── playback.ts          # cue, cuelist, go, stop
│   ├── faders.ts            # fader banks, subs
│   ├── palettes.ts          # ip, fp, cp, bp, preset
│   ├── keys_macros.ts       # hardkeys, softkeys, macros
│   ├── banks.ts             # cue list banks, direct selects, fader banks
│   ├── queries.ts           # read state, wait for output
│   └── command.ts           # eos_command, eos_new_command
├── resources/
│   ├── show.ts              # patch, groups, cue lists (cached)
│   └── playback.ts          # active cue, pending, blind/live
└── prompts/
    └── operator.ts          # system instructions for LLM
```

### 4.2 Technology choices

| Choice | Rationale |
|--------|-----------|
| **TypeScript + `@modelcontextprotocol/server` v2** | Matches repo skeleton; good OSC libs |
| **`node-osc` or `osc-js`** | UDP/TCP OSC send/receive |
| **Optional: wrap `node-eos-console`** | Accelerates show-data cache; evaluate license/compatibility |
| **stdio transport** | Default for Cursor/Claude Desktop |
| **Optional HTTP transport** | Remote desk access (Phase 3) |

---

## 5. ETCnomad / Eos connection requirements

Document clearly in README and MCP prompts.

### 5.1 Nomad OSC setup

In **Setup → System Settings → Show Control → OSC**:

| Setting | Typical value |
|---------|---------------|
| OSC RX | Enabled |
| OSC TX | Enabled |
| OSC UDP RX Port | `8000` (MCP sends here) |
| OSC UDP TX Port | `9001` (MCP listens here) |
| String RX | **Enabled** (required for many cmd paths) |
| OSC version | Match MCP (1.0 vs 1.1) |

Use the **console’s network IP** from Nomad Shell, not `127.0.0.1`, when MCP runs on another machine.

### 5.2 Multi-console sessions

All OSC to/from a session must go through the **session Host**. MCP config needs:

- `EOS_HOST` — Host console IP
- `EOS_USER_ID` — optional `/eos/user=N` routing (0–99)

### 5.3 Transport modes

| Mode | When |
|------|------|
| UDP | Default; lowest latency |
| TCP (ports 3032/3037) | Firewall-friendly; `node-eos-console` pattern |

---

## 6. MCP surface design

### 6.1 Tools (exhaustive catalog)

#### A. Levels & parameters

| Tool | Description |
|------|-------------|
| `channel_select` | Select channel(s) |
| `channel_set_level` | Intensity 0–100 |
| `channel_set_dmx` | DMX 0–255 |
| `channel_set_param` | Moving-light param (pan, tilt, gobo, …) |
| `group_select` / `group_set_level` | Group operations |
| `address_set_level` | Raw DMX address control |
| `at_set_level` | `/eos/at` for current selection |
| `param_set` | `/eos/param/{name}` |
| `wheel_adjust` | Coarse/fine encoder ticks |
| `switch_adjust` | Continuous encoder (held button) |
| `color_set_hs` / `_rgb` / `_xy` / `_xyz` | Color APIs |
| `pantilt_set_xy` | 2D pan/tilt graph |
| `xyz_set` | Stage XYZ positioning |

#### B. Selection & targets

| Tool | Description |
|------|-------------|
| `curve_select` | `/eos/curve` |
| `effect_select` | `/eos/fx` |
| `pixelmap_select` | `/eos/pixmap` |
| `magic_sheet_open` | `/eos/ms` |
| `snapshot_select` | Snapshot targets |
| `preset_select` / `preset_fire` | Presets |
| `palette_select` / `palette_fire` | IP, FP, CP, BP |

#### C. Playback

| Tool | Description |
|------|-------------|
| `cue_select` | Select cue/part |
| `cue_fire` | Fire specific cue |
| `cue_go` | Sequential go |
| `cue_list_bank_config` | Build OSC cue list bank |
| `cue_list_bank_page` | Page cue bank |
| `cue_list_bank_select` | Jump to cue in bank |
| `get_active_cue` | Read active cue + percent |
| `get_pending_cues` | Pending cue stack |

#### D. Faders & submasters

| Tool | Description |
|------|-------------|
| `fader_bank_config` | Create/map fader bank |
| `fader_set_level` | 0.0–1.0 |
| `fader_load` / `fader_unload` / `fader_stop` / `fader_fire` | Fader actions |
| `fader_bank_page` | Page faders |
| `submaster_set_level` | Sub intensity |
| `submaster_fire` | Bump sub |

#### E. Keys & macros

| Tool | Description |
|------|-------------|
| `key_press` | Any hardkey by OSC name |
| `softkey_press` | Softkeys 1–12 |
| `macro_select` / `macro_fire` | Macros |
| `staging_mode_toggle` | Staging mode |
| `osc_reset` | `/eos/reset` |

#### F. Direct select banks

| Tool | Description |
|------|-------------|
| `direct_select_bank_create` | `/eos/ds/{bank}/{type}/{count}` |
| `direct_select_bank_page` | Page DS bank |
| `direct_select_press` | Press DS button |

#### G. Queries & sync

| Tool | Description |
|------|-------------|
| `get_console_state` | Blind/live, user id |
| `get_command_line` | Current CLI text |
| `get_active_channels` | `/eos/out/active/chan` |
| `get_fader_labels_levels` | Cached fader bank state |
| `get_setup_defaults` | `/eos/get/setup` |
| `sync_show_targets` | Full cache refresh (EosSyncLib-style) |
| `wait_for_osc` | Block until address matches (timeout) |

#### H. Command line (parity backstop)

| Tool | Description |
|------|-------------|
| `eos_command` | Send arbitrary CLI string; auto `#` or `Enter` terminator |
| `eos_new_command` | Clear line, then send |
| `eos_event` | Same as cmd but event semantics |

**Examples the LLM must be able to run via `eos_command`:**

```
Patch 1 Thru 10 Enter
Label Group 1 "Warm Wash" Enter
Copy Cue 1 Thru 5 Cue 10 Enter
Move Effect 1 At Effect 2 Enter
Export Patch "usb1:/patch.csv" Enter
```

#### I. Session & show file (command-heavy)

| Tool | Description |
|------|-------------|
| `show_save` | Save current show |
| `show_load` | Load show path |
| `show_merge` | Merge from path |
| `show_export` | Trigger export wizard targets via CLI |
| `network_session_join` | Join session as client/backup |

These wrap documented CLI/browser commands; exact syntax varies by Eos version — encode version in config.

### 6.2 Resources (read-only context for the model)

| URI | Content |
|-----|---------|
| `eos://show/patch` | Cached patch channels |
| `eos://show/groups` | Groups + membership |
| `eos://show/cuelists` | Cue list index |
| `eos://show/cues/{list}` | Cues in list |
| `eos://show/palettes/{type}` | IP/FP/CP/BP |
| `eos://show/macros` | Macro list |
| `eos://playback/active` | Active cue text + percent |
| `eos://playback/state` | blind/live, pending |
| `eos://console/info` | Host IP, version, session role |

Resources update via OSC listener; expose `lastSyncedAt` metadata.

### 6.3 Prompts

| Prompt | Purpose |
|--------|---------|
| `eos-operator` | Eos CLI grammar, `#` vs Enter, selection rules |
| `eos-programmer` | Record/update/block/copy patterns |
| `eos-live` | Playback safety: confirm before fire, read active cue first |
| `eos-patch` | Patch syntax, universe limits, Nomad output caps |
| `nomad-setup` | Dongle, offline vs client, gadget/gateway output |

---

## 7. State management & feedback

OSC is **mostly fire-and-forget**; show data arrives asynchronously on `/eos/out/*`.

### 7.1 Listener requirements

- Bind `EOS_PORT_RX` (default `9001`)
- Parse addresses with regex map (see etcnomad-mcp `osc_listener.py` pattern)
- Update typed `EosState` under a lock
- Emit debounced resource invalidation signals

### 7.2 Request–response correlation

For queries, implement:

1. Send query trigger (e.g. `/eos/get/setup` or select target)
2. `wait_for_osc(addressPattern, timeoutMs)`
3. Return structured JSON to MCP client

### 7.3 Initial sync protocol

On connect:

1. `/eos/reset` (optional, configurable)
2. Request labels via bank configs (fader bank 1, cue list bank 1, DS banks)
3. Run `sync_show_targets` — iterate known OSC label outputs
4. Mark `connected: true` only after first `/eos/out/event/state`

Reference: EosSyncLib synchronization loop (poll + sleep until synchronized).

---

## 8. Safety & guardrails

Lighting desks control **real power to rig**. The MCP must not treat channels casually.

### 8.1 Operation classes

| Class | Examples | Policy |
|-------|----------|--------|
| **Read** | Query levels, labels | Always allowed |
| **Write — low risk** | Blind programming, offline Nomad | Allowed with logging |
| **Write — live** | `cue_fire`, `channel_set_level`, subs | Require `confirm: true` param or host approval |
| **Destructive** | Delete cue, release patch, reset OSC | Double confirmation + echo target |
| **System** | Save/load show, network join | Explicit user intent string |

### 8.2 Blind / live awareness

- Read `/eos/out/event/state` before live writes
- Refuse live intensity changes unless `allow_live: true`
- Prompt template tells model to **announce** look changes before firing

### 8.3 Rate limiting

- Debounce rapid fader levels (Eos already delays fader feedback 3s)
- Max N cue fires per minute without re-confirmation

### 8.4 Audit log

- Append-only local log: timestamp, tool, args, OSC sent, result
- Optional MCP resource `eos://audit/recent`

---

## 9. Known gaps & workarounds

| Gap | Workaround |
|-----|------------|
| No API to read `.esf` files directly | Command line + CSV/ASCII export while running |
| GUI-only Augment3d workflows | Human completes; MCP continues after export |
| Some Setup screens lack OSC | `eos_command` or key sequences |
| OSC user vs console user confusion | Document `/eos/user`; default `-1` = match console |
| Nomad offline String RX off | Document in setup prompt; detect failed cmds |
| Hardware dongle / output limits | Resource `eos://console/capabilities` from config |
| Multi-step Browser wizards | Break into CLI steps or return “manual step required” |

**Parity claim:** *Any action achievable via Eos command line or documented OSC is in scope.* Pure GUI point-and-click with no CLI/OSC equivalent is **out of scope** for v1.

---

## 10. Implementation phases

### Phase 0 — Foundation (week 1 equivalent effort)

- [ ] Rename repo skeleton from HashiCorp Nomad → `mcp-etc-nomad`
- [ ] `EosClient` UDP send/receive
- [ ] Config: `EOS_HOST`, `EOS_PORT_TX`, `EOS_PORT_RX`, `EOS_PROTOCOL`
- [ ] Tools: `eos_command`, `channel_set_level`, `cue_fire`, `get_console_state`
- [ ] Listener: `/eos/out/event/state`, `/eos/out/active/cue`
- [ ] README + Nomad OSC setup guide
- [ ] Smoke test against Nomad offline

### Phase 1 — Playback parity (operator mode)

- [ ] All playback, fader, sub, palette, macro tools
- [ ] Key/softkey mapping table from ETC OSC Dictionary
- [ ] Cue list + fader + direct select banks
- [ ] Resources: playback + active cue
- [ ] `eos-live` prompt + live confirmation gates

### Phase 2 — Programming parity

- [ ] `eos_command` helpers: record, update, copy, move, delete templates
- [ ] Prompts: programmer + patch syntax
- [ ] Resources: groups, cues (via sync)
- [ ] Integrate or port `node-eos-console` cache patterns

### Phase 3 — Show & system admin

- [ ] Show save/load/merge/export wrappers
- [ ] Patch/unpatch helpers
- [ ] Network session tools (join/leave/identify)
- [ ] TCP transport option

### Phase 4 — Hardening & distribution

- [ ] Full OSC address test suite (record/replay OSC captures)
- [ ] CI without hardware (mock OSC peer)
- [ ] npm publish `mcp-etc-nomad`
- [ ] Optional Cloudflare Worker relay (remote desk) — only if needed

---

## 11. Testing strategy

### 11.1 Mock OSC peer

Node test harness that:

- Listens on 8000, responds with canned `/eos/out/*`
- Asserts MCP tools emit expected `/eos/...` packets

### 11.2 Nomad offline integration

- Automated script starts Nomad (if CI license allows; otherwise manual checklist)
- Verify: channel level, cue fire, command line record

### 11.3 Golden OSC traces

- Record real Nomad sessions for regression (anonymized show files)
- Replay against listener state parser

### 11.4 LLM eval scenarios

| Scenario | Success criteria |
|----------|------------------|
| “Build wash group 1 channels 1–20” | Group exists in cache |
| “Fire cue 5 on list 1 when I confirm” | Waits, then fires |
| “What’s running now?” | Reads active cue resource |
| “Record current look as cue 10” | Blind + record via CLI |
| “Bring channel 1 to 50% in live” | Refused without `allow_live` |

---

## 12. Configuration reference

```bash
# Target Eos Host (ETCnomad or console)
EOS_HOST=192.168.1.50
EOS_PORT_TX=8000          # Nomad OSC RX
EOS_PORT_RX=9001          # Nomad OSC TX (MCP listens)
EOS_RX_BIND=0.0.0.0
EOS_PROTOCOL=udp          # udp | tcp
EOS_TCP_PORT=3037         # if tcp

# OSC user routing
EOS_USER_ID=-1            # -1 = match console, 0 = background

# Safety
EOS_ALLOW_LIVE=false
EOS_REQUIRE_CONFIRM=true
EOS_AUDIT_LOG=./eos-mcp.audit.log

# Eos version hints (for command syntax)
EOS_VERSION=3.3.6
```

---

## 13. Success criteria

The MCP is “full” when an LLM can:

1. **Operate a running show** — cues, subs, faders, palettes, macros, go/stop
2. **Program new looks** — record/update cues, groups, presets, effects via CLI
3. **Patch and troubleshoot** — patch channels, set levels, identify fixtures
4. **Answer “what is the desk doing?”** — active cue, blind/live, channel levels
5. **Manage show files** — save, load, export patch/cues (CLI-driven)
6. **Do safely** — confirmations, blind awareness, audit trail

---

## 14. Immediate next steps for this repo

1. **Remove** HashiCorp Nomad, etcd, and S3 client code (wrong domain).
2. **Implement Phase 0** per section 10.
3. **Keep this PLAN.md** as the source of truth; track phases via GitHub issues or checklist in README.
4. **Validate** against ETCnomad offline with OSC enabled before claiming parity.

---

## 15. References

- [OSC Eos Control (ETC docs)](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Eos_Control.htm)
- [Eos OSC Conventions](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/Eos_OSC_Conventions.htm)
- [ETCnomad Documentation](https://www.etcconnect.com/Products/Consoles/Eos-Consoles/ETCnomad/Documentation.aspx)
- [Exporting Show Data](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/05_Show_Files/Exporting_Show_Data.htm)
- [EosSyncLib — OSC Integration PDF](https://github.com/ETCLabs/EosSyncLib)
- [node-eos-console](https://github.com/douglasfinlay/node-eos-console)
