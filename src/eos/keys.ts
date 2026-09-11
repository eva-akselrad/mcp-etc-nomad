/**
 * Operator-focused OSC hardkey map from the ETC Eos OSC Dictionary
 * (Eos Family v3.3.6 User Manual — OSC Eos Keys).
 *
 * Names are case-insensitive on the console. Spaces may be written as
 * underscores. The slash key must be sent as a backslash (`\`).
 *
 * Full dictionary (including Element bump/stop keys and setup internals)
 * is hundreds of names; this table covers playback and programming keys
 * an MCP operator actually needs. Unknown names are still forwarded after
 * sanitization so the model can use Virtual Keyboard OSC /key Names.
 */

export interface OscKeyInfo {
  /** Canonical OSC key segment (as used in `/eos/key/{name}`). */
  osc: string;
  description: string;
}

/** Common aliases → canonical OSC key names. */
export const KEY_ALIASES: Record<string, string> = {
  go: "go_0",
  go_0: "go_0",
  go0: "go_0",
  go_button: "go_0",
  go_main: "go_main_cuelist",
  go_main_cuelist: "go_main_cuelist",
  stop: "stop",
  stop_back: "stop",
  stopback: "stop",
  back: "back",
  blackout: "blackout",
  bo: "blackout",
  highlight: "highlight",
  resume: "resume",
  load: "load",
  assert: "assert",
  live: "live",
  blind: "blind",
  sneak: "sneak",
  staging: "staging_mode",
  staging_mode: "staging_mode",
  plus: "+",
  minus: "-",
  thru: "thru",
  at: "@",
  decimal: ".",
  period: ".",
  dot: ".",
  slash: "\\",
  divide: "\\",
  plus_percent: "_+%",
  minus_percent: "_-%",
  pluspct: "_+%",
  minuspct: "_-%",
  enter: "enter",
  clear: "clear_cmd",
  clear_cmd: "clear_cmd",
  more_sk: "more_softkeys",
  more_softkeys: "more_softkeys",
  sk1: "softkey_1",
  sk2: "softkey_2",
  sk3: "softkey_3",
  sk4: "softkey_4",
  sk5: "softkey_5",
  sk6: "softkey_6",
  sk7: "softkey_7",
  sk8: "softkey_8",
  spacebar_go: "spacebar_go",
  stop_back_main: "stop_back_main_cuelist",
  stop_back_main_cuelist: "stop_back_main_cuelist",
};

