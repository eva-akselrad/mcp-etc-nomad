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

export interface CueTargetRef {
  cueList?: number;
  cue: number | string;
  part?: number;
}

function formatCueRef(ref: CueTargetRef): string {
  const cue = targetNumber(ref.cue, "cue");
  if (ref.cueList !== undefined && ref.part !== undefined) {
    return `Cue ${ref.cueList}/${cue}/${ref.part}`;
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
  thru?: number | string
): string {
  const start = formatTarget(type, from);
  if (thru === undefined) {
    return start;
  }
  return `${start} Thru ${formatTarget(type, thru)}`;
}

/** Build "Cue {list}/{n} Record" (or Group N Record, etc.). */
export function buildRecordCommand(options: {
  target: ProgrammingTarget;
  number?: number | string;
  cueList?: number;
  part?: number;
  label?: string;
  block?: boolean;
  merge?: boolean;
  time?: string;
}): string {
  const parts: string[] = [];

  if (options.target === "cue") {
    if (options.number === undefined) {
      parts.push("Record");
    } else {
      parts.push(
        formatCueRef({
          cueList: options.cueList,
          cue: options.number,
          part: options.part,
        })
      );
      parts.push("Record");
    }
  } else if (options.number === undefined) {
    parts.push("Record");
  } else {
    parts.push(formatTarget(options.target, options.number));
    parts.push("Record");
  }

  if (options.block) {
    parts.push("Block");
  }
  if (options.merge) {
    parts.push("Merge");
  }
  if (options.time) {
    parts.push(options.time);
  }
  if (options.label) {
    parts.push(`Label ${JSON.stringify(options.label)}`);
  }

  return parts.join(" ");
}

/** Build "Cue {list}/{n} Update" for updating an existing target. */
export function buildUpdateCommand(options: {
  target: ProgrammingTarget;
  number?: number | string;
  cueList?: number;
  part?: number;
  block?: boolean;
  merge?: boolean;
  time?: string;
}): string {
  const parts: string[] = [];

  if (options.target === "cue") {
    if (options.number === undefined) {
      parts.push("Update");
    } else {
      parts.push(
        formatCueRef({
          cueList: options.cueList,
          cue: options.number,
          part: options.part,
        })
      );
      parts.push("Update");
    }
  } else if (options.number === undefined) {
    parts.push("Update");
  } else {
    parts.push(formatTarget(options.target, options.number));
    parts.push("Update");
  }

  if (options.block) {
    parts.push("Block");
  }
  if (options.merge) {
    parts.push("Merge");
  }
  if (options.time) {
    parts.push(options.time);
  }

  return parts.join(" ");
}

/** Build "Copy Cue 1 Thru 5 Cue 10" (or cross-target copy). */
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
    const from = formatCueRef({
      cueList: options.sourceCueList,
      cue: options.sourceFrom,
    });
    if (options.sourceThru !== undefined) {
      const thru = formatCueRef({
        cueList: options.sourceCueList,
        cue: options.sourceThru,
      });
      parts.push(`${from} Thru ${thru}`);
    } else {
      parts.push(from);
    }
  } else {
    parts.push(formatRange(options.sourceType, options.sourceFrom, options.sourceThru));
  }

  if (options.destType === "cue") {
    parts.push(
      formatCueRef({
        cueList: options.destCueList,
        cue: options.dest,
      })
    );
  } else {
    parts.push(formatTarget(options.destType, options.dest));
  }

  if (options.time) {
    parts.push(options.time);
  }

  return parts.join(" ");
}

/** Build "Move Cue 5 Cue 10" or "Move Effect 1 At Effect 2". */
export function buildMoveCommand(options: {
  sourceType: ProgrammingTarget;
  source: number | string;
  sourceCueList?: number;
  destType: ProgrammingTarget;
  dest: number | string;
  destCueList?: number;
  time?: string;
}): string {
  const parts = ["Move"];

  if (options.sourceType === "cue") {
    parts.push(
      formatCueRef({
        cueList: options.sourceCueList,
        cue: options.source,
      })
    );
  } else {
    parts.push(formatTarget(options.sourceType, options.source));
  }

  parts.push("At");

  if (options.destType === "cue") {
    parts.push(
      formatCueRef({
        cueList: options.destCueList,
        cue: options.dest,
      })
    );
  } else {
    parts.push(formatTarget(options.destType, options.dest));
  }

  if (options.time) {
    parts.push(options.time);
  }

  return parts.join(" ");
}

/** Build "Delete Cue 5" or "Cue 5 Delete". Uses explicit Delete prefix for clarity. */
export function buildDeleteCommand(options: {
  target: ProgrammingTarget;
  from: number | string;
  thru?: number | string;
  cueList?: number;
  part?: number;
}): string {
  const parts = ["Delete"];

  if (options.target === "cue") {
    const from = formatCueRef({
      cueList: options.cueList,
      cue: options.from,
      part: options.part,
    });
    if (options.thru !== undefined) {
      const thru = formatCueRef({
        cueList: options.cueList,
        cue: options.thru,
      });
      parts.push(`${from} Thru ${thru}`);
    } else {
      parts.push(from);
    }
  } else {
    parts.push(formatRange(options.target, options.from, options.thru));
  }

  return parts.join(" ");
}

/** Build "Label Group 1 \"Warm Wash\"" or "Label Cue 1/5 \"Intro\"". */
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

/** Build "Channel 1 Thru 10 Group 1" — record current selection into a group. */
export function buildGroupFromChannelsCommand(options: {
  channelFrom: number;
  channelThru?: number;
  group: number;
  label?: string;
}): string {
  const range =
    options.channelThru !== undefined
      ? `Channel ${options.channelFrom} Thru ${options.channelThru}`
      : `Channel ${options.channelFrom}`;
  const parts = [range, `Group ${options.group}`];
  if (options.label) {
    parts.push(`Label Group ${options.group} ${JSON.stringify(options.label)}`);
  }
  return parts.join(" ");
}

/** Build "Patch 101" or "Patch 1 Thru 10". */
export function buildPatchCommand(options: {
  channel: number;
  thru?: number;
  fixtureType?: string;
  address?: number;
  universe?: number;
}): string {
  const parts: string[] = [];
  if (options.thru !== undefined) {
    parts.push(`Patch ${options.channel} Thru ${options.thru}`);
  } else {
    parts.push(`Patch ${options.channel}`);
  }
  if (options.fixtureType) {
    parts.push(`Type ${options.fixtureType}`);
  }
  if (options.address !== undefined) {
    parts.push(`Address ${options.address}`);
  }
  if (options.universe !== undefined) {
    parts.push(`Universe ${options.universe}`);
  }
  return parts.join(" ");
}
