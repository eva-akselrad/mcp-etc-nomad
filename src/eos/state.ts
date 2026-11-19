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

export interface SessionInfo {
  raw?: unknown[];
  lastEvent?: string;
}

export interface ConsoleGetCache {
  processors?: unknown[];
  userlist?: unknown[];
  version?: unknown[];
  session?: unknown[];
}

export interface ShowFileInfo {
  path?: string;
  lastEvent?: "saved" | "loaded" | "cleared" | string;
  lastEventPath?: string;
}

export interface ActiveWheelState {
  index: number;
  label: string;
  name: string;
  /** 0=Null, 1=Intensity, 2=Focus, 3=Color, 4=Image, 5=Form, 6=Shutter */
  category?: number;
  value?: number;
  raw: unknown[];
  updatedAt: string;
}

export type ExtraTargetType = "macro" | "sub" | "fx" | "snap" | "ms";

export interface ExtraTargetState {
  type: ExtraTargetType;
  number: number;
  uid?: string;
  label?: string;
  /** Type-specific fields from the Eos OSC get reply (e.g. macro text, sub mode, effect type). */
  details: Record<string, unknown>;
  raw: unknown[];
}

export interface EosState {
  connected: boolean;
  lastMessageAt?: string;
  lastSyncedAt?: string;
  consoleMode: ConsoleMode;
  oscUserId?: number;
  commandLine?: string;
  showPath?: string;
  session?: SessionInfo;
  showFile?: ShowFileInfo;
  consoleGet?: ConsoleGetCache;
  activeCue: ActiveCueState;
  activeChannels?: string;
  activeChannelLevels: ActiveChannelLevel[];
  /** /eos/out/active/wheel/<n> — parameters of the first selected channel (name, category, value). */
  activeWheels: Record<string, ActiveWheelState>;
  /** Last /eos/out/event/cue/<list>/<cue>/fire|stop. */
  lastCueEvent?: { cueList: number; cue: string; event: string; at: string };
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
  /** Macros, subs, effects, snapshots, magic sheets keyed by type then number. */
  extraTargets: Partial<Record<ExtraTargetType, Record<string, ExtraTargetState>>>;
  syncStatus: SyncStatus;
}

export function createInitialState(): EosState {
  return {
    connected: false,
    consoleMode: "unknown",
    showFile: {},
    session: {},
    consoleGet: {},
    activeCue: {},
    activeChannelLevels: [],
    activeWheels: {},
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
    extraTargets: {},
    syncStatus: { cuesAt: {}, palettesAt: {} },
  };
}
