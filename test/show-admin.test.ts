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

  it("save_as opens Browser via keys only", () => {
    const wf = buildSaveShowWorkflow({ mode: "save_as" });
    assert.deepEqual(wf.keys, ["open_browser", "save_file"]);
    assert.deepEqual(wf.steps, []);
  });

  it("load and merge are Browser workflows — no path strings", () => {
    const load = buildLoadShowWorkflow();
    assert.deepEqual(load.keys, ["open_browser", "open_file"]);
    assert.ok(!load.steps.some((s) => s.includes("usb") || s.includes(".esf")));

    const merge = buildMergeShowWorkflow();
    assert.deepEqual(merge.keys, ["open_browser"]);
    assert.deepEqual(merge.steps, ["Merge"]);
  });

  it("load/merge support confirm_path second Enter", () => {
    assert.deepEqual(buildLoadShowWorkflow({ confirmPath: true }).steps, [""]);
    assert.deepEqual(buildMergeShowWorkflow({ confirmPath: true }).steps, ["Merge", ""]);
  });

  it("export returns manual browser instructions, not CLI paths", () => {
    const manual = exportManualInstructions("patch");
    assert.equal(manual.needsManual, true);
    assert.match(manual.browserPath, /Browser/);
    assert.deepEqual(manual.keys, ["open_browser", "export_folder"]);
    assert.ok(manual.notes.some((n) => n.includes("no /eos/export")));
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

  it("show_load opens Browser keys when allowed", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "show_load", {
      user_intent: "open archived show",
    });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ needsManual: boolean; sent: string[] }>(result);
    assert.equal(body.needsManual, true);
    const keys = client.sent.filter((m) => m.address.startsWith("/eos/key/"));
    assert.ok(keys.some((m) => m.address.includes("open_browser")));
    assert.ok(keys.some((m) => m.address.includes("open_file")));
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

  it("network_session_join opens mirror dialog key", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "network_session_join", {
      user_intent: "join tech desk mirror",
    });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ needsManual: boolean }>(result);
    assert.equal(body.needsManual, true);
    assert.equal(client.sent.at(-1)?.address, "/eos/key/open_mirror_dialog");
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
