# LIGHTING_OPS_SPEC (LOCKED)

Lighting Expert canonical API for the **lighting-ops** tool pack. OSC paths follow the [ETC OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm). CLI fallbacks use `/eos/newcmd`.

## Naming lock

| Canonical tool | Alias | Notes |
|----------------|-------|-------|
| `palette_recall` | `palette_fire` | Descriptions say **Recall**, not only "fire" |
| `preset_recall` | `preset_fire` | Descriptions say **Recall**, not only "fire" |
| `submaster_bump` | `submaster_fire` | Descriptions say **Bump**, not only "fire" |

**Blackout ≠ GM=0.** `blackout` and `grandmaster_set_level` are separate tools. Never implement BO as `grandmaster_set_level(0)`.

## Intensity scales

| Target | Tool API | OSC |
|--------|----------|-----|
| Channels / groups | 0–100 (percent) | `/eos/chan`, `/eos/group`, `/eos/at` |
| Faders / subs / GM | 0–100 in lighting-ops GM tool; faders/subs remain 0–1 in existing fader tools | GM: `/eos/fader/0/1` (0.0–1.0 internally) |

## Shared selection shape

```ts
channels?: number[]
ranges?: { from: number; thru: number }[]
// Legacy from/thru still accepted on channel_select / channel_set_level
```

Thru extends `channel_select` and `channel_set_level`. Minus deselect uses `/_-%` key.

## Tools

### `go_to_cue`

- CLI preferred: `Go To Cue 5`, `Go To Cue 1/10`, `Go To Cue Out` via `/eos/newcmd`
- **XOR:** provide `cue` **or** `out: true`, never both
- Optional `method: "key"` → `/eos/key/go_to_cue` (not `go_0`)
- Rate limit: `override_rate_limit` — `confirm` does **not** bypass rate cap
- No rate% OSC tool in this pack

### `cue_hold` / `cue_back` / `cue_resume`

- `cue_hold` → `/eos/key/stop` (hold while fading; back when idle). `cue_stop` is deprecated alias
- `cue_back` → `/eos/key/back`
- `cue_resume` → `/eos/key/resume`

### `grandmaster_set_level`

- Tool API: `level` 0–100
- OSC: `/eos/fader/0/1` with value `level / 100`
- Bank 0 fader 1 per Dictionary

### `blackout`

- `/eos/key/blackout` only — never Chan Thru Out

### `highlight`

```ts
highlight({
  state: "on" | "off" | "toggle",  // required when no selection
  channels?: number[],
  ranges?: { from, thru }[],
})
```

- With selection → select channels, then highlight (default `state: "on"`)
- Without selection → mode toggle only (`state` required)
- No `level` arg (uses Highlight preset)

### `rem_dim`

Same selection shape as `highlight`. Paths: `/eos/at/remdim`, `/eos/chan/{n}/remdim`, `/eos/group/{n}/remdim`, or `/eos/key/rem_dim`.

### `home`

Requires selection (`channels`, `ranges`, `channel`, `group`, or fader target). Paths: `/eos/at/home`, `/eos/chan/{n}/home`, `/eos/group/{n}/home`, fader home, or `/eos/key/home`.

### `park_channel` / `unpark_channel`

- Park: CLI `Chan N Park` or `/eos/key/park` after select
- Unpark: CLI `Chan N Unpark`

### `show_save` (shared with Phase 3)

Single implementation in `show_admin.ts` — quick/save/save_as via keys/CLI, `confirm_save` + `user_intent` gates, path echo from `/eos/out/event/show/saved`. Do not duplicate in operator tools.

## Cue sync

Dictionary-primary cue index: `/eos/get/cue/{list}/index` + int arg (preferred). Fallback to `/eos/get/cue/{list}/noparts/index` when primary returns empty.

## Open items (domain residual)

Prefer Eos Domain forms unless Lighting Expert overrides above:

- GM index on bank 0 → `/eos/fader/0/1`
- blackout vs GM=0 → separate tools (locked)
- rate% OSC → no tool in this pack
- `cue_hold` vs `cue_stop` → `cue_hold` canonical
