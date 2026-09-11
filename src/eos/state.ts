import type {
  ActiveChannelLevel,
  CueListState,
  CueState,
  GroupState,
  PatchChannelState,
  PaletteState,
  PresetState,
  SyncStatus,
} from "./show-types.js";

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
  activeChannelLevels: ActiveChannelLevel[];
  pendingCue: PendingCueState;
  pendingCues: Record<string, unknown>;
  pendingByCueList: Record<string, PendingCueState[]>;
  patch: Record<string, PatchChannelState>;
  parkedChannels: number[];
  faderLevels: Record<string, number>;
  faderLabels: Record<string, string>;
  faders: Record<string, FaderSlotState>;
  directSelects: Record<string, DirectSelectSlotState>;
  cueListBanks: Record<string, unknown>;
  labels: Record<string, string>;
  groups: Record<string, GroupState>;
  cueLists: Record<string, CueListState>;
  cues: Record<string, CueState>;
  presets: Record<string, PresetState>;
  palettes: Record<string, PaletteState>;
  syncStatus: SyncStatus;
}

export function createInitialState(): EosState {
  return {
    connected: false,
    consoleMode: "unknown",
    activeCue: {},
    activeChannelLevels: [],
    pendingCue: { raw: {} },
    pendingCues: {},
    pendingByCueList: {},
    patch: {},
    parkedChannels: [],
    faderLevels: {},
    faderLabels: {},
    faders: {},
    directSelects: {},
    cueListBanks: {},
    labels: {},
    groups: {},
    cueLists: {},
    cues: {},
    presets: {},
    palettes: {},
    syncStatus: { cuesAt: {}, palettesAt: {} },
  };
}
