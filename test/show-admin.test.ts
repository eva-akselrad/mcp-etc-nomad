import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChannelCheckCommand,
  buildHighlightCommand,
  buildIdentifyFixtureSteps,
  buildLoadShowWorkflow,
  buildMergeShowWorkflow,
  buildSaveShowWorkflow,
  exportManualInstructions,
} from "../src/eos/show-admin.js";
import { asProgrammingSteps } from "../src/eos/programming.js";
import { EosTcpLink } from "../src/eos/tcp-link.js";
import {
  createHarness,
  invokeTool,
  isToolError,
  makeTestConfig,
  parseToolJson,
} from "./harness.js";

describe("show-admin workflow builders (Eos OSC domain)", () => {
  it("quick save uses shift+update keys, not path CLI", () => {
    const wf = buildSaveShowWorkflow({ mode: "quick" });
    assert.deepEqual(wf.keys, ["shift", "update"]);
    assert.deepEqual(wf.steps, []);
  });

  it("save mode uses Save CLI with optional confirm Enter", () => {
    const wf = buildSaveShowWorkflow({ mode: "save", confirmSave: true });
    assert.deepEqual(wf.steps, ["Save", ""]);
  });

  it("quick save sends confirm Enter when confirmSave is set", () => {
    const wf = buildSaveShowWorkflow({ mode: "quick", confirmSave: true });
    assert.deepEqual(wf.steps, [""]);
  });

  it("save_as returns needsManual Browser path — no unverified keys", () => {
    const wf = buildSaveShowWorkflow({ mode: "save_as" });
    assert.equal(wf.needsManual, true);
    assert.match(wf.browserPath ?? "", /Save As/);
    assert.equal(wf.keys, undefined);
    assert.deepEqual(wf.steps, []);
  });

  it("load and merge are Browser workflows — no path strings or invented keys", () => {
    const load = buildLoadShowWorkflow();
    assert.equal(load.needsManual, true);
    assert.match(load.browserPath ?? "", /Open/);
    assert.equal(load.keys, undefined);
    assert.ok(!load.steps.some((s) => s.includes("usb") || s.includes(".esf")));

    const merge = buildMergeShowWorkflow();
    assert.equal(merge.needsManual, true);
    assert.match(merge.browserPath ?? "", /Merge/);
    assert.equal(merge.keys, undefined);
    assert.deepEqual(merge.steps, ["Merge"]);
  });

  it("load/merge support confirm_path second Enter", () => {
    assert.deepEqual(buildLoadShowWorkflow({ confirmPath: true }).steps, [""]);
    assert.deepEqual(buildMergeShowWorkflow({ confirmPath: true }).steps, ["Merge", ""]);
  });

  it("export returns manual browser instructions, not CLI paths or invented keys", () => {
    const manual = exportManualInstructions("patch");
    assert.equal(manual.needsManual, true);
    assert.match(manual.browserPath, /Browser/);
    assert.ok(manual.notes.some((n) => n.includes("no /eos/export")));
    assert.ok(manual.notes.some((n) => n.includes("Tab 7")));
  });

  it("identify uses Test Fixture two-step", () => {
    const built = buildIdentifyFixtureSteps({ channel: 5 });
    assert.deepEqual(asProgrammingSteps(built).steps, ["Channel 5", "Test Fixture"]);
  });

  it("channel check and highlight", () => {
    assert.equal(buildChannelCheckCommand({ channel: 1, level: 70 }), "Channel 1 At 70 Check");
    assert.equal(buildHighlightCommand({ group: 3 }), "Group 3 Highlight");
  });
});

