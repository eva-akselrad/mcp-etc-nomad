/** Cached show target from OSC /eos/out/get/* sync (node-eos-console pattern). */

export interface GroupState {
  number: number;
  uid?: string;
  label?: string;
  channels?: number[];
  raw?: unknown[];
}

export interface CueListState {
  number: number;
  uid?: string;
  label?: string;
  playbackMode?: string;
  faderMode?: string;
  linkedCueLists?: number[];
  raw?: unknown[];
}

export interface CueState {
  cueList: number;
  number: string;
  uid?: string;
  label?: string;
  partCount?: number;
  upTimeDurationMs?: number;
  upTimeDelayMs?: number;
  downTimeDurationMs?: number;
  downTimeDelayMs?: number;
  focusTimeDurationMs?: number;
  colorTimeDurationMs?: number;
  beamTimeDurationMs?: number;
  followHang?: string;
  blocked?: boolean;
  scene?: string;
  notes?: string;
  raw?: unknown[];
}

export interface PatchChannelState {
  channel: number;
  part?: number;
  uid?: string;
  label?: string;
  manufacturer?: string;
  fixtureType?: string;
  address?: number;
  intensityAddress?: number;
  currentLevel?: number;
  gel?: string;
  endAddress?: number;
  parked?: boolean;
  raw?: unknown[];
}

export interface PresetState {
  number: number;
  uid?: string;
  label?: string;
  raw?: unknown[];
}

export interface PaletteState {
  type: "ip" | "fp" | "cp" | "bp";
  number: number;
  uid?: string;
  label?: string;
  raw?: unknown[];
}

export interface SyncStatus {
  groupsAt?: string;
  cueListsAt?: string;
  cuesAt: Record<string, string>;
  presetsAt?: string;
  palettesAt: Record<string, string>;
  patchAt?: string;
  subscribed?: boolean;
}

export interface ActiveChannelLevel {
  channel: number;
  level?: number;
  fixtureType?: string;
  description?: string;
  text?: string;
}

export function patchKey(channel: number, part = 1): string {
  return `${channel}/${part}`;
}

/** Parse active channel OSC text like "[100] ETC_Fixture Label". */
export function parseActiveChannelText(text: string): {
  level?: number;
  fixtureType?: string;
  description?: string;
} {
  const match = text.match(/^\[(\d+(?:\.\d+)?)\]\s*(.*)$/);
  if (!match) {
    return { description: text.trim() || undefined };
  }
  const level = Number(match[1]);
  const rest = match[2]?.trim() ?? "";
  const parts = rest.split(/\s+/);
  return {
    level: Number.isFinite(level) ? level : undefined,
    fixtureType: parts[0] || undefined,
    description: parts.slice(1).join(" ") || rest || undefined,
  };
}

export function paletteKey(type: string, number: number): string {
  return `${type}/${number}`;
}

export function presetKey(number: number): string {
  return String(number);
}

/** Format group channel string for /eos/set/group/{n}/chans — Thru as "from > thru". */
export function formatGroupChannelsString(options: {
  channels?: number[];
  ranges?: Array<{ from: number; thru: number }>;
}): string {
  const parts: string[] = [];
  for (const range of options.ranges ?? []) {
    parts.push(`${range.from} > ${range.thru}`);
  }
  for (const channel of options.channels ?? []) {
    parts.push(String(channel));
  }
  return parts.join(" ");
}

export function groupKey(number: number): string {
  return String(number);
}

export function cueListKey(number: number): string {
  return String(number);
}

export function cueKey(cueList: number, cue: string | number): string {
  return `${cueList}/${cue}`;
}

/** Parse Eos OSC number-list channel arguments into plain integers. */
export function parseOscNumberList(args: unknown[], startIndex = 2): number[] {
  const channels: number[] = [];
  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === "number") {
      channels.push(arg);
      continue;
    }
    if (typeof arg === "string" && /^\d+$/.test(arg)) {
      channels.push(Number(arg));
    }
  }
  return channels;
}

export function parseBaseRecordTarget(args: unknown[]): {
  uid?: string;
  label?: string;
} {
  const uid = args[1] !== undefined && args[1] !== "" ? String(args[1]) : undefined;
  const label = args[2] !== undefined ? String(args[2]) : undefined;
  return { uid, label };
}
