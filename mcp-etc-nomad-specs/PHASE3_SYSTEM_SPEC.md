# Phase 3 — Show & System Admin (MCP Spec)

Local human reference — not required in git.

## Checklist

1. **Show file tools** — `show_save`, `show_load`, `show_merge`, `show_export` via `/eos/newcmd` + keys; `confirm_path` for load/merge; `confirm_save` for save.
2. **Dictionary reads** — `get_show_path`, `get_session_info` (`/eos/get/processors`, `userlist`, `version`, `session`, `show/path`).
3. **Session** — `osc_set_user`; join/leave via CLI/keys with `needsManual` (no fake session OSC).
4. **Real TCP OSC** — `EOS_PROTOCOL=tcp` opens stream-framed TCP (not UDP port retarget):
   - **3032** — OSC TCP 1.0 packet-length headers; bidirectional; ~1Hz `/eos/out`.
   - **3037** — Third Party OSC 1.1 SLIP (v3.1+); ~realtime `/eos/out`; enable in Device/Network.
   - Custom ports OK (4703–4727+). Match `EOS_TCP_OSC_VERSION` to Eos Setup TCP mode.
5. **Resources** — `eos://console/info`, `eos://console/session`, `eos://console/version`, `eos://show/path`.
6. **Prompts** — `nomad-setup`, `eos-showfile`.
7. **Skip** — Phase 2 patch tools (already done).

## Eos OSC Domain (show files)

- No OSC Save/Load verbs; Browser + key_press + CLI only.
- Never invent `usb1:/` or `.esf` paths.
- After load/merge: `sync_show_targets` + reconfigure banks.
- Pin `EOS_VERSION` for `.esf` vs `.esf3d`.
- OSC to session **Host** only (`EOS_HOST`).
- Do not `/eos/reset` on load.

## Transport notes

- UDP remains MCP default (`8000` TX / `9001` RX); ETC prefers TCP for reliability.
- TCP: enable OSC RX **and** TX in Setup regardless of transport.
- Firewall both directions or listener state stays empty.
