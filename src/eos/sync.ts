import {
  getCueCount,
  getCueIndex,
  getCueListCount,
  getCueListIndex,
  getGroupCount,
  getGroupIndex,
  getSubscribe,
} from "./addresses.js";
import type { EosClient } from "./client.js";
import type { EosListener } from "./listener.js";
import type { CueListState, CueState, GroupState } from "./show-types.js";
import { cueKey, cueListKey, groupKey, parseBaseRecordTarget } from "./show-types.js";

export interface SyncOptions {
  groups?: boolean;
  cueLists?: boolean;
  cues?: number[];
  subscribe?: boolean;
  timeoutMs?: number;
}

export interface SyncResult {
  groups: number;
  cueLists: number;
  cues: Record<string, number>;
  subscribed: boolean;
  lastSyncedAt: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const INDEX_STEP_MS = 25;

export async function syncShowTargets(
  client: EosClient,
  listener: EosListener,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const syncGroups = options.groups ?? true;
  const syncCueLists = options.cueLists ?? true;
  const syncCues = options.cues ?? [];
  const subscribe = options.subscribe ?? true;

  let groupCount = 0;
  let cueListCount = 0;
  const cueCounts: Record<string, number> = {};

  if (subscribe) {
    await client.send(getSubscribe(true));
    listener.getState().syncStatus.subscribed = true;
  }

  if (syncGroups) {
    groupCount = await syncGroupsFromConsole(client, listener, timeoutMs);
  }

  if (syncCueLists) {
    cueListCount = await syncCueListsFromConsole(client, listener, timeoutMs);
  }

  const listsToSync =
    syncCues.length > 0 ? syncCues : Object.keys(listener.getState().cueLists).map(Number);

  for (const cueList of listsToSync) {
    cueCounts[String(cueList)] = await syncCuesForList(client, listener, cueList, timeoutMs);
    await sleep(INDEX_STEP_MS);
  }

  const now = new Date().toISOString();
  listener.getState().lastSyncedAt = now;

  return {
    groups: groupCount,
    cueLists: cueListCount,
    cues: cueCounts,
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
    await client.send(getGroupIndex(index));
    const listMsg = await listener.waitFor(
      new RegExp(`^/eos/out/get/group/\\d+/list/0$`),
      timeoutMs
    );
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
        new RegExp(`^/eos/out/get/group/${groupNumber}/channels/list/0$`),
        timeoutMs
      );
      group.channels = channelsMsg.args
        .slice(2)
        .flatMap((arg) => (typeof arg === "number" ? [arg] : []));
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
    await client.send(getCueListIndex(index));
    const listMsg = await listener.waitFor(
      new RegExp(`^/eos/out/get/cuelist/\\d+/list/0$`),
      timeoutMs
    );
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
        new RegExp(`^/eos/out/get/cuelist/${listNumber}/linked/list/0$`),
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
  await client.send(getCueCount(cueList));
  const countMsg = await listener.waitFor(
    new RegExp(`^/eos/out/get/cue/${cueList}/noparts/count$`),
    timeoutMs
  );
  const count = Number(countMsg.args[0] ?? 0);

  for (let index = 0; index < count; index++) {
    await client.send(getCueIndex(cueList, index));
    await listener.waitFor(
      new RegExp(`^/eos/out/get/cue/${cueList}/[^/]+/0/list/0$`),
      timeoutMs
    );
    await sleep(INDEX_STEP_MS);
  }

  listener.getState().syncStatus.cuesAt[String(cueList)] = new Date().toISOString();
  return count;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
