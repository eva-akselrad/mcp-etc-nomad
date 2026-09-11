import type { BuiltProgrammingSteps } from "./programming.js";

export type ShowSaveMode = "quick" | "save" | "save_as";

export type ShowExportTarget =
  | "patch"
  | "csv"
  | "ascii"
  | "lightwright"
  | "logs"
  | "show";

/** Browser/key workflow steps — no invented file paths or OSC Save/Load verbs. */
export type ShowWorkflowSteps = BuiltProgrammingSteps & {
  /** Verified OSC keys only (shift/update quick-save, etc.). */
  keys?: string[];
  /** Operator must complete Browser / facepanel steps — default for unverified browser keys. */
  needsManual?: boolean;
  /** CIA navigation when needsManual (no invented usb1:/ paths). */
  browserPath?: string;
};

const DOMAIN_NOTES = [
  "No OSC Save/Load verbs — Browser + key_press + CLI only.",
  "Never invent USB/esf paths; user picks files in the Browser CIA.",
  "Pin EOS_VERSION (.esf vs .esf3d) for syntax/version checks.",
];

/**
 * Save via keys/CLI — no path parameters.
 * quick: Shift+Update (save_show key sequence).
 * save: Save CLI (may need confirm_save second Enter).
 * save_as: Browser > File > Save As (needsManual — no unverified Virtual Keyboard keys).
 */
export function buildSaveShowWorkflow(options: {
  mode?: ShowSaveMode;
  confirmSave?: boolean;
}): ShowWorkflowSteps {
  const mode = options.mode ?? "quick";

  if (mode === "quick") {
    const steps = options.confirmSave ? [""] : [];
    return {
      style: "two_step",
      keys: ["shift", "update"],
      steps,
      notes: [
        ...DOMAIN_NOTES,
        "Quick Save = Shift+Update hardkey sequence (not a path-based CLI).",
        "Always verify echoedPath from /eos/out/event/show/saved — plot/tech without Save is malpractice.",
        ...(options.confirmSave ? ["Second confirm Enter sent after save keys."] : []),
      ],
    };
  }

  if (mode === "save_as") {
    const steps = options.confirmSave ? [""] : [];
    return {
      style: "two_step",
      needsManual: true,
      browserPath: "Browser > File > Save As",
      steps,
      notes: [
        ...DOMAIN_NOTES,
        "Save As is a Browser wizard — user names file and picks location in CIA.",
        "Save As often needs a second Enter on the desk confirm dialog (confirm_save).",
        "Echo saved path from show event — never invent filenames.",
        "Unverified Virtual Keyboard keys (open_browser, save_file) are not sent unless press_unverified_browser_keys=true (Tab 7 verification).",
      ],
    };
  }

  const steps = ["Save"];
  if (options.confirmSave) {
    steps.push("");
  }

  return {
    style: steps.length > 1 ? "two_step" : "one_shot",
    steps,
    notes: [
      ...DOMAIN_NOTES,
      "Save may prompt on desk — use confirm_save for second Enter.",
      "Echo saved path from /eos/out/event/show/saved or get_show_path.",
    ],
  };
}

/** Open Browser load wizard — user selects show file manually. */
export function buildLoadShowWorkflow(options?: { confirmPath?: boolean }): ShowWorkflowSteps {
  const steps = options?.confirmPath ? [""] : [];
  return {
    style: "two_step",
    needsManual: true,
    browserPath: "Browser > File > Open",
    steps,
    notes: [
      ...DOMAIN_NOTES,
      "Load is Browser File > Open — no CLI path argument.",
      "Prefer Blind/offline. Never auto-load; requires explicit user_intent.",
      "After load completes, run sync_show_targets — cache is stale.",
      "Do not send /eos/reset as part of load.",
      "Unverified Virtual Keyboard keys (open_browser, open_file) are not sent unless press_unverified_browser_keys=true (Tab 7 verification).",
    ],
  };
}

