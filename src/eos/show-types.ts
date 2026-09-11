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
  notes?: string;
  raw?: unknown[];
}

export interface SyncStatus {
  groupsAt?: string;
  cueListsAt?: string;
  cuesAt: Record<string, string>;
  subscribed?: boolean;
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
