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
    const base = ref.cueList !== undefined ? `Cue ${ref.cueList} / ${cue}` : `Cue ${cue}`;
    return `${base} Part ${ref.part}`;
  }
  if (ref.cueList !== undefined) {
    return `Cue ${ref.cueList} / ${cue}`;
  }
  return `Cue ${cue}`;
}

const TARGET_KEYWORDS: Partial<Record<ProgrammingTarget, string>> = {
  ip: "Intensity_Palette",
  fp: "Focus_Palette",
  cp: "Color_Palette",
  bp: "Beam_Palette",
  ms: "Magic_Sheet",
};

function formatTarget(type: ProgrammingTarget, number?: number | string): string {
  const label = TARGET_KEYWORDS[type] ?? capitalize(type);
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
  cueList?: number,
  thruCueList?: number
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
      ? thruCueList !== undefined && thruCueList !== cueList
        ? formatCueRef({ cueList: thruCueList, cue: thru })
        : targetNumber(thru, "cue")
      : targetNumber(thru, type);
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
    parts.push(verb, formatTarget(options.target, options.number));
  }

  if (options.block) parts.push("Block");
  if (options.merge) parts.push("Merge");
  if (options.time) parts.push(options.time);
  if (options.target === "cue") {
    // cue labels are applied separately via /eos/set/cue/{list}/{cue}/label
  } else if (options.label && options.number !== undefined) {
    parts.push(`Label ${options.label.trim()}`);
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

  // Eos: "Update [Cue_Only/Track] Cue 9 / 2 Enter". Verb first; the Cue Only/Track softkey
  // goes straight after Update and toggles the console default (Track on a stock desk).
  // "Cue 9 / 2 Update ..." and a trailing "Cue Only" are syntax errors.
  const parts: string[] = ["Update"];
  if (options.scope === "cue_only") parts.push("Cue_Only/Track");

  if (options.target === "cue") {
    if (options.number !== undefined) {
      parts.push(formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part }));
    }
  } else if (options.number !== undefined) {
    parts.push(formatTarget(options.target, options.number));
  }

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
  // Eos: "Cue 1 Thru 5 Copy_To Cue 10" (Copy To is one key; "Copy" alone is a syntax error).
  const parts: string[] = [];

  if (options.sourceType === "cue") {
    parts.push(formatRange("cue", options.sourceFrom, options.sourceThru, options.sourceCueList));
  } else {
    parts.push(formatRange(options.sourceType, options.sourceFrom, options.sourceThru));
  }

  parts.push("Copy_To");
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
  // Eos: Copy To pressed twice = Move To ("Move ... At" is a syntax error).
  const parts = [
    formatCueRef({ cueList: options.sourceCueList, cue: options.source }),
    "Copy_To Copy_To",
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
  return `Effect ${targetNumber(options.source, "effect")} Copy_To Copy_To Effect ${targetNumber(options.dest, "effect")}`;
}

/** Patch copy (not channel live Copy To): "111 Copy To 116". Scope via {Plus Show}/{Only Show} softkeys on desk. */
export function buildPatchCopyCommand(options: {
  sourceChannel: number;
  destChannel: number;
}): string {
  return `${options.sourceChannel} Copy_To ${options.destChannel}`;
}

/**
 * Patch MOVE = double Copy To: "116 Copy To Copy To 120".
 * Single Copy To is copy, not move.
 */
export function buildPatchMoveCommand(options: {
  sourceChannel: number;
  destChannel: number;
}): string {
  return `${options.sourceChannel} Copy_To Copy_To ${options.destChannel}`;
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
    if (options.thru === undefined && options.part !== undefined) {
      parts.push(
        formatCueRef({
          cueList: options.cueList,
          cue: options.from,
          part: options.part,
        })
      );
    } else {
      parts.push(formatRange("cue", options.from, options.thru, options.cueList));
    }
  } else {
    parts.push(formatRange(options.target, options.from, options.thru));
  }

  // Eos asks "Please Confirm" for Delete; the tool already requires confirm_delete,
  // so send the confirming second Enter too.
  parts.push("Enter Enter");
  return parts.join(" ");
}

