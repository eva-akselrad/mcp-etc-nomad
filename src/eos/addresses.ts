import type { ServerConfig } from "../config.js";

const USER_PREFIX = "/eos/user";

export function withUserPrefix(config: ServerConfig, address: string): string {
  if (config.userId < 0) {
    return address;
  }
  if (address.startsWith(USER_PREFIX)) {
    return address;
  }
  if (address === "/eos/user") {
    return address;
  }
  if (address.startsWith("/eos/")) {
    return `${USER_PREFIX}/${config.userId}${address.slice(4)}`;
  }
  return address;
}

export function channelLevel(channel: number): string {
  return `/eos/chan/${channel}`;
}

export function channelSelect(): string {
  return "/eos/chan";
}

export function groupLevel(group: number): string {
  return `/eos/group/${group}`;
}

export function cueFire(cueList: number | undefined, cue: number | string): string {
  if (cueList === undefined) {
    return "/eos/cue/fire";
  }
  return `/eos/cue/${cueList}/${cue}/fire`;
}

export function cueSelect(cueList: number | undefined): string {
  if (cueList === undefined) {
    return "/eos/cue";
  }
  return `/eos/cue/${cueList}`;
}

export function keyPress(keyName: string): string {
  const normalized = keyName.trim().replace(/\s+/g, "_").toLowerCase();
  return `/eos/key/${normalized}`;
}

export function macroFire(): string {
  return "/eos/macro/fire";
}

export function subLevel(sub: number): string {
  return `/eos/sub/${sub}`;
}

export function paletteFire(type: "ip" | "fp" | "cp" | "bp", palette: number): string {
  return `/eos/${type}/fire=${palette}`;
}

export function commandLine(path: "cmd" | "newcmd" | "event"): string {
  return `/eos/${path}`;
}

export function oscReset(): string {
  return "/eos/reset";
}

export function atLevel(): string {
  return "/eos/at";
}

export function magicSheet(sheet: number, view?: number): string {
  if (view === undefined) {
    return `/eos/ms=${sheet}`;
  }
  return `/eos/ms/${sheet}=${view}`;
}
