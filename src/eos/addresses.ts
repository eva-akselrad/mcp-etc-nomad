import type { ServerConfig } from "../config.js";
import { resolveOscKey } from "./keys.js";

const USER_PREFIX = "/eos/user";

export type PaletteType = "ip" | "fp" | "cp" | "bp";

export type DirectSelectType =
  | "chan"
  | "group"
  | "macro"
  | "sub"
  | "preset"
  | "ip"
  | "fp"
  | "cp"
  | "bp"
  | "ms"
  | "curve"
  | "snap"
  | "fx"
  | "pixmap"
  | "scene";

export type FaderAction =
  | "load"
  | "unload"
  | "stop"
  | "fire"
  | "out"
  | "home"
  | "level"
  | "min"
  | "max"
  | "full";

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

export function cueListBankConfig(
  bank: number,
  cueList: number,
  previousRows: number,
  upcomingRows: number,
  offset?: number
): string {
  if (offset === undefined) {
    return `/eos/cuelist/${bank}/config/${cueList}/${previousRows}/${upcomingRows}`;
  }
  return `/eos/cuelist/${bank}/config/${cueList}/${previousRows}/${upcomingRows}/${offset}`;
}

export function cueListBankPage(bank: number, delta: number): string {
  return `/eos/cuelist/${bank}/page/${delta}`;
}

export function cueListBankSelect(bank: number, cue: number | string): string {
  return `/eos/cuelist/${bank}/select/${cue}`;
}

export function cueListBankReset(bank: number): string {
  return `/eos/cuelist/${bank}/reset`;
}

export function faderBankConfig(bank: number, fadersPerPage: number, page?: number): string {
  if (page === undefined) {
    return `/eos/fader/${bank}/config/${fadersPerPage}`;
  }
  return `/eos/fader/${bank}/config/${page}/${fadersPerPage}`;
}

export function faderBankPage(bank: number, delta: number): string {
  return `/eos/fader/${bank}/page/${delta}`;
}

export function faderBankReset(bank: number): string {
  return `/eos/fader/${bank}/reset`;
}

export function faderLevel(bank: number, fader: number): string {
  return `/eos/fader/${bank}/${fader}`;
}

export function faderAction(bank: number, fader: number, action: FaderAction): string {
  return `/eos/fader/${bank}/${fader}/${action}`;
}

export function directSelectBankCreate(
  bank: number,
  type: DirectSelectType,
  count: number,
  page?: number,
  flexi?: boolean
): string {
  const typeSegment = flexi ? `${type}/flexi` : type;
  if (page === undefined) {
    return `/eos/ds/${bank}/${typeSegment}/${count}`;
  }
  return `/eos/ds/${bank}/${typeSegment}/${page}/${count}`;
}

export function directSelectBankPage(bank: number, delta: number): string {
  return `/eos/ds/${bank}/page/${delta}`;
}

export function directSelectPress(bank: number, button: number): string {
  return `/eos/ds/${bank}/${button}`;
}

export function keyPress(keyName: string): string {
  const resolved = resolveOscKey(keyName);
  const name = (resolved ?? keyName.trim().replace(/\s+/g, "_")).toLowerCase();
  return `/eos/key/${name}`;
}

export function softkeyPress(index: number): string {
  return `/eos/softkey/${index}`;
}

export function macroFire(macro?: number): string {
  if (macro === undefined) {
    return "/eos/macro/fire";
  }
  return `/eos/macro/${macro}/fire`;
}

export function macroSelect(): string {
  return "/eos/macro";
}

export function presetFire(preset?: number): string {
  if (preset === undefined) {
    return "/eos/preset/fire";
  }
  return `/eos/preset/${preset}/fire`;
}

export function presetSelect(): string {
  return "/eos/preset";
}

export function paletteFire(type: PaletteType, palette?: number): string {
  if (palette === undefined) {
    return `/eos/${type}/fire`;
  }
  return `/eos/${type}/${palette}/fire`;
}

export function paletteSelect(type: PaletteType): string {
  return `/eos/${type}`;
}

export function subLevel(sub: number): string {
  return `/eos/sub/${sub}`;
}

export function subFire(sub?: number): string {
  if (sub === undefined) {
    return "/eos/sub/fire";
  }
  return `/eos/sub/${sub}/fire`;
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
