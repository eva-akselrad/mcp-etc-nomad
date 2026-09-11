import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChannelCheckCommand,
  buildExportShowCommand,
  buildHighlightCommand,
  buildIdentifyFixtureSteps,
  buildLoadShowCommand,
  buildMergeShowCommand,
  buildSaveShowCommand,
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

describe("show-admin command builders", () => {
  it("quick save uses Save CLI", () => {
    assert.equal(buildSaveShowCommand({ mode: "quick" }), "Save");
  });

  it("save_as with path", () => {
    assert.equal(
      buildSaveShowCommand({ mode: "save_as", path: "usb1:/backup.esf3d" }),
      'Save Show "usb1:/backup.esf3d"'
    );
  });

  it("load and merge wrap quoted paths", () => {
    assert.equal(buildLoadShowCommand({ path: "ShowArchive/demo.esf3d" }), 'Open Show "ShowArchive/demo.esf3d"');
    assert.equal(buildMergeShowCommand({ path: "usb1:/other.esf3d" }), 'Merge Show "usb1:/other.esf3d"');
  });

  it("export patch matches PLAN example", () => {
    assert.equal(
      buildExportShowCommand({ target: "patch", path: "usb1:/patch.csv" }),
      'Export Patch "usb1:/patch.csv"'
    );
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
  it("show_save requires user_intent when confirm gating is on", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "show_save", {
      mode: "quick",
      confirm: true,
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /user_intent/);
    assert.equal(client.sent.length, 0);
  });

  it("show_save sends Save via /eos/newcmd with gates satisfied", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    const result = await invokeTool(server, "show_save", { mode: "quick" });
    assert.equal(isToolError(result), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/newcmd");
    assert.match(String(client.sent.at(-1)?.args[0]), /Save Enter$/);
  });

  it("show_export builds Export Patch path", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "show_export", {
      target: "patch",
      path: "usb1:/patch.csv",
    });
    assert.match(String(client.sent.at(-1)?.args[0]), /Export Patch "usb1:\/patch.csv" Enter$/);
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
  it("get_session_info queries OSC get endpoints", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    const result = await invokeTool(server, "get_session_info", { timeoutMs: 50 });
    assert.equal(isToolError(result), false);
    const addresses = client.sent.map((m) => m.address);
    assert.ok(addresses.includes("/eos/get/session"));
    assert.ok(addresses.includes("/eos/get/show/path"));
    assert.ok(addresses.includes("/eos/get/version"));
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
    await invokeTool(server, "network_session_join", {
      user_intent: "join tech desk mirror",
    });
    assert.equal(client.sent.at(-1)?.address, "/eos/key/open_mirror_dialog");
  });
});

describe("EosTcpLink packet framing", () => {
  it("uses slip mode by default for port 3037", () => {
    const config = makeTestConfig({ protocol: "tcp", tcpPort: 3037 });
    const link = new EosTcpLink(config);
    assert.equal(config.tcpMode, "slip");
    assert.ok(link);
  });

  it("defaults to length mode for port 3032", () => {
    const config = makeTestConfig({ protocol: "tcp", tcpPort: 3032 });
    assert.equal(config.tcpMode, "length");
  });
});
