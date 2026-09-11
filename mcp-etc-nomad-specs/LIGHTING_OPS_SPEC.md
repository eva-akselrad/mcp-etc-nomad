# LIGHTING_OPS_SPEC (LOCKED)

Lighting Expert canonical API for the **lighting-ops** tool pack. OSC paths follow the [ETC OSC Dictionary](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm). CLI fallbacks use `/eos/newcmd`.

## Naming lock

| Canonical tool | Alias | Notes |
|----------------|-------|-------|
| `palette_recall` | `palette_fire` | Descriptions say **Recall**, not only "fire" |
| `preset_recall` | `preset_fire` | Descriptions say **Recall**, not only "fire" |
| `submaster_bump` | `submaster_fire` | Descriptions say **Bump**, not only "fire" |
| `park` | `park_channel` (deprecated) | Shared channels/ranges selection; optional `level` (Park At) |
| `unpark` | `unpark_channel` (deprecated) | Shared channels/ranges selection |
| `go_to_cue` | `cue_fire` | `cue_fire` = `go_to_cue` with `time=0` (Assert+GTC) — NOT `/eos/cue/.../fire` |

**Blackout ≠ GM=0.** `blackout` and `grandmaster_set_level` are separate tools. Never implement BO as `grandmaster_set_level(0)`.

## Intensity scales

| Target | Tool API | OSC |
|--------|----------|-----|
| Channels / groups | 0–100 (percent) | `/eos/chan`, `/eos/group`, `/eos/at` |
| Faders | 0.0–1.0 | `/eos/fader/...` |
| Subs / GM (lighting-ops) | 0–100 (percent) | `/eos/sub/{n}`, `/eos/fader/0/1` (mapped 0.0–1.0) |
| RGB (`color_set_rgb`) | r/g/b 0–100 | `/eos/color/rgb` or `/eos/chan/{n}/color/rgb` (mapped 0.0–1.0) |

## Shared selection shape

```ts
channels?: number[]
ranges?: { from: number; thru: number }[]
minus?: number[]   // deselect via /eos/key/_-%
// Legacy from/thru still accepted on channel_select / channel_set_level
```

Thru extends `channel_select` and `channel_set_level`. Minus deselect uses `/_-%` key.

## Field diffs (Lighting Expert)

### `go_to_cue` / `cue_fire`
- **XOR:** exactly one of `cue`, `out: true`, or `cueZero: true`
- `cue_fire` — alias of `go_to_cue` with `time=0` (Assert + GTC via `/eos/newcmd`); never `/eos/cue/.../fire`
- `override_rate_limit` separate from `confirm` (confirm does not bypass rate cap)
- No rate% OSC tool

### `park` / `unpark`
- Shared `channels` + `ranges` selection shape (legacy `channel`/`from`/`thru` accepted)
- Optional `level` 0–100 on park → CLI `Chan N Park At {level}`
- CLI single range or `method=key` for multi-channel park

### `highlight` / `rem_dim`
```ts
{ state?: "on"|"off"|"toggle", channels?, ranges? }
```
- With selection → default `state: "on"`
- Without selection → `state` required
- No `level` arg

### `blackout` / `timing_disable`
```ts
{ state?: "on"|"off"|"toggle" }
```
- `blackout` default `on` when omitted; `timing_disable` default `toggle`

### `sneak`
```ts
{ channels?, ranges?, minus?, time?: number|string, edge?: "down"|"up"|"tap" }
```
- Optional channel selection before key; **omit selection = current programmer selection** (like `make_manual`)
- Optional `time` prepends CLI `Time N`

### `home`
- Requires selection: `channels`/`ranges`, `group`/`groups`, or `faderBank`+`fader`
- Never whole-rig home (no bare `/eos/key/home` without selection)

### `set_cue_timing`
- Fields: `time`, `delay`, `down`, `downDelay`, `focus`, `color`, `beam`, `follow`, `hang`, `block`
- `follow` and `hang` are `number | string` (mutex — not both)
- Legacy `upTime` → `time` alias in builder

## Tools

### `go_to_cue`

- CLI preferred: `Go To Cue 5`, `Go To Cue 1/10`, `Go To Cue Out`, `Go To Cue 0` via `/eos/newcmd`
- Optional `method: "key"` → `/eos/key/go_to_cue` or `/eos/key/go_to_cue_0` (not `go_0`)

### `cue_hold` / `cue_back` / `cue_resume`

- `cue_hold` → `/eos/key/stop` (hold while fading; back when idle). `cue_stop` deprecated alias
- `cue_back` → `/eos/key/back`
- `cue_resume` → `/eos/key/resume`

### `grandmaster_set_level` / `submaster_set_level`

- Tool API: `level` 0–100 → OSC with `level / 100`

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
