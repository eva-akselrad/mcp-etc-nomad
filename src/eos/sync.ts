import {
  getCueCount,
  getCueIndex,
  getCueIndexPrimary,
  getCueListCount,
  getCueListIndex,
  getGroupCount,
  getGroupIndex,
  getPatchCount,
  getPatchIndex,
  getPaletteCount,
  getPaletteIndex,
  getPresetCount,
  getPresetIndex,
  getSubscribe,
  type PaletteType,
} from "./addresses.js";
import type { EosClient } from "./client.js";
import type { EosListener } from "./listener.js";
import type { ExtraTargetState, ExtraTargetType } from "./state.js";
import type { CueListState, GroupState, PatchChannelState, PresetState } from "./show-types.js";
import { cueListKey, groupKey, parseBaseRecordTarget, patchKey, presetKey } from "./show-types.js";

const PALETTE_TYPES: PaletteType[] = ["ip", "fp", "cp", "bp"];

export interface SyncOptions {
  groups?: boolean;
  cueLists?: boolean;
  /** Cue lists whose cues to fetch. Omit for none; set allCues to fetch every list (slow on big shows). */
  cues?: number[];
  allCues?: boolean;
  presets?: boolean;
  palettes?: boolean | PaletteType[];
  patch?: boolean;
  /** Macros, subs, effects (fx), snapshots, magic sheets — off by default. */
  extras?: ExtraTargetType[];
  subscribe?: boolean;
  timeoutMs?: number;
}

export interface SyncResult {
  groups: number;
  cueLists: number;
  cues: Record<string, number>;
  presets: number;
  palettes: Record<string, number>;
  patch: number;
  extras?: Record<string, number>;
  subscribed: boolean;
  lastSyncedAt: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** Eos sends group members as numbers or range strings like "2-6"; expand both. */
export function expandChannelArgs(args: unknown[]): number[] {
  const out: number[] = [];
  for (const arg of args) {
    if (typeof arg === "number") {
      out.push(arg);
      continue;
    }
    if (typeof arg !== "string") continue;
    for (const piece of arg.split(",")) {
      const m = piece.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) continue;
      const from = Number(m[1]);
      const thru = m[2] !== undefined ? Number(m[2]) : from;
      for (let ch = Math.min(from, thru); ch <= Math.max(from, thru); ch++) out.push(ch);
    }
  }
  return out;
}
const INDEX_STEP_MS = 25;

/** Eos may append `/{argCount}` after `/list/0` on multipart /eos/out/get replies. */
const LIST_0_SUFFIX = String.raw`(?:/\d+)?$`;

function outGetList0(pathAfterGet: string): RegExp {
  return new RegExp(`^/eos/out/get/${pathAfterGet}/list/0${LIST_0_SUFFIX}`);
}

