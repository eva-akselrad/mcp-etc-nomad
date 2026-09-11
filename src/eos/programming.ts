import { targetNumber } from "./addresses.js";

/** Record targets supported by Eos CLI programming verbs. */
export type ProgrammingTarget =
  | "cue"
  | "group"
  | "preset"
  | "effect"
  | "macro"
  | "snapshot"
  | "curve"
  | "pixmap"
  | "ms"
  | "sub"
  | "ip"
  | "fp"
  | "cp"
  | "bp";

export type RecordStyle = "one_shot" | "two_step";
export type RecordMode = "record" | "record_only";
export type UpdateScope = "all" | "cue_only" | "track";

export interface CueTargetRef {
  cueList?: number;
  cue: number | string;
  part?: number;
}

export interface BuiltProgrammingSteps {
  /** CLI lines; each must be terminated with Enter or # when sent. */
  steps: string[];
  style: RecordStyle;
  notes?: string[];
}

function formatCueRef(ref: CueTargetRef): string {
  const cue = targetNumber(ref.cue, "cue");
  if (ref.part !== undefined) {
    const base = ref.cueList !== undefined ? `Cue ${ref.cueList}/${cue}` : `Cue ${cue}`;
    return `${base} Part ${ref.part}`;
  }
  if (ref.cueList !== undefined) {
    return `Cue ${ref.cueList}/${cue}`;
  }
  return `Cue ${cue}`;
}

function formatTarget(type: ProgrammingTarget, number?: number | string): string {
  const label = type === "ms" ? "Magic Sheet" : capitalize(type);
  if (number === undefined) {
    return label;
  }
  if (type === "cue") {
    throw new Error("Use formatCueRef for cue targets");
  }
  return `${label} ${targetNumber(number, type)}`;
}

function capitalize(value: string): string {
  if (value.length <= 2) {
    return value.toUpperCase();
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRange(
  type: ProgrammingTarget,
  from: number | string,
  thru?: number | string,
  cueList?: number
): string {
  const start =
    type === "cue"
      ? formatCueRef({ cueList, cue: from })
      : formatTarget(type, from);
  if (thru === undefined) {
    return start;
  }
  const end =
    type === "cue"
      ? formatCueRef({ cueList, cue: thru })
      : formatTarget(type, thru);
  return `${start} Thru ${end}`;
}

function recordVerb(mode: RecordMode): string {
  return mode === "record_only" ? "Record Only" : "Record";
}

function updateScopeSuffix(scope?: UpdateScope): string | undefined {
  if (!scope) return undefined;
  if (scope === "cue_only") return "Cue Only";
  if (scope === "track") return "Track";
  return "All";
}

/**
 * Record needs look + target. Supports:
 * - one_shot: "Record Cue 5" or "Cue 1/5 Record"
 * - two_step: ["Cue 5", "Record"] — preferred for multi-step (use eos_new_command per step)
 */
export function buildRecordCommand(options: {
  target: ProgrammingTarget;
  number?: number | string;
  cueList?: number;
  part?: number;
  label?: string;
  block?: boolean;
  merge?: boolean;
  time?: string;
  mode?: RecordMode;
  style?: RecordStyle;
}): string | BuiltProgrammingSteps {
  const style = options.style ?? "one_shot";
  const verb = recordVerb(options.mode ?? "record");

  if (style === "two_step" && options.target === "cue" && options.number !== undefined) {
    const steps = [formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part }), verb];
    if (options.block) steps[1] += " Block";
    if (options.merge) steps[1] += " Merge";
    if (options.time) steps[1] += ` ${options.time}`;
    if (options.label) {
      steps.push(
        `Label ${formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part })} ${JSON.stringify(options.label)}`
      );
    }
    return {
      style: "two_step",
      steps,
      notes: [
        "Two-step record: build look in programmer first, then send each step via eos_new_command.",
        "Record vs Record Only: wrong choice overwrites or leaves empty targets.",
      ],
    };
  }

  const parts: string[] = [];

  if (options.target === "cue") {
    if (options.number === undefined) {
      parts.push(verb);
    } else if (style === "one_shot") {
      parts.push(verb, formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part }));
    } else {
      parts.push(formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part }), verb);
    }
  } else if (options.number === undefined) {
    parts.push(verb);
  } else {
    parts.push(formatTarget(options.target, options.number), verb);
  }

  if (options.block) parts.push("Block");
  if (options.merge) parts.push("Merge");
  if (options.time) parts.push(options.time);
  if (options.label && options.target === "cue" && options.number !== undefined) {
    parts.push(
      `Label ${formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part })} ${JSON.stringify(options.label)}`
    );
  } else if (options.label && options.number !== undefined) {
    parts.push(`Label ${formatTarget(options.target, options.number)} ${JSON.stringify(options.label)}`);
  }

  return parts.join(" ");
}

