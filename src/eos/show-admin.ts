import type { BuiltProgrammingSteps } from "./programming.js";

export type ShowSaveMode = "quick" | "save" | "save_as";

export type ShowExportTarget =
  | "patch"
  | "cue"
  | "group"
  | "show"
  | "csv"
  | "ascii"
  | "lightwright"
  | "logs";

/** Save current show — quick uses Save CLI; save_as includes optional name/path. */
export function buildSaveShowCommand(options: {
  mode?: ShowSaveMode;
  name?: string;
  path?: string;
}): string | BuiltProgrammingSteps {
  const mode = options.mode ?? "quick";

  if (mode === "quick") {
    return "Save";
  }

  if (options.path) {
    return `Save Show ${JSON.stringify(options.path)}`;
  }

  if (options.name) {
    return `Save Show ${JSON.stringify(options.name)}`;
  }

  return "Save Show";
}

/** Load/open a show file by path (version-sensitive; paths vary by platform). */
export function buildLoadShowCommand(options: { path: string }): string {
  return `Open Show ${JSON.stringify(options.path)}`;
}

/** Merge another show file into the current show. */
export function buildMergeShowCommand(options: { path: string }): string {
  return `Merge Show ${JSON.stringify(options.path)}`;
}

/**
 * Export show data to a file path.
 * Example from PLAN: Export Patch "usb1:/patch.csv" Enter
 */
export function buildExportShowCommand(options: {
  target: ShowExportTarget;
  path: string;
}): string {
  const label =
    options.target === "csv"
      ? "CSV"
      : options.target === "ascii"
        ? "ASCII"
        : options.target === "lightwright"
          ? "Lightwright"
          : options.target.charAt(0).toUpperCase() + options.target.slice(1);
  return `Export ${label} ${JSON.stringify(options.path)}`;
}

/** Enter patch display before patch attach/detach syntax on a Live CLI. */
export function buildPatchDisplayStep(): BuiltProgrammingSteps {
  return {
    style: "two_step",
    steps: ["Patch"],
    notes: ["Enter Patch display before attach/detach syntax on a Live CLI."],
  };
}

/** Attach discovered dimmer/RDM device to patched channel (patch display). */
export function buildAttachDeviceCommand(options: {
  channel: number;
  thru?: number;
}): string {
  if (options.thru !== undefined) {
    return `Channel ${options.channel} Thru ${options.thru} Attach`;
  }
  return `Channel ${options.channel} Attach`;
}

/** Detach dimmer/RDM device from patched channel. */
export function buildDetachDeviceCommand(options: {
  channel: number;
  thru?: number;
}): string {
  if (options.thru !== undefined) {
    return `Channel ${options.channel} Thru ${options.thru} Detach`;
  }
  return `Channel ${options.channel} Detach`;
}

/** Channel check: step through patched channels at a level (ChanCheck softkey). */
export function buildChannelCheckCommand(options: {
  channel: number;
  level?: number;
}): string {
  const level = options.level ?? 70;
  return `Channel ${options.channel} At ${level} Check`;
}

/** Highlight selected channels (Highlight softkey / Shift+High). */
export function buildHighlightCommand(options: {
  channel?: number;
  thru?: number;
  group?: number;
}): string {
  if (options.group !== undefined) {
    return `Group ${options.group} Highlight`;
  }
  if (options.thru !== undefined) {
    return `Channel ${options.channel} Thru ${options.thru} Highlight`;
  }
  if (options.channel !== undefined) {
    return `Channel ${options.channel} Highlight`;
  }
  return "Highlight";
}

/** Identify fixture lamps (Test Fixture / TEST_LAMP key after channel selection). */
export function buildIdentifyFixtureSteps(options: {
  channel?: number;
  thru?: number;
  group?: number;
}): BuiltProgrammingSteps {
  const select =
    options.group !== undefined
      ? `Group ${options.group}`
      : options.thru !== undefined && options.channel !== undefined
        ? `Channel ${options.channel} Thru ${options.thru}`
        : options.channel !== undefined
          ? `Channel ${options.channel}`
          : undefined;

  const steps = select ? [select, "Test Fixture"] : ["Test Fixture"];
  return {
    style: "two_step",
    steps,
    notes: [
      "Test Fixture (OSC key test_fixture) flashes lamps on selected channels.",
      "RDM identify in Device List uses Flash softkey — GUI step may be required.",
    ],
  };
}
