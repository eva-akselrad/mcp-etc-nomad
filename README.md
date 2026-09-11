# MCP ETC Nomad

**GitHub:** https://github.com/eva-akselrad/mcp-etc-nomad

TypeScript [Model Context Protocol](https://modelcontextprotocol.io) server for **ETC Eos Family** lighting consoles — including **ETCnomad** on PC/Mac.

Control ETCnomad and Eos desks over **OSC** so an LLM can operate cues, levels, subs, macros, and the full Eos command line.

> See **[PLAN.md](./PLAN.md)** for the full roadmap to operator parity.

## Phase status

### Phase 0 — Foundation (done)

Core OSC bridge, command line, basic levels/playback, listener cache, `eos-operator` prompt.

### Phase 1 — Playback parity (done)

| Group | Tools |
|-------|-------|
| Playback | `cue_select`, `cue_fire`, `cue_go`, `cue_list_bank_*`, `get_active_cue`, `get_pending_cues` |
| Faders & subs | `fader_bank_config`, `fader_set_level`, `fader_load/unload/stop/fire`, `fader_bank_page`, `submaster_set_level`, `submaster_fire` |
| Palettes & presets | `palette_select/fire`, `preset_select/fire` |
| Keys & macros | `key_press`, `softkey_press`, `macro_select/fire`, `staging_mode_toggle`, `list_osc_keys`, `resolve_osc_key` |
| Direct selects | `direct_select_bank_create`, `direct_select_bank_page`, `direct_select_press` |
| Queries | `get_console_state`, `get_fader_labels_levels`, `wait_for_osc`, `osc_reset` |

**Resources:** `eos://playback/active`, `eos://playback/state` (pending cue + fader bank cache)

**Prompts:** `eos-operator`, `eos-live`

**Safety:** Live-write tools accept `confirm` and `allow_live` per `EOS_REQUIRE_CONFIRM` / `EOS_ALLOW_LIVE`.

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
        "EOS_PORT_RX": "9001"
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
│   ├── command.ts        # CLI terminators
│   └── context.ts        # Shared context + safety
├── tools/                # MCP tools by domain
├── resources/            # MCP resources
└── prompts/              # MCP prompts
```

## License

MIT

## Publish to GitHub (one-time)

The GitHub MCP token here can **create** repos but not **push** file contents. From your machine:

```bash
git clone https://origin.cursor.com/git/eva-akselrad/tmp-76a70359300fad44.git mcp-etc-nomad
cd mcp-etc-nomad
git remote add github https://github.com/eva-akselrad/mcp-etc-nomad.git
git push -u github main
```

Or, if you already have this repo checked out with the code:

```bash
git remote add github https://github.com/eva-akselrad/mcp-etc-nomad.git   # skip if added
git push -u github main
```

To let the agent push via MCP later, re-authenticate the GitHub MCP in Cursor with **Contents: Read and write** (fine-grained PAT) or the classic **`repo`** scope.