/** Update only commits manual/red values — use updateScope and Make Manual when needed after Go. */
export function buildUpdateCommand(options: {
  target: ProgrammingTarget;
  number?: number | string;
  cueList?: number;
  part?: number;
  block?: boolean;
  merge?: boolean;
  time?: string;
  scope?: UpdateScope;
  style?: RecordStyle;
}): string | BuiltProgrammingSteps {
  const style = options.style ?? "one_shot";
  const scopeWord = updateScopeSuffix(options.scope);

  if (style === "two_step" && options.target === "cue" && options.number !== undefined) {
    let step2 = "Update";
    if (scopeWord) step2 += ` ${scopeWord}`;
    if (options.block) step2 += " Block";
    if (options.merge) step2 += " Merge";
    if (options.time) step2 += ` ${options.time}`;
    return {
      style: "two_step",
      steps: [
        formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part }),
        step2,
      ],
      notes: [
        "Update commits manual/red values only. After Go, Make Manual or re-select channels first.",
        "Live vs Blind Update dialogs differ — prefer Blind for programming.",
      ],
    };
  }

  const parts: string[] = [];

  if (options.target === "cue") {
    if (options.number === undefined) {
      parts.push("Update");
    } else {
      parts.push(
        formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part }),
        "Update"
      );
    }
  } else if (options.number === undefined) {
    parts.push("Update");
  } else {
    parts.push(formatTarget(options.target, options.number), "Update");
  }

  if (scopeWord) parts.push(scopeWord);
  if (options.block) parts.push("Block");
  if (options.merge) parts.push("Merge");
  if (options.time) parts.push(options.time);

  return parts.join(" ");
}

/** Cue copy: "Copy Cue 1 Thru 5 Cue 10" (source range, then destination). */
export function buildCopyCommand(options: {
  sourceType: ProgrammingTarget;
  sourceFrom: number | string;
  sourceThru?: number | string;
  sourceCueList?: number;
  destType: ProgrammingTarget;
  dest: number | string;
  destCueList?: number;
  time?: string;
}): string {
  const parts = ["Copy"];

  if (options.sourceType === "cue") {
    parts.push(formatRange("cue", options.sourceFrom, options.sourceThru, options.sourceCueList));
  } else {
    parts.push(formatRange(options.sourceType, options.sourceFrom, options.sourceThru));
  }

  if (options.destType === "cue") {
    parts.push(formatCueRef({ cueList: options.destCueList, cue: options.dest }));
  } else {
    parts.push(formatTarget(options.destType, options.dest));
  }

  if (options.time) parts.push(options.time);
  return parts.join(" ");
}

/** Cue move: "Move Cue 5 At Cue 10". Do not use for effects or patch. */
export function buildCueMoveCommand(options: {
  source: number | string;
  dest: number | string;
  sourceCueList?: number;
  destCueList?: number;
  time?: string;
}): string {
  const parts = [
    "Move",
    formatCueRef({ cueList: options.sourceCueList, cue: options.source }),
    "At",
    formatCueRef({ cueList: options.destCueList, cue: options.dest }),
  ];
  if (options.time) parts.push(options.time);
  return parts.join(" ");
}

/** Effect move: "Move Effect 1 At Effect 2" — separate from cue copy templates. */
export function buildEffectMoveCommand(options: {
  source: number | string;
  dest: number | string;
}): string {
  return `Move Effect ${targetNumber(options.source, "effect")} At Effect ${targetNumber(options.dest, "effect")}`;
}

