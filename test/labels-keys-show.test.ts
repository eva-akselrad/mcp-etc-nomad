import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EosListener } from "../src/eos/listener.js";
import { isKnownOscKey } from "../src/eos/keys.js";
import { createHarness, invokeTool, isToolError, makeTestConfig, parseToolJson } from "./harness.js";
import { replayOscMessages } from "./replay-osc.js";

describe("direct OSC labels, key-name check, show title", () => {
  it("label_target uses /eos/set for patch channels, macros and effects", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "label_target", { target: "patch", number: 21, label: "DS Wash 1" });
    await invokeTool(server, "label_target", { target: "effect", number: 950, label: "Test" });
    const paths = client.sent.map((m) => m.address);
    assert.ok(paths.includes("/eos/set/patch/21/label"));
    assert.ok(paths.includes("/eos/set/fx/950/label"));
  });

  it("patch_set_info sends label, notes and gel", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "patch_set_info", { channel: 5, label: "Apron 5", notes: "check focus", gel: "R02" });
    const sent = client.sent.map((m) => `${m.address}=${m.args[0]}`);
    assert.ok(sent.includes("/eos/set/patch/5/label=Apron 5"));
    assert.ok(sent.includes("/eos/set/patch/5/notes=check focus"));
    assert.ok(sent.includes("/eos/set/patch/5/gel=R02"));
  });

  it("key_press rejects names not in the Eos key table, with suggestions", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    const result = await invokeTool(server, "key_press", { key: "cycle_time" });
    assert.equal(isToolError(result), true);
    assert.ok(parseToolJson<{ suggestions: string[] }>(result).suggestions.includes("cycletime"));
    assert.equal(client.sent.length, 0);
    assert.equal(isKnownOscKey("open_effect_blind"), true);
    assert.equal(isKnownOscKey("go_0"), true);
  });

  it("listener tracks show title and clears it on a cleared show", () => {
    const listener = new EosListener(makeTestConfig());
    replayOscMessages(listener, [{ address: "/eos/out/show/name", args: ["Ballet"] }]);
    assert.equal(listener.getState().showName, "Ballet");
    replayOscMessages(listener, [{ address: "/eos/out/event/show/cleared", args: [] }]);
    assert.equal(listener.getState().showName, undefined);
  });
});

describe("patch_channel fixture type by copy", () => {
  it("copies the type from another channel, then sets the address", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "patch_channel", { channel: 997, copyTypeFrom: 201, universe: 10, address: 1, refresh_cache: false });
    const cmds = client.sent.filter((m) => m.address === "/eos/newcmd").map((m) => String(m.args[0]));
    const copy = cmds.indexOf("201 Copy_To 997 Enter");
    const addr = cmds.indexOf("997 Address 10 / 1 Enter");
    assert.ok(copy >= 0 && addr > copy, cmds.join(" | "));
  });

  it("refuses a fixture type name (no command-line form in Eos)", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    const result = await invokeTool(server, "patch_channel", { channel: 997, fixtureType: "Source Four" });
    assert.equal(isToolError(result), true);
    assert.equal(client.sent.length, 0);
  });
});
