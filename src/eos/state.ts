export type ConsoleMode = "blind" | "live" | "unknown";

export interface ActiveCueState {
  text?: string;
  percent?: number;
  cueList?: number;
  cue?: string;
  raw?: unknown;
}

export interface PendingCueState {
  text?: string;
  cueList?: number;
  cue?: string;
  raw?: Record<string, unknown>;
}

export interface FaderSlotState {
  bank: number;
  index: number;
  level?: number;
  label?: string;
}

export interface DirectSelectSlotState {
  bank: number;
  index?: number;
  label?: string;
}

export interface EosState {
  connected: boolean;
  lastMessageAt?: string;
  lastSyncedAt?: string;
  consoleMode: ConsoleMode;
  oscUserId?: number;
  commandLine?: string;
  activeCue: ActiveCueState;
  activeChannels?: string;
  pendingCue: PendingCueState;
  pendingCues: Record<string, unknown>;
  faderLevels: Record<string, number>;
  faderLabels: Record<string, string>;
  faders: Record<string, FaderSlotState>;
  directSelects: Record<string, DirectSelectSlotState>;
  cueListBanks: Record<string, unknown>;
  labels: Record<string, string>;
}

export function createInitialState(): EosState {
  return {
    connected: false,
    consoleMode: "unknown",
    activeCue: {},
    pendingCue: { raw: {} },
    pendingCues: {},
    faderLevels: {},
    faderLabels: {},
    faders: {},
    directSelects: {},
    cueListBanks: {},
    labels: {},
  };
}