/** Patch copy (not channel live Copy To): "111 Copy To 116". Scope via {Plus Show}/{Only Show} softkeys on desk. */
export function buildPatchCopyCommand(options: {
  sourceChannel: number;
  destChannel: number;
}): string {
  return `${options.sourceChannel} Copy To ${options.destChannel}`;
}

/**
 * Patch MOVE = double Copy To: "116 Copy To Copy To 120".
 * Single Copy To is copy, not move.
 */
export function buildPatchMoveCommand(options: {
  sourceChannel: number;
  destChannel: number;
}): string {
  return `${options.sourceChannel} Copy To Copy To ${options.destChannel}`;
}

/** @deprecated Use buildCueMoveCommand or buildEffectMoveCommand */
export function buildMoveCommand(options: {
  sourceType: ProgrammingTarget;
  source: number | string;
  sourceCueList?: number;
  destType: ProgrammingTarget;
  dest: number | string;
  destCueList?: number;
  time?: string;
}): string {
  if (options.sourceType === "effect" && options.destType === "effect") {
    return buildEffectMoveCommand({ source: options.source, dest: options.dest });
  }
  if (options.sourceType === "cue" && options.destType === "cue") {
    return buildCueMoveCommand({
      source: options.source,
      dest: options.dest,
      sourceCueList: options.sourceCueList,
      destCueList: options.destCueList,
      time: options.time,
    });
  }
  throw new Error("Use buildCueMoveCommand, buildEffectMoveCommand, or buildPatchMoveCommand.");
}

export function buildDeleteCommand(options: {
  target: ProgrammingTarget;
  from: number | string;
  thru?: number | string;
  cueList?: number;
  part?: number;
}): string {
  const parts = ["Delete"];

  if (options.target === "cue") {
    parts.push(
      formatRange("cue", options.from, options.thru, options.cueList)
    );
  } else {
    parts.push(formatRange(options.target, options.from, options.thru));
  }

  return parts.join(" ");
}

/** Unpatch removes patch assignment — not the same as Delete channel data. */
export function buildUnpatchCommand(options: {
  channel: number;
  thru?: number;
}): string {
  if (options.thru !== undefined) {
    return `Unpatch ${options.channel} Thru ${options.thru}`;
  }
  return `Unpatch ${options.channel}`;
}

export function buildLabelCommand(options: {
  target: ProgrammingTarget;
  number: number | string;
  label: string;
  cueList?: number;
  part?: number;
}): string {
  if (options.target === "cue") {
    return `Label ${formatCueRef({
      cueList: options.cueList,
      cue: options.number,
      part: options.part,
    })} ${JSON.stringify(options.label)}`;
  }
  return `Label ${formatTarget(options.target, options.number)} ${JSON.stringify(options.label)}`;
}

export function buildGroupFromChannelsCommand(options: {
  channelFrom?: number;
  channelThru?: number;
  channels?: number[];
  ranges?: Array<{ from: number; thru: number }>;
  useCurrentSelection?: boolean;
  group: number;
  label?: string;
  mode?: RecordMode;
}): string {
  const selectionParts: string[] = [];
  if (options.useCurrentSelection) {
    // Current programmer selection — no channel prefix.
  } else if (options.channelFrom !== undefined) {
    selectionParts.push(
      options.channelThru !== undefined
        ? `Channel ${options.channelFrom} Thru ${options.channelThru}`
        : `Channel ${options.channelFrom}`
    );
  } else {
    for (const range of options.ranges ?? []) {
      selectionParts.push(`Channel ${range.from} Thru ${range.thru}`);
    }
    if (options.channels?.length) {
      selectionParts.push(
        options.channels.map((ch, i) => (i === 0 ? `Channel ${ch}` : `${ch}`)).join(" + ")
      );
    }
    if (selectionParts.length === 0) {
      throw new Error(
        "Provide channelFrom/thru, channels/ranges, or useCurrentSelection for record_group."
      );
    }
  }

  const verb = recordVerb(options.mode ?? "record");
  const parts = [...selectionParts, `Group ${options.group}`, verb];
  if (options.label) {
    parts.push(`Label Group ${options.group} ${JSON.stringify(options.label)}`);
  }
  return parts.join(" ");
}

