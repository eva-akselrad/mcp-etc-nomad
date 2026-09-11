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
minus?: number[]   // deselect via /eos/key/_-%
// Legacy from/thru still accepted on channel_select / channel_set_level
```

Thru extends `channel_select` and `channel_set_level`. Minus deselect uses `/_-%` key.

## Field diffs (Lighting Expert)

### `go_to_cue`
- **XOR:** `cue` OR `out: true`, never both
- `override_rate_limit` separate from `confirm` (confirm does not bypass rate cap)
- No rate% OSC tool

### `park_channel` / `unpark_channel`
- Shared `channels` + `ranges` selection shape (legacy `channel`/`from`/`thru` accepted)
- CLI single range or `method=key` for multi-channel park

### `highlight` / `rem_dim`
```ts
{ state?: "on"|"off"|"toggle", channels?, ranges? }
```
- With selection → default `state: "on"`
- Without selection → `state` required
- No `level` arg

### `home`
- Requires selection: `channels`/`ranges`, `group`/`groups`, or `faderBank`+`fader`
- Single group → `/eos/group/{n}/home`; multi → `/eos/at/home`

### `set_cue_timing`
- Timing fields are `number | string` unions (seconds or Eos time tokens)

## Tools

### `go_to_cue`

- CLI preferred: `Go To Cue 5`, `Go To Cue 1/10`, `Go To Cue Out` via `/eos/newcmd`
- Optional `method: "key"` → `/eos/key/go_to_cue` (not `go_0`)

### `cue_hold` / `cue_back` / `cue_resume`

- `cue_hold` → `/eos/key/stop` (hold while fading; back when idle). `cue_stop` deprecated alias
- `cue_back` → `/eos/key/back`
- `cue_resume` → `/eos/key/resume`

### `grandmaster_set_level`

- Tool API: `level` 0–100 → OSC `/eos/fader/0/1` with `level / 100`

### `blackout`

- `/eos/key/blackout` only — never Chan Thru Out

### `show_save` (shared with Phase 3)

Single implementation in `show_admin.ts` — do not duplicate in operator tools.

## Cue sync

Dictionary-primary cue index: `/eos/get/cue/{list}/index` + int arg (preferred). Fallback to `/eos/get/cue/{list}/noparts/index` when primary returns empty.

## Open items (domain residual)

- GM index on bank 0 → `/eos/fader/0/1`
- blackout vs GM=0 → separate tools (locked)
- rate% OSC → no tool in this pack
- `cue_hold` vs `cue_stop` → `cue_hold` canonical