export async function syncShowTargets(
  client: EosClient,
  listener: EosListener,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const syncGroups = options.groups ?? true;
  const syncCueLists = options.cueLists ?? true;
  const syncCues = options.cues ?? [];
  const syncPresets = options.presets ?? true;
  const syncPalettes = options.palettes ?? true;
  const syncPatch = options.patch ?? false;
  const subscribe = options.subscribe ?? true;

  let groupCount = 0;
  let cueListCount = 0;
  let presetCount = 0;
  let patchCount = 0;
  const cueCounts: Record<string, number> = {};
  const paletteCounts: Record<string, number> = {};

  if (subscribe) {
    await client.send(getSubscribe(), 1);
    listener.getState().syncStatus.subscribed = true;
  }

  if (syncGroups) {
    groupCount = await syncGroupsFromConsole(client, listener, timeoutMs);
  }

  if (syncCueLists) {
    cueListCount = await syncCueListsFromConsole(client, listener, timeoutMs);
  }

  // Fetching every cue of every list costs ~1 round trip per cue (80s+ on a big show),
  // so only do it for lists that were asked for, or when allCues is set.
  const listsToSync =
    syncCues.length > 0
      ? syncCues
      : options.allCues
        ? Object.keys(listener.getState().cueLists).map(Number)
        : [];

  for (const cueList of listsToSync) {
    cueCounts[String(cueList)] = await syncCuesForList(client, listener, cueList, timeoutMs);
    await sleep(INDEX_STEP_MS);
  }

  if (syncPresets) {
    presetCount = await syncPresetsFromConsole(client, listener, timeoutMs);
  }

  const paletteTypes =
    syncPalettes === true
      ? PALETTE_TYPES
      : syncPalettes === false
        ? []
        : syncPalettes;
  for (const type of paletteTypes) {
    paletteCounts[type] = await syncPalettesOfType(client, listener, type, timeoutMs);
    await sleep(INDEX_STEP_MS);
  }

  if (syncPatch) {
    patchCount = await syncPatchFromConsole(client, listener, timeoutMs);
  }

  const extraCounts: Record<string, number> = {};
  for (const type of options.extras ?? []) {
    extraCounts[type] = await syncExtraTargets(client, listener, type, timeoutMs);
    await sleep(INDEX_STEP_MS);
  }

  const now = new Date().toISOString();
  listener.getState().lastSyncedAt = now;

  return {
    groups: groupCount,
    cueLists: cueListCount,
    cues: cueCounts,
    presets: presetCount,
    palettes: paletteCounts,
    patch: patchCount,
    extras: Object.keys(extraCounts).length ? extraCounts : undefined,
    subscribed: subscribe,
    lastSyncedAt: now,
  };
}

async function syncGroupsFromConsole(
  client: EosClient,
  listener: EosListener,
  timeoutMs: number
): Promise<number> {
  await client.send(getGroupCount());
  const countMsg = await listener.waitFor(/^\/eos\/out\/get\/group\/count$/, timeoutMs);
  const count = Number(countMsg.args[0] ?? 0);

  const groups: Record<string, GroupState> = {};
  for (let index = 0; index < count; index++) {
    await client.send(getGroupIndex(), index);
    const listMsg = await listener.waitFor(outGetList0("group/\\d+"), timeoutMs);
    const groupNumber = Number(listMsg.address.split("/")[5]);
    const base = parseBaseRecordTarget(listMsg.args);
    const group: GroupState = {
      number: groupNumber,
      uid: base.uid,
      label: base.label,
      raw: listMsg.args,
    };

    try {
      const channelsMsg = await listener.waitFor(
        outGetList0(`group/${groupNumber}/channels`),
        timeoutMs
      );
      group.channels = expandChannelArgs(channelsMsg.args.slice(2));
      group.raw = [listMsg.args, channelsMsg.args];
    } catch {
      // Channels list may be empty for new groups.
    }

    groups[groupKey(groupNumber)] = group;
    await sleep(INDEX_STEP_MS);
  }

  listener.getState().groups = groups;
  listener.getState().syncStatus.groupsAt = new Date().toISOString();
  return count;
}

async function syncCueListsFromConsole(
  client: EosClient,
  listener: EosListener,
  timeoutMs: number
): Promise<number> {
  await client.send(getCueListCount());
  const countMsg = await listener.waitFor(/^\/eos\/out\/get\/cuelist\/count$/, timeoutMs);
  const count = Number(countMsg.args[0] ?? 0);

  const cueLists: Record<string, CueListState> = {};
  for (let index = 0; index < count; index++) {
    await client.send(getCueListIndex(), index);
    const listMsg = await listener.waitFor(outGetList0("cuelist/\\d+"), timeoutMs);
    const listNumber = Number(listMsg.address.split("/")[5]);
    const base = parseBaseRecordTarget(listMsg.args);
    const cueList: CueListState = {
      number: listNumber,
      uid: base.uid,
      label: base.label,
      playbackMode: listMsg.args[3] !== undefined ? String(listMsg.args[3]) : undefined,
      faderMode: listMsg.args[4] !== undefined ? String(listMsg.args[4]) : undefined,
      raw: listMsg.args,
    };

    try {
      const linkedMsg = await listener.waitFor(
        outGetList0(`cuelist/${listNumber}/links`),
        timeoutMs
      );
      cueList.linkedCueLists = linkedMsg.args
        .slice(2)
        .flatMap((arg) => (typeof arg === "number" ? [arg] : []));
      cueList.raw = [listMsg.args, linkedMsg.args];
    } catch {
      // Linked lists optional.
    }

    cueLists[cueListKey(listNumber)] = cueList;
    await sleep(INDEX_STEP_MS);
  }

  listener.getState().cueLists = cueLists;
  listener.getState().syncStatus.cueListsAt = new Date().toISOString();
  return count;
}