/** Unpatch removes patch assignment — not the same as Delete channel data. */
export function buildUnpatchCommand(options: {
  channel: number;
  thru?: number;
}): string {
  if (options.thru !== undefined) {
    return `${options.channel} Thru ${options.thru} Address 0 Enter Enter`;
  }
  return `${options.channel} Address 0 Enter Enter`;
}

export function buildLabelCommand(options: {
  target: ProgrammingTarget;
  number: number | string;
  label: string;
  cueList?: number;
  part?: number;
}): string {
  // Eos: "Effect 950 Label MCP Test Linear" — target first, then Label, then the bare text.
  // Quotes are kept literally in the label, so none are added.
  const text = options.label.replace(/[\r\n]+/g, " ").trim();
  const target =
    options.target === "cue"
      ? formatCueRef({ cueList: options.cueList, cue: options.number, part: options.part })
      : formatTarget(options.target, options.number);
  return `${target} Label ${text}`;
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
  const items: string[] = [];
  if (options.useCurrentSelection) {
    // Current programmer selection — no channel prefix.
  } else if (options.channelFrom !== undefined) {
    items.push(
      options.channelThru !== undefined
        ? `${options.channelFrom} Thru ${options.channelThru}`
        : `${options.channelFrom}`
    );
  } else {
    for (const range of options.ranges ?? []) {
      items.push(`${range.from} Thru ${range.thru}`);
    }
    for (const ch of options.channels ?? []) {
      items.push(`${ch}`);
    }
    if (items.length === 0) {
      throw new Error(
        "Provide channelFrom/thru, channels/ranges, or useCurrentSelection for record_group."
      );
    }
  }

  const verb = recordVerb(options.mode ?? "record");
  const parts: string[] = [];
  if (items.length) parts.push(`Chan ${items.join(" + ")}`);
  // "Chan 1 Thru 5 Record Group 9" — Group before Record is read as a selection.
  // Labels are applied separately via /eos/set/group/{n}/label.
  parts.push(verb, `Group ${options.group}`);
  return parts.join(" ");
}

/** Make Manual — required after Go before Update commits manual values. */
export function buildMakeManualCommand(): string {
  return "Make Manual";
}

/** Set cue timing fields via CLI (Time, Delay, Follow/Hang, down, IPCB). */
export function buildSetCueTimingCommand(options: {
  cue: number | string;
  cueList?: number;
  part?: number;
  time?: number | string;
  delay?: number | string;
  down?: number | string;
  downDelay?: number | string;
  focus?: number | string;
  color?: number | string;
  beam?: number | string;
  follow?: number | string;
  hang?: number | string;
  block?: boolean;
  /** @deprecated Use time */
  upTime?: number | string;
  /** @deprecated Use delay */
  upDelay?: number | string;
  /** @deprecated Use down */
  downTime?: number | string;
  /** @deprecated Use focus */
  focusTime?: number | string;
  /** @deprecated Use color */
  colorTime?: number | string;
  /** @deprecated Use beam */
  beamTime?: number | string;
}): string {
  const fmt = (value: number | string) => String(value);
  const time = options.time ?? options.upTime;
  const delay = options.delay ?? options.upDelay;
  const down = options.down ?? options.downTime;
  const focus = options.focus ?? options.focusTime;
  const color = options.color ?? options.colorTime;
  const beam = options.beam ?? options.beamTime;
  const parts = [formatCueRef({ cueList: options.cueList, cue: options.cue, part: options.part })];
  if (time !== undefined) parts.push(`Time ${fmt(time)}`);
  if (delay !== undefined) parts.push(`Delay ${fmt(delay)}`);
  if (down !== undefined) parts.push(`Down ${fmt(down)}`);
  if (options.downDelay !== undefined) parts.push(`Down Delay ${fmt(options.downDelay)}`);
  if (focus !== undefined) parts.push(`Focus ${fmt(focus)}`);
  if (color !== undefined) parts.push(`Color ${fmt(color)}`);
  if (beam !== undefined) parts.push(`Beam ${fmt(beam)}`);
  if (options.follow !== undefined) {
    parts.push(`Follow ${fmt(options.follow)}`);
  }
  if (options.hang !== undefined) parts.push(`Hang ${fmt(options.hang)}`);
  if (options.block) parts.push("Block");
  return parts.join(" ");
}