/** Make Manual — required after Go before Update commits manual values. */
export function buildMakeManualCommand(): string {
  return "Make Manual";
}

/** Set cue timing fields via CLI (Time, Delay, Follow/Hang, up/down, IPCB). */
export function buildSetCueTimingCommand(options: {
  cue: number | string;
  cueList?: number;
  part?: number;
  upTime?: string;
  upDelay?: string;
  downTime?: string;
  downDelay?: string;
  focusTime?: string;
  colorTime?: string;
  beamTime?: string;
  follow?: boolean;
  hang?: string;
  block?: boolean;
}): string {
  const parts = [formatCueRef({ cueList: options.cueList, cue: options.cue, part: options.part })];
  if (options.upTime) parts.push(`Time ${options.upTime}`);
  if (options.upDelay) parts.push(`Delay ${options.upDelay}`);
  if (options.downTime) parts.push(`Down ${options.downTime}`);
  if (options.downDelay) parts.push(`Down Delay ${options.downDelay}`);
  if (options.focusTime) parts.push(`Focus ${options.focusTime}`);
  if (options.colorTime) parts.push(`Color ${options.colorTime}`);
  if (options.beamTime) parts.push(`Beam ${options.beamTime}`);
  if (options.follow) parts.push("Follow");
  if (options.hang) parts.push(`Hang ${options.hang}`);
  if (options.block) parts.push("Block");
  return parts.join(" ");
}

/** Go To Cue via CLI (preferred over key sequence). */
export function buildGoToCueCommand(options: {
  cue?: number | string;
  cueList?: number;
  out?: boolean;
}): string {
  if (options.out) {
    return "Go To Cue Out";
  }
  if (options.cue === undefined) {
    throw new Error("Provide cue or out=true for Go To Cue.");
  }
  const cueSeg = targetNumber(options.cue, "cue");
  if (options.cueList !== undefined) {
    return `Go To Cue ${options.cueList}/${cueSeg}`;
  }
  return `Go To Cue ${cueSeg}`;
}

export function buildParkCommand(options: { channel: number; thru?: number }): string {
  if (options.thru !== undefined) {
    return `Chan ${options.channel} Thru ${options.thru} Park`;
  }
  return `Chan ${options.channel} Park`;
}

export function buildUnparkCommand(options: { channel: number; thru?: number }): string {
  if (options.thru !== undefined) {
    return `Chan ${options.channel} Thru ${options.thru} Unpark`;
  }
  return `Chan ${options.channel} Unpark`;
}

/**
 * Patch CLI — enter Patch display first on Live desk or syntax may misread.
 * Prefer fixtureTypeNumber over names with spaces when automating.
 */
export function buildPatchCommand(options: {
  channel: number;
  thru?: number;
  fixtureType?: string;
  fixtureTypeNumber?: number;
  address?: number;
  universe?: number;
  enterPatchDisplay?: boolean;
}): string | BuiltProgrammingSteps {
  const patchLine = options.thru !== undefined
    ? `Patch ${options.channel} Thru ${options.thru}`
    : `Patch ${options.channel}`;

  const detail: string[] = [patchLine];
  if (options.fixtureTypeNumber !== undefined) {
    detail.push(`Type ${options.fixtureTypeNumber}`);
  } else if (options.fixtureType) {
    detail.push(`Type ${options.fixtureType}`);
  }
  if (options.address !== undefined) {
    detail.push(`Address ${options.address}`);
  }
  if (options.universe !== undefined) {
    detail.push(`Universe ${options.universe}`);
  }

  const line = detail.join(" ");

  if (options.enterPatchDisplay) {
    return {
      style: "two_step",
      steps: ["Patch", line],
      notes: ["Enter Patch display before patch syntax on a Live CLI."],
    };
  }

  return line;
}

/** Normalize builder output to an array of CLI steps. */
export function asProgrammingSteps(
  built: string | BuiltProgrammingSteps
): BuiltProgrammingSteps {
  if (typeof built === "string") {
    return { style: "one_shot", steps: [built] };
  }
  return built;
}