describe("show_admin tools (TX via recording client)", () => {
  it("show_save requires user_intent and confirm_save when gating is on", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "show_save", {
      mode: "quick",
      confirm: true,
      user_intent: "backup before load",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /confirm_save/);
    assert.equal(client.sent.length, 0);
  });

  it("show_save sends shift+update keys when gates satisfied", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "show_save", { mode: "quick" });
    assert.equal(isToolError(result), false);
    const keys = client.sent.filter((m) => m.address.startsWith("/eos/key/"));
    assert.ok(keys.some((m) => m.address.includes("shift")));
    assert.ok(keys.some((m) => m.address.includes("update")));
  });

  it("show_save with confirm_save sends Enter after quick save keys", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "show_save", { mode: "quick", confirm_save: true });
    const cmds = client.sent.filter((m) => m.address === "/eos/newcmd").map((m) => String(m.args[0]));
    assert.ok(cmds.some((c) => c.includes("Enter (confirm)") || /Enter$/.test(c)));
  });

  it("show_save echoes saved path from show event", async () => {
    const { server } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
      oscReplies: [
        {
          pattern: /^\/eos\/out\/event\/show\//,
          address: "/eos/out/event/show/saved",
          args: ["ShowFiles/rehearsal.esf3d"],
        },
      ],
    });
    const result = await invokeTool(server, "show_save", { mode: "quick", wait_for_event_ms: 100 });
    const body = parseToolJson<{
      action: string;
      savedPath: string;
      pathEchoed: boolean;
    }>(result);
    assert.equal(body.action, "show_save");
    assert.equal(body.savedPath, "ShowFiles/rehearsal.esf3d");
    assert.equal(body.pathEchoed, true);
  });

  it("show_load requires user_intent", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "show_load", { confirm: true });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /user_intent/);
    assert.equal(client.sent.length, 0);
  });

  it("show_load requires user_intent and refuses LIVE without allow_live", async () => {
    const { server, client } = createHarness({ consoleMode: "live" });
    const blocked = await invokeTool(server, "show_load", {
      confirm: true,
      user_intent: "load rehearsal show",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /Blind|allow_live/);
    assert.equal(client.sent.length, 0);
  });

  it("show_load requires confirm_path when gating is on", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "show_load", {
      confirm: true,
      user_intent: "load archived show",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /confirm_path/);
    assert.equal(client.sent.length, 0);
  });

  it("show_load returns needsManual without unverified key TX by default", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "show_load", {
      user_intent: "open archived show",
    });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ needsManual: boolean; browserPath: string; sent: string[] }>(
      result
    );
    assert.equal(body.needsManual, true);
    assert.match(body.browserPath, /Open/);
    const keys = client.sent.filter((m) => m.address.startsWith("/eos/key/"));
    assert.equal(keys.length, 0);
  });

  it("show_load sends unverified keys only when press_unverified_browser_keys=true", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "show_load", {
      user_intent: "open archived show",
      press_unverified_browser_keys: true,
    });
    const keys = client.sent.filter((m) => m.address.startsWith("/eos/key/"));
    assert.ok(keys.some((m) => m.address.includes("open_browser")));
    assert.ok(keys.some((m) => m.address.includes("open_file")));
  });

  it("show_merge requires user_intent", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "show_merge", { confirm: true });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /user_intent/);
    assert.equal(client.sent.length, 0);
  });

  it("show_merge rejects user_intent shorter than 8 characters", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "show_merge", {
      confirm: true,
      user_intent: "merge",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /min 8 characters/);
    assert.equal(client.sent.length, 0);
  });

  it("show_merge refuses LIVE without allow_live", async () => {
    const { server, client } = createHarness({ consoleMode: "live" });
    const blocked = await invokeTool(server, "show_merge", {
      confirm: true,
      user_intent: "merge archived show into current",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /Blind|allow_live/);
    assert.equal(client.sent.length, 0);
  });

  it("show_merge refuses unknown without allow_live", async () => {
    const { server, client } = createHarness({ consoleMode: "unknown" });
    const blocked = await invokeTool(server, "show_merge", {
      confirm: true,
      user_intent: "merge archived show into current",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /Blind|allow_live/);
    assert.equal(client.sent.length, 0);
  });

  it("show_merge requires confirm_path when gating is on", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "show_merge", {
      confirm: true,
      user_intent: "merge archived show into current",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /confirm_path/);
    assert.equal(client.sent.length, 0);
  });

  it("show_merge returns needsManual and sends Merge CLI when allowed", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "show_merge", {
      user_intent: "merge archived show into current",
    });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ needsManual: boolean; browserPath: string; sent: string[] }>(
      result
    );
    assert.equal(body.needsManual, true);
    assert.match(body.browserPath, /Merge/);
    const cmds = client.sent.filter((m) => m.address === "/eos/newcmd").map((m) => String(m.args[0]));
    assert.ok(cmds.some((c) => /Merge Enter/.test(c)));
    const keys = client.sent.filter((m) => m.address.startsWith("/eos/key/"));
    assert.equal(keys.length, 0);
  });

  it("show_merge sends confirm Enter when confirm_path is set", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "show_merge", {
      user_intent: "merge archived show into current",
      confirm_path: true,
    });
    const cmds = client.sent.filter((m) => m.address === "/eos/newcmd").map((m) => String(m.args[0]));
    assert.ok(cmds.some((c) => /Merge Enter/.test(c)));
    assert.ok(cmds.some((c) => /Enter$/.test(c) && !/Merge/.test(c)));
  });

  it("show_merge sends unverified keys only when press_unverified_browser_keys=true", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "show_merge", {
      user_intent: "merge archived show into current",
      press_unverified_browser_keys: true,
    });
    const keys = client.sent.filter((m) => m.address.startsWith("/eos/key/"));
    assert.ok(keys.some((m) => m.address.includes("open_browser")));
  });

  it("show_export returns needsManual without invented paths", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "show_export", { target: "patch" });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ needsManual: boolean; browserPath: string }>(result);
    assert.equal(body.needsManual, true);
    assert.match(body.browserPath, /Browser/);
    assert.equal(client.sent.length, 0);
  });

  it("identify_fixture sends channel select + Test Fixture", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "identify_fixture", { channel: 10 });
    const cmds = client.sent.filter((m) => m.address === "/eos/newcmd").map((m) => String(m.args[0]));
    assert.ok(cmds.some((c) => /Channel 10 Enter/.test(c)));
    assert.ok(cmds.some((c) => /Test Fixture Enter/.test(c)));
  });
});