/** Go To Cue via CLI (preferred over key sequence). */
export function buildGoToCueCommand(options: {
  cue?: number | string;
  cueList?: number;
  out?: boolean;
  cueZero?: boolean;
}): string {
  if (options.out) {
    return "Go_To_Cue Out";
  }
  if (options.cueZero) {
    return "Go_To_Cue 0";
  }
  if (options.cue === undefined) {
    throw new Error("Provide cue, out=true, or cueZero=true for Go To Cue.");
  }
  const cueSeg = targetNumber(options.cue, "cue");
  if (options.cueList !== undefined) {
    return `Go_To_Cue ${options.cueList} / ${cueSeg}`;
  }
  return `Go_To_Cue ${cueSeg}`;
}

export function buildParkCommand(options: {
  channel: number;
  thru?: number;
  level?: number;
}): string {
  const sel =
    options.thru !== undefined && options.thru !== options.channel
      ? `Chan ${options.channel} Thru ${options.thru}`
      : `Chan ${options.channel}`;
  // Eos: "Chan 5 @ 50 Park" — a level after Park is dropped.
  return options.level !== undefined ? `${sel} @ ${options.level} Park` : `${sel} Park`;
}

export function buildUnparkCommand(options: { channel: number; thru?: number }): string {
  // Eos has no Unpark word; Park on an already-parked channel toggles it off.
  const sel =
    options.thru !== undefined && options.thru !== options.channel
      ? `Chan ${options.channel} Thru ${options.thru}`
      : `Chan ${options.channel}`;
  // Eos replies "Unpark, Please Confirm" — include the confirming Enter.
  return `${sel} Park Enter Enter`;
}

/** Build park/unpark CLI from shared selection — single channel or one Thru range only. */
export function buildChannelParkCli(
  verb: "Park" | "Unpark",
  input: {
    channel?: number;
    channels?: number[];
    ranges?: Array<{ from: number; thru: number }>;
    from?: number;
    thru?: number;
    level?: number;
  }
): string {
  const ranges = [...(input.ranges ?? [])];
  if (input.from !== undefined) {
    ranges.push({ from: input.from, thru: input.thru ?? input.from });
  }
  if (ranges.length === 1) {
    const range = ranges[0];
    const builder = verb === "Park" ? buildParkCommand : buildUnparkCommand;
    return builder({
      channel: range.from,
      thru: range.thru !== range.from ? range.thru : undefined,
      level: verb === "Park" ? input.level : undefined,
    });
  }
  if (input.channel !== undefined) {
    const builder = verb === "Park" ? buildParkCommand : buildUnparkCommand;
    return builder({ channel: input.channel, thru: input.thru, level: input.level });
  }
  if (input.channels?.length === 1) {
    const builder = verb === "Park" ? buildParkCommand : buildUnparkCommand;
    return builder({ channel: input.channels[0], level: input.level });
  }
  throw new Error(
    `CLI ${verb} needs a single channel or one Thru range; use method=key for multi-channel selection.`
  );
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
    ? `${options.channel} Thru ${options.thru}`
    : `${options.channel}`;

  const detail: string[] = [patchLine];
  if (options.fixtureTypeNumber !== undefined) {
    detail.push(`Type ${options.fixtureTypeNumber}`);
  } else if (options.fixtureType) {
    detail.push(`Type ${options.fixtureType}`);
  }
  // Eos has no Universe keyword: address is "U / A" (spaces required over /eos/newcmd).
  if (options.address !== undefined) {
    detail.push(
      options.universe !== undefined
        ? `Address ${options.universe} / ${options.address}`
        : `Address ${options.address}`
    );
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