async function syncCuesForList(
  client: EosClient,
  listener: EosListener,
  cueList: number,
  timeoutMs: number
): Promise<number> {
  // Dictionary-primary: /eos/get/cue/{list}/index + arg; noparts fallback when empty.
  let count = await syncCuesViaPrimaryIndex(client, listener, cueList, timeoutMs);
  if (count === 0) {
    count = await syncCuesViaNopartsIndex(client, listener, cueList, timeoutMs);
  }

  listener.getState().syncStatus.cuesAt[String(cueList)] = new Date().toISOString();
  return count;
}

/** Dictionary-primary /eos/get/cue/{list}/index + int arg. */
async function syncCuesViaPrimaryIndex(
  client: EosClient,
  listener: EosListener,
  cueList: number,
  timeoutMs: number
): Promise<number> {
  let index = 0;
  while (true) {
    await client.send(getCueIndexPrimary(cueList), index);
    try {
      await listener.waitFor(outGetList0(`cue/${cueList}/[^/]+/0`), timeoutMs);
      index++;
      await sleep(INDEX_STEP_MS);
    } catch {
      break;
    }
  }
  return index;
}

/** Legacy noparts index when Dictionary-primary sync returns empty. */
async function syncCuesViaNopartsIndex(
  client: EosClient,
  listener: EosListener,
  cueList: number,
  timeoutMs: number
): Promise<number> {
  await client.send(getCueCount(cueList));
  const countMsg = await listener.waitFor(
    new RegExp(`^/eos/out/get/cue/${cueList}/noparts/count$`),
    timeoutMs
  );
  const count = Number(countMsg.args[0] ?? 0);

  for (let index = 0; index < count; index++) {
    await client.send(getCueIndex(cueList), index);
    await listener.waitFor(outGetList0(`cue/${cueList}/[^/]+/0`), timeoutMs);
    await sleep(INDEX_STEP_MS);
  }

  return count;
}

async function syncPresetsFromConsole(
  client: EosClient,
  listener: EosListener,
  timeoutMs: number
): Promise<number> {
  await client.send(getPresetCount());
  const countMsg = await listener.waitFor(/^\/eos\/out\/get\/preset\/count$/, timeoutMs);
  const count = Number(countMsg.args[0] ?? 0);

  const presets: Record<string, PresetState> = {};
  for (let index = 0; index < count; index++) {
    await client.send(getPresetIndex(), index);
    const listMsg = await listener.waitFor(outGetList0("preset/\\d+"), timeoutMs);
    const number = Number(listMsg.address.split("/")[5]);
    const base = parseBaseRecordTarget(listMsg.args);
    presets[presetKey(number)] = { number, uid: base.uid, label: base.label, raw: listMsg.args };
    await sleep(INDEX_STEP_MS);
  }

  listener.getState().presets = presets;
  listener.getState().syncStatus.presetsAt = new Date().toISOString();
  return count;
}

async function syncPalettesOfType(
  client: EosClient,
  listener: EosListener,
  type: PaletteType,
  timeoutMs: number
): Promise<number> {
  await client.send(getPaletteCount(type));
  const countMsg = await listener.waitFor(
    new RegExp(`^/eos/out/get/${type}/count$`),
    timeoutMs
  );
  const count = Number(countMsg.args[0] ?? 0);

  for (let index = 0; index < count; index++) {
    await client.send(getPaletteIndex(type), index);
    await listener.waitFor(outGetList0(`${type}/\\d+`), timeoutMs);
    await sleep(INDEX_STEP_MS);
  }

  listener.getState().syncStatus.palettesAt[type] = new Date().toISOString();
  return count;
}

