import type { ServerConfig } from "../config.js";
import { normalizeOscKey } from "./keys.js";

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

export type FaderAction = "load" | "unload" | "stop" | "fire" | "home" | "out" | "min" | "max" | "full" | "level";

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

/** Cue / palette numbers may be point cues (1.5) but must not contain `/`. */
export function targetNumber(value: number | string, label = "target"): string {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid ${label} "${value}" (expected a number such as 1 or 1.5)`);
  }
  return text;
}

export function channelLevel(channel: number): string {
  return `/eos/chan/${channel}`;
}

export function channelDmx(channel: number): string {
  return `/eos/chan/${channel}/dmx`;
}

export function channelSelect(): string {
  return "/eos/chan";
}

export function groupSelect(): string {
  return "/eos/group";
}

export function groupLevel(group: number): string {
  return `/eos/group/${group}`;
}

export function grandmasterLevel(): string {
  return "/eos/fader/0/1";
}

export function channelColorHs(channel?: number): string {
  if (channel === undefined) {
    return "/eos/color/hs";
  }
  return `/eos/chan/${channel}/color/hs`;
}

export function channelColorRgb(channel?: number): string {
  if (channel === undefined) {
    return "/eos/color/rgb";
  }
  return `/eos/chan/${channel}/color/rgb`;
}

export function channelParam(channel: number, param: string): string {
  return `/eos/chan/${channel}/param/${param}`;
}

export function paramSet(param: string): string {
  return `/eos/param/${param}`;
}

export function getPatchCount(): string {
  return "/eos/get/patch/count";
}

export function getPatchIndex(index: number): string {
  return `/eos/get/patch/index/${index}`;
}

export function getPatch(channel: number, part = 1): string {
  return `/eos/get/patch/${channel}/${part}`;
}

export function cueFire(cueList: number | undefined, cue: number | string, part?: number): string {
  const cueSeg = targetNumber(cue, "cue");
  if (cueList === undefined) {
    return "/eos/cue/fire";
  }
  if (part !== undefined) {
    return `/eos/cue/${cueList}/${cueSeg}/${part}/fire`;
  }
  return `/eos/cue/${cueList}/${cueSeg}/fire`;
}

export function cueSelect(cueList: number | undefined, cue?: number | string): string {
  if (cueList === undefined) {
    return "/eos/cue";
  }
  if (cue === undefined) {
    return `/eos/cue/${cueList}`;
  }
  return `/eos/cue/${cueList}/${targetNumber(cue, "cue")}`;
}

export function cueListGo(cueList?: number): string {
  if (cueList === undefined) {
    return "/eos/cues/fire";
  }
  return `/eos/cues/${cueList}/fire`;
}

export function cueListStop(cueList?: number): string {
  if (cueList === undefined) {
    return "/eos/cues/stop";
  }
  return `/eos/cues/${cueList}/stop`;
}

export function cueListBankConfig(
  bank: number,
  cueList: number,
  previous: number,
  pending: number,
  offset?: number
): string {
  const base = `/eos/cuelist/${bank}/config/${cueList}/${previous}/${pending}`;
  if (offset === undefined) {
    return base;
  }
  return `${base}/${offset}`;
}

export function cueListBankPage(bank: number, delta: number): string {
  return `/eos/cuelist/${bank}/page/${delta}`;
}

export function cueListBankSelect(bank: number, cue: number | string): string {
  return `/eos/cuelist/${bank}/select/${targetNumber(cue, "cue")}`;
}

export function cueListBankReset(bank: number): string {
  return `/eos/cuelist/${bank}/reset`;
}

export function faderBankConfig(bank: number, count: number, page?: number): string {
  if (page === undefined) {
    return `/eos/fader/${bank}/config/${count}`;
  }
  return `/eos/fader/${bank}/config/${page}/${count}`;
}

export function faderLevel(bank: number, fader: number): string {
  return `/eos/fader/${bank}/${fader}`;
}

export function faderAction(bank: number, fader: number, action: FaderAction): string {
  return `/eos/fader/${bank}/${fader}/${action}`;
}

export function faderBankPage(bank: number, delta: number): string {
  return `/eos/fader/${bank}/page/${delta}`;
}

export function faderBankReset(bank: number): string {
  return `/eos/fader/${bank}/reset`;
}

export function directSelectBankCreate(
  bank: number,
  type: DirectSelectType,
  count: number,
  options?: { flexi?: boolean; page?: number }
): string {
  const parts = [`/eos/ds/${bank}/${type}`];
  if (options?.flexi) {
    parts.push("flexi");
  }
  if (options?.page !== undefined) {
    parts.push(String(options.page));
  }
  parts.push(String(count));
  return parts.join("/");
}

export function directSelectBankPage(bank: number, delta: number): string {
  return `/eos/ds/${bank}/page/${delta}`;
}

export function directSelectPress(bank: number, button: number): string {
  return `/eos/ds/${bank}/${button}`;
}

export function keyPress(keyName: string): string {
  return `/eos/key/${normalizeOscKey(keyName)}`;
}

export function softkeyPress(index: number): string {
  return `/eos/softkey/${index}`;
}

export function macroFire(): string {
  return "/eos/macro/fire";
}

export function macroFireNumber(macro: number): string {
  return `/eos/macro/${macro}/fire`;
}

export function macroSelect(): string {
  return "/eos/macro";
}

export function subLevel(sub: number): string {
  return `/eos/sub/${sub}`;
}

export function subSelect(): string {
  return "/eos/sub";
}

export function subFire(sub?: number): string {
  if (sub === undefined) {
    return "/eos/sub/fire";
  }
  return `/eos/sub/${sub}/fire`;
}

export function paletteSelect(type: PaletteType): string {
  return `/eos/${type}`;
}

export function paletteFire(type: PaletteType, palette?: number): string {
  if (palette === undefined) {
    return `/eos/${type}/fire`;
  }
  return `/eos/${type}/${palette}/fire`;
}

export function presetSelect(): string {
  return "/eos/preset";
}

export function presetFire(preset?: number): string {
  if (preset === undefined) {
    return "/eos/preset/fire";
  }
  return `/eos/preset/${preset}/fire`;
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
    return "/eos/ms";
  }
  return `/eos/ms/${sheet}`;
}

export function stagingModeKey(): string {
  return "/eos/key/staging_mode";
}

/** OSC Get — request show-data sync (ETC Dictionary /eos/get/*). */
export function getSubscribe(enable: boolean): string {
  return `/eos/subscribe=${enable ? 1 : 0}`;
}

export function getGroupCount(): string {
  return "/eos/get/group/count";
}

export function getGroupIndex(index: number): string {
  return `/eos/get/group/index/${index}`;
}

export function getGroup(number: number): string {
  return `/eos/get/group/${number}`;
}

export function getCueListCount(): string {
  return "/eos/get/cuelist/count";
}

export function getCueListIndex(index: number): string {
  return `/eos/get/cuelist/index/${index}`;
}

export function getCueList(number: number): string {
  return `/eos/get/cuelist/${number}`;
}

export function getCueCount(cueList: number): string {
  return `/eos/get/cue/${cueList}/noparts/count`;
}

export function getCueIndex(cueList: number, index: number): string {
  return `/eos/get/cue/${cueList}/noparts/index/${index}`;
}

export function getCue(cueList: number, cue: number | string): string {
  return `/eos/get/cue/${cueList}/${targetNumber(cue, "cue")}/0`;
}

/** OSC Set — Dictionary /eos/set/* (Record itself stays CLI). */
export function setGroupLabel(group: number): string {
  return `/eos/set/group/${group}/label`;
}

/** Group channel membership; Thru ranges as "from > thru" per Dictionary. */
export function setGroupChannels(group: number): string {
  return `/eos/set/group/${group}/chans`;
}

export function setCueLabel(cueList: number, cue: number | string): string {
  return `/eos/set/cue/${cueList}/${targetNumber(cue, "cue")}/label`;
}

export function setPresetLabel(preset: number): string {
  return `/eos/set/preset/${preset}/label`;
}

export function setPaletteLabel(type: PaletteType, palette: number): string {
  return `/eos/set/${type}/${palette}/label`;
}

export function getPresetCount(): string {
  return "/eos/get/preset/count";
}

export function getPresetIndex(index: number): string {
  return `/eos/get/preset/index/${index}`;
}

export function getPaletteCount(type: PaletteType): string {
  return `/eos/get/${type}/count`;
}

export function getPaletteIndex(type: PaletteType, index: number): string {
  return `/eos/get/${type}/index/${index}`;
}