/** Open Browser merge wizard — partial merge needs {Advanced} in CIA. */
export function buildMergeShowWorkflow(options?: { confirmPath?: boolean }): ShowWorkflowSteps {
  const steps = ["Merge"];
  if (options?.confirmPath) {
    steps.push("");
  }
  return {
    style: "two_step",
    needsManual: true,
    browserPath: "Browser > File > Merge",
    steps,
    notes: [
      ...DOMAIN_NOTES,
      "Merge is Browser File > Merge — user selects source show in CIA.",
      "Partial components need Browser {Advanced}; manual step required.",
      "Prefer Blind/offline. After merge, run sync_show_targets.",
      "Unverified Virtual Keyboard key open_browser is not sent unless press_unverified_browser_keys=true (Tab 7 verification).",
    ],
  };
}

/** Export targets that require Browser wizard (no pure CLI / no /eos/export). */
export function exportManualInstructions(target: ShowExportTarget): {
  needsManual: true;
  target: ShowExportTarget;
  browserPath: string;
  notes: string[];
} {
  const browserPaths: Record<ShowExportTarget, string> = {
    patch: "Browser > File > Export > CSV (select Patch columns)",
    csv: "Browser > File > Export > CSV",
    ascii: "Browser > File > Export > ASCII",
    lightwright: "Browser > File > Export (Lightwright-compatible)",
    logs: "Browser > File > Export > Logs",
    show: "Browser > File > Export",
  };

  return {
    needsManual: true,
    target,
    browserPath: browserPaths[target],
    notes: [
      ...DOMAIN_NOTES,
      "Export is a Browser wizard on most Eos versions — no /eos/export OSC verb.",
      "User selects destination and filename in CIA; do not invent usb1:/ paths.",
      "Unverified Virtual Keyboard keys (open_browser, export_folder) are not sent unless open_browser=true (Tab 7 verification).",
    ],
  };
}

/** Unverified browser key sequences — only when operator opts in after Tab 7 verification. */
export const UNVERIFIED_BROWSER_KEY_SEQUENCES: Record<string, string[]> = {
  save_as: ["open_browser", "save_file"],
  load: ["open_browser", "open_file"],
  merge: ["open_browser"],
  export: ["open_browser", "export_folder"],
  join: ["open_mirror_dialog"],
};

/** Enter patch display before patch attach/detach syntax on a Live CLI. */
export function buildPatchDisplayStep(): BuiltProgrammingSteps {
  return {
    style: "two_step",
    steps: ["Patch"],
    notes: ["Enter Patch display before attach/detach syntax on a Live CLI."],
  };
}

export function buildAttachDeviceCommand(options: {
  channel: number;
  thru?: number;
}): string {
  if (options.thru !== undefined) {
    return `Channel ${options.channel} Thru ${options.thru} Attach`;
  }
  return `Channel ${options.channel} Attach`;
}

export function buildDetachDeviceCommand(options: {
  channel: number;
  thru?: number;
}): string {
  if (options.thru !== undefined) {
    return `Channel ${options.channel} Thru ${options.thru} Detach`;
  }
  return `Channel ${options.channel} Detach`;
}

export function buildChannelCheckCommand(options: {
  channel: number;
  level?: number;
}): string {
  const level = options.level ?? 70;
  return `Channel ${options.channel} At ${level} Check`;
}

export function buildHighlightCommand(options: {
  channel?: number;
  thru?: number;
  group?: number;
}): string {
  if (options.group !== undefined) {
    return `Group ${options.group} Highlight`;
  }
  if (options.thru !== undefined && options.channel !== undefined) {
    return `Channel ${options.channel} Thru ${options.thru} Highlight`;
  }
  if (options.channel !== undefined) {
    return `Channel ${options.channel} Highlight`;
  }
  return "Highlight";
}

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
      "For session/console identity use get_session_info (/eos/get/processors, userlist).",
    ],
  };
}