async function syncPatchFromConsole(
  client: EosClient,
  listener: EosListener,
  timeoutMs: number
): Promise<number> {
  await client.send(getPatchCount());
  const countMsg = await listener.waitFor(/^\/eos\/out\/get\/patch\/count$/, timeoutMs);
  const count = Number(countMsg.args[0] ?? 0);

  const patch: Record<string, PatchChannelState> = {};
  for (let index = 0; index < count; index++) {
    await client.send(getPatchIndex(index));
    const listMsg = await listener.waitFor(
      new RegExp(`^/eos/out/get/patch/\\d+/\\d+/list/0${LIST_0_SUFFIX}`),
      timeoutMs
    );
    const parts = listMsg.address.split("/");
    const channel = Number(parts[5]);
    const part = Number(parts[6]);
    const base = parseBaseRecordTarget(listMsg.args);
    patch[patchKey(channel, part)] = {
      channel,
      part,
      uid: base.uid,
      label: base.label,
      manufacturer: listMsg.args[3] !== undefined ? String(listMsg.args[3]) : undefined,
      fixtureType: listMsg.args[4] !== undefined ? String(listMsg.args[4]) : undefined,
      address: typeof listMsg.args[5] === "number" ? listMsg.args[5] : undefined,
      intensityAddress: typeof listMsg.args[6] === "number" ? listMsg.args[6] : undefined,
      currentLevel: typeof listMsg.args[7] === "number" ? listMsg.args[7] : undefined,
      gel: listMsg.args[8] !== undefined ? String(listMsg.args[8]) : undefined,
      // args[19] is a part/flag field; the end DMX address is args[20].
      endAddress: typeof listMsg.args[20] === "number" ? listMsg.args[20] : undefined,
      raw: listMsg.args,
    };
    await sleep(INDEX_STEP_MS);
  }

  listener.getState().patch = patch;
  listener.getState().syncStatus.patchAt = new Date().toISOString();
  return count;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/** Field layouts from the Eos v3.2 manual, "Detailed Information Packet Contents". */
function extraDetails(type: ExtraTargetType, args: unknown[]): Record<string, unknown> {
  const a = (i: number) => args[i];
  switch (type) {
    case "macro":
      return { mode: a(3) };
    case "sub":
      return {
        mode: a(3), faderMode: a(4), htp: a(5), exclusive: a(6), background: a(7),
        restore: a(8), priority: a(9), upTime: a(10), dwellTime: a(11), downTime: a(12),
      };
    case "fx":
      return { effectType: a(3), entry: a(4), exit: a(5), duration: a(6), scale: a(7) };
    default:
      return {};
  }
}

async function syncExtraTargets(
  client: EosClient,
  listener: EosListener,
  type: ExtraTargetType,
  timeoutMs: number
): Promise<number> {
  await client.send(`/eos/get/${type}/count`);
  const countMsg = await listener.waitFor(new RegExp(`^/eos/out/get/${type}/count$`), timeoutMs);
  const count = Number(countMsg.args[0] ?? 0);
  const items: Record<string, ExtraTargetState> = {};

  for (let index = 0; index < count; index++) {
    await client.send(`/eos/get/${type}/index`, index);
    const msg = await listener.waitFor(outGetList0(`${type}/[\\d.]+`), timeoutMs);
    const number = Number(msg.address.split("/")[5]);
    const base = parseBaseRecordTarget(msg.args);
    const details = extraDetails(type, msg.args);
    if (type === "macro") {
      try {
        const textMsg = await listener.waitFor(outGetList0(`macro/${number}/text`), 1500);
        details.text = textMsg.args
          .slice(2)
          .map((x) => String(x))
          .join("")
          .replace(/[\r\n]+/g, " ")
          .trim();
      } catch {
        details.text = undefined;
      }
    }
    items[String(number)] = { type, number, uid: base.uid, label: base.label, details, raw: msg.args };
    await sleep(INDEX_STEP_MS);
  }

  listener.getState().extraTargets[type] = items;
  return count;
}
