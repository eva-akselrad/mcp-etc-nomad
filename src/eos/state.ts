export type ConsoleMode = "blind" | "live" | "unknown";

export interface ActiveCueState {
  text?: string;
  percent?: number;
  raw?: unknown;
}

export interface EosState {
  connected: boolean;
  lastMessageAt?: string;
  consoleMode: ConsoleMode;
  oscUserId?: number;
  commandLine?: string;
  activeCue: ActiveCueState;
  activeChannels?: string;
  pendingCues: Record<string, unknown>;
  faderLevels: Record<string, number>;
  labels: Record<string, string>;
}

export function createInitialState(): EosState {
  return {
    connected: false,
    consoleMode: "unknown",
    activeCue: {},
    pendingCues: {},
    faderLevels: {},
    labels: {},
  };
}
