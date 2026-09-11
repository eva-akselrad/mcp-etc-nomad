export type ConsoleMode = "blind" | "live" | "unknown";

export interface ActiveCueState {
  text?: string;
  percent?: number;
  cueList?: number;
  cue?: number | string;
  part?: number;
  raw?: unknown;
}

export interface PendingCueState {
  text?: string;
  entries: Record<string, unknown>;
}

export interface FaderBankState {
  levels: Record<string, number>;
  labels: Record<string, string>;
  page?: string;
}

export interface EosState {
  connected: boolean;
  lastMessageAt?: string;
  consoleMode: ConsoleMode;
  oscUserId?: number;
  commandLine?: string;
  activeCue: ActiveCueState;
  pendingCue: PendingCueState;
  activeChannels?: string;
  faderBanks: Record<string, FaderBankState>;
  cueListBanks: Record<string, unknown>;
  directSelectBanks: Record<string, unknown>;
  labels: Record<string, string>;
}

export function createInitialState(): EosState {
  return {
    connected: false,
    consoleMode: "unknown",
    activeCue: {},
    pendingCue: { entries: {} },
    faderBanks: {},
    cueListBanks: {},
    directSelectBanks: {},
    labels: {},
  };
}