/** Playback, programming, and face-panel keys used in Phase 1. */
export const OSC_KEYS: OscKeyInfo[] = [
  { osc: "go_0", description: "Master playback [Go] (OSC name Go_0)" },
  { osc: "go_main_cuelist", description: "Go on the main cue list" },
  { osc: "stop", description: "Stop / Hold — pause a running fade" },
  { osc: "back", description: "Go Back (may be version-sensitive; Stop is more reliable)" },
  { osc: "resume", description: "Resume a stopped cue fade" },
  { osc: "load", description: "Load (master playback / fader load)" },
  { osc: "assert", description: "Assert" },
  { osc: "go_to_cue", description: "[Go To Cue]" },
  { osc: "go_to_cue_0", description: "[Go To Cue 0]" },
  { osc: "timing_disable", description: "[Timing Disable]" },
  { osc: "stop_effect", description: "[Stop Effect]" },
  { osc: "stop_all", description: "Stop all" },
  { osc: "spacebar_go", description: "Spacebar Go (if enabled in Setup)" },
  { osc: "stop_back_main_cuelist", description: "Stop/Back on main cue list" },
  { osc: "live", description: "[Live]" },
  { osc: "blind", description: "[Blind]" },
  { osc: "preview", description: "[Preview]" },
  { osc: "staging_mode", description: "Toggle Staging Mode" },
  { osc: "sneak", description: "[Sneak]" },
  { osc: "full", description: "[Full]" },
  { osc: "out", description: "[Out]" },
  { osc: "level", description: "[Level]" },
  { osc: "rem_dim", description: "[Rem Dim]" },
  { osc: "_+%", description: "[+%] (OSC name _+%)" },
  { osc: "_-%", description: "[-%] (OSC name _-%)" },
  { osc: "home", description: "[Home]" },
  { osc: "min", description: "[Min]" },
  { osc: "max", description: "[Max]" },
  { osc: "thru", description: "[Thru]" },
  { osc: "+", description: "[+]" },
  { osc: "-", description: "[-]" },
  { osc: ".", description: "[.] decimal" },
  { osc: "@", description: "[At]" },
  { osc: "\\", description: "[/] slash — send as backslash in the OSC path" },
  { osc: "enter", description: "[Enter]" },
  { osc: "clear_cmd", description: "[Clear] command line" },
  { osc: "delete", description: "[Delete]" },
  { osc: "undo", description: "[Undo]" },
  { osc: "label", description: "[Label]" },
  { osc: "record", description: "[Record]" },
  { osc: "record_only", description: "[Record Only]" },
  { osc: "update", description: "[Update]" },
  { osc: "cue", description: "[Cue]" },
  { osc: "sub", description: "[Sub]" },
  { osc: "group", description: "[Group]" },
  { osc: "preset", description: "[Preset]" },
  { osc: "effect", description: "[Effect]" },
  { osc: "macro_button", description: "[Macro]" },
  { osc: "snapshot", description: "[Snapshot]" },
  { osc: "park", description: "[Park]" },
  { osc: "blackout", description: "[Blackout] — console BO function (not Chan Thru Out)" },
  { osc: "highlight", description: "[Highlight] — channel check / highlight mode" },
  { osc: "learn", description: "[Learn]" },
  { osc: "mark", description: "[Mark]" },
  { osc: "time", description: "[Time]" },
  { osc: "delay", description: "[Delay]" },
  { osc: "follow", description: "[Follow]" },
  { osc: "part", description: "[Part]" },
  { osc: "query", description: "[Query]" },
  { osc: "help", description: "[Help]" },
  { osc: "about", description: "[About]" },
  { osc: "next", description: "[Next]" },
  { osc: "last", description: "[Last]" },
  { osc: "select_all", description: "[Select All]" },
  { osc: "select_active", description: "[Select Active]" },
  { osc: "select_manual", description: "[Select Manual]" },
  { osc: "select_last", description: "[Select Last]" },
  { osc: "shift", description: "[Shift] — hold with edge=down" },
  { osc: "fine", description: "[Fine]" },
  { osc: "block", description: "[Block]" },
  { osc: "capture", description: "[Capture]" },
  { osc: "flash", description: "[Flash]" },
  { osc: "intensity", description: "[Intensity] encoder category" },
  { osc: "focus", description: "[Focus]" },
  { osc: "color", description: "[Color]" },
  { osc: "beam", description: "[Beam]" },
  { osc: "shutter", description: "[Shutter]" },
  { osc: "image", description: "[Image]" },
  { osc: "control", description: "[Control]" },
  { osc: "intensity_palette", description: "[Intensity Palette]" },
  { osc: "focus_palette", description: "[Focus Palette]" },
  { osc: "color_palette", description: "[Color Palette]" },
  { osc: "beam_palette", description: "[Beam Palette]" },
  { osc: "more_softkeys", description: "[More SK]" },
  { osc: "softkey_1", description: "Softkey 1 (also /eos/softkey/1)" },
  { osc: "softkey_2", description: "Softkey 2" },
  { osc: "softkey_3", description: "Softkey 3" },
  { osc: "softkey_4", description: "Softkey 4" },
  { osc: "softkey_5", description: "Softkey 5" },
  { osc: "softkey_6", description: "Softkey 6" },
  { osc: "softkey_7", description: "Softkey 7" },
  { osc: "softkey_8", description: "Softkey 8" },
  { osc: "page_up", description: "[Page ▲]" },
  { osc: "page_down", description: "[Page ▼]" },
  { osc: "page_left", description: "[Page ◀]" },
  { osc: "page_right", description: "[Page ▶]" },
  { osc: "fader_page_back", description: "Fader page back" },
  { osc: "escape", description: "[Escape]" },
  { osc: "tab", description: "[Tab]" },
  { osc: "displays", description: "[Displays]" },
  { osc: "setup", description: "[Setup]" },
  { osc: "magic_sheet", description: "[Magic Sheet]" },
  { osc: "0", description: "Digit 0" },
  { osc: "1", description: "Digit 1" },
  { osc: "2", description: "Digit 2" },
  { osc: "3", description: "Digit 3" },
  { osc: "4", description: "Digit 4" },
  { osc: "5", description: "Digit 5" },
  { osc: "6", description: "Digit 6" },
  { osc: "7", description: "Digit 7" },
  { osc: "8", description: "Digit 8" },
  { osc: "9", description: "Digit 9" },
];

