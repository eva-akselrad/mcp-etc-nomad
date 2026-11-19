import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHarness, invokeTool, isToolError, parseToolJson } from "./harness.js";

const newcmds = (client: { sent: Array<{ address: string; args: unknown[] }> }) =>
  client.sent.filter((m) => m.address === "/eos/newcmd").map((m) => String(m.args[0]));

describe("effect tools (syntax verified on ETCnomad 3.3.9)", () => {
  it("apply_effect sends 'Chan … Effect N Enter'", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "apply_effect", { effect: 950, ranges: [{ from: 201, thru: 204 }] });
    assert.ok(newcmds(client).includes("Chan 201 Thru 204 Effect 950 Enter"));
  });

  it("apply_effect accepts a group", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "apply_effect", { effect: 901, group: 18 });
    assert.ok(newcmds(client).includes("Group 18 Effect 901 Enter"));
  });

  it("stop_effect by number uses 'Effect N @ Enter'", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "stop_effect", { effect: 901 });
    assert.ok(newcmds(client).includes("Effect 901 @ Enter"));
  });

  it("stop_effect on channels uses 'Chan … Effect Enter'", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "stop_effect", { channels: [201, 202] });
    assert.ok(newcmds(client).includes("Chan 201 + 202 Effect Enter"));
  });

  it("create_effect presses open_effect_blind, and refuses if the Effect List still isn't focused", async () => {
    const { server, client, listener } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    listener.getState().commandLine = "BLIND: Cue  1 : ";
    const result = await invokeTool(server, "create_effect", { effect: 950, type: "linear" });
    assert.ok(client.sent.some((m) => m.address === "/eos/key/open_effect_blind"));
    assert.equal(isToolError(result), true);
    assert.equal(parseToolJson<{ needsManual: boolean }>(result).needsManual, true);
    assert.equal(newcmds(client).length, 0);
  });

  it("set_effect_timing sends 'Effect N CycleTime T Enter' when focused", async () => {
    const { server, client, listener } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    listener.getState().commandLine = "BLIND: Effect  950 : ";
    await invokeTool(server, "set_effect_timing", { effect: 950, cycleTime: 5 });
    assert.ok(newcmds(client).includes("Effect 950 CycleTime 5 Enter"));
  });

  it("apply_effect refuses LIVE without allow_live", async () => {
    const { server } = createHarness({ consoleMode: "live" });
    const result = await invokeTool(server, "apply_effect", { effect: 1, channel: 1, confirm: true });
    assert.equal(isToolError(result), true);
  });
});