describe("network session tools", () => {
  it("get_session_info queries processors, userlist, show/path, version, session", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    const result = await invokeTool(server, "get_session_info", { timeoutMs: 50 });
    assert.equal(isToolError(result), false);
    const addresses = client.sent.map((m) => m.address);
    assert.ok(addresses.includes("/eos/get/processors"));
    assert.ok(addresses.includes("/eos/get/userlist"));
    assert.ok(addresses.includes("/eos/get/show/path"));
    assert.ok(addresses.includes("/eos/get/version"));
    assert.ok(addresses.includes("/eos/get/session"));
    const body = parseToolJson<{ warnings: string[]; tcpOscVersion?: string }>(result);
    assert.ok(body.warnings.some((w) => /Host/.test(w)));
  });

  it("osc_set_user updates routing and sends /eos/user for positive ids", async () => {
    const { server, client, ctx } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false, userId: -1 },
    });
    const result = await invokeTool(server, "osc_set_user", { user_id: 5 });
    assert.equal(isToolError(result), false);
    assert.equal(ctx.config.userId, 5);
    assert.equal(client.sent.at(-1)?.address, "/eos/user");
    assert.equal(client.sent.at(-1)?.args[0], 5);
  });

  it("network_session_join requires user_intent", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "network_session_join", { confirm: true });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /user_intent/);
    assert.equal(client.sent.length, 0);
  });

  it("network_session_join returns needsManual without unverified key TX by default", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "network_session_join", {
      user_intent: "join tech desk mirror",
    });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ needsManual: boolean; browserPath: string }>(result);
    assert.equal(body.needsManual, true);
    assert.match(body.browserPath, /mirror|Welcome/i);
    assert.equal(client.sent.length, 0);
  });

  it("network_session_join sends mirror key only when open_mirror_dialog=true", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "network_session_join", {
      user_intent: "join tech desk mirror",
      open_mirror_dialog: true,
    });
    assert.equal(client.sent.at(-1)?.address, "/eos/key/open_mirror_dialog");
  });

  it("network_session_leave requires user_intent when gating is on", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "network_session_leave", { confirm: true });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /user_intent/);
    assert.equal(client.sent.length, 0);
  });

  it("network_session_leave rejects short user_intent when gating is on", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "network_session_leave", {
      confirm: true,
      user_intent: "leave",
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /min 8 characters/);
    assert.equal(client.sent.length, 0);
  });

  it("network_session_leave returns needsManual without unverified key TX", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "network_session_leave", {
      user_intent: "exit mirror mode on tech desk",
    });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{
      needsManual: boolean;
      browserPath: string;
      sent: string[];
      notes: string[];
    }>(result);
    assert.equal(body.needsManual, true);
    assert.match(body.browserPath, /Stop Mirroring|ALT\+F2/i);
    assert.deepEqual(body.sent, []);
    assert.equal(client.sent.length, 0);
    assert.ok(body.notes.some((n) => /no documented OSC key/i.test(n)));
  });
});

describe("EosTcpLink packet framing", () => {
  it("uses slip / OSC 1.1 for port 3037", () => {
    const config = makeTestConfig({ protocol: "tcp", tcpPort: 3037 });
    const link = new EosTcpLink(config);
    assert.equal(config.tcpMode, "slip");
    assert.equal(config.tcpOscVersion, "1.1");
    assert.ok(link);
  });

  it("uses length / OSC 1.0 for port 3032", () => {
    const config = makeTestConfig({ protocol: "tcp", tcpPort: 3032 });
    assert.equal(config.tcpMode, "length");
    assert.equal(config.tcpOscVersion, "1.0");
  });
});