const KEY_BY_OSC = new Map(OSC_KEYS.map((k) => [k.osc.toLowerCase(), k]));

/**
 * Virtual Keyboard names seen in some workflows but not in the public OSC Dictionary /
 * Phase 1 `OSC_KEYS` table. Pressing them may no-op while tools falsely claim success.
 * Verify on-console via Virtual Keyboard [Tab 7] → OSC /key Names before opt-in TX.
 */
export const UNVERIFIED_BROWSER_OSC_KEYS = [
  "open_browser",
  "save_file",
  "open_file",
  "export_folder",
  "open_mirror_dialog",
] as const;

const UNVERIFIED_BROWSER_SET = new Set(
  UNVERIFIED_BROWSER_OSC_KEYS.map((k) => k.toLowerCase())
);

export function isUnverifiedBrowserOscKey(name: string): boolean {
  return UNVERIFIED_BROWSER_SET.has(name.trim().toLowerCase());
}

/** True when the name is in the verified Phase 1 OSC Dictionary map (or shift/update workflow tokens). */
export function isVerifiedOscKey(name: string): boolean {
  if (name === "shift" || name === "update") {
    return true;
  }
  try {
    const normalized = normalizeOscKey(name);
    return KEY_BY_OSC.has(normalized.toLowerCase());
  } catch {
    return false;
  }
}

/** Characters allowed in an OSC key path segment after normalization. */
const KEY_SEGMENT = /^[a-z0-9_+\-%\\.@]+$/i;

export function normalizeOscKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("key name must not be empty");
  }
  if (trimmed === "\\" || trimmed === "/") {
    return "\\";
  }
  const lookedUp = KEY_ALIASES[trimmed.toLowerCase().replace(/\s+/g, "_")];
  const normalized = (lookedUp ?? trimmed).replace(/\s+/g, "_");
  if (!KEY_SEGMENT.test(normalized) && normalized !== "\\") {
    throw new Error(
      `Invalid OSC key name "${raw}". Use letters, digits, underscore, or aliases from eos://console/keys.`
    );
  }
  return normalized;
}

export function describeOscKey(oscName: string): OscKeyInfo | undefined {
  return KEY_BY_OSC.get(oscName.toLowerCase());
}

export function oscKeyCatalog(): {
  keys: OscKeyInfo[];
  aliases: Record<string, string>;
  notes: string[];
} {
  return {
    keys: OSC_KEYS,
    aliases: KEY_ALIASES,
    notes: [
      "Source: ETC Eos OSC Dictionary → OSC Eos Keys (v3.3.6).",
      "View all names on the console: Virtual Keyboard [Tab 7] → OSC /key Names.",
      "Go is go_0 (not 'go'). Stop/Back is typically 'stop'; 'back' is documented but version-sensitive.",
      "Softkeys 1–12 are also available as /eos/softkey/{n} via softkey_press.",
      "Hold Shift with key_press edge=down, then the second key, then edge=up.",
    ],
  };
}
