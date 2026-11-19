import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EosListener } from "../src/eos/listener.js";
import { createHarness, invokeTool, isToolError, makeTestConfig, parseToolJson } from "./harness.js";
import { replayOscMessages } from "./replay-osc.js";

describe("console feedback: parameter readback, cue events, ping", () => {
  it("listener stores /eos/out/active/wheel parameters", () => {
    const listener = new EosListener(makeTestConfig());
    replayOscMessages(listener, [
      { address: "/eos/out/active/wheel/1", args: ["Intensity  [100]", 1, 100] },
      { address: "/eos/out/active/wheel/2", args: ["Pan  [ 25.00]", 2, 25] },
      { address: "/eos/out/active/wheel/3", args: ["", 0, 0] },
    ]);
    const wheels = listener.getState().activeWheels;
    assert.equal(wheels["1"]?.name, "Intensity");
    assert.equal(wheels["1"]?.value, 100);
    assert.equal(wheels["2"]?.name, "Pan");
    assert.equal(wheels["2"]?.category, 2);
    assert.equal(wheels["3"], undefined);
  });

  it("listener records cue fire events", () => {
    const listener = new EosListener(makeTestConfig());
    replayOscMessages(listener, [{ address: "/eos/out/event/cue/2/1/fire", args: [] }]);
    assert.deepEqual(
      { list: listener.getState().lastCueEvent?.cueList, cue: listener.getState().lastCueEvent?.cue },
      { list: 2, cue: "1" }
    );
  });

  it("go_to_cue reports the fired cue", async () => {
    const { server } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
      oscReplies: [
        { pattern: /^\/eos\/out\/event\/cue\/\d+\/[\d.]+\/fire$/, address: "/eos/out/event/cue/9/1/fire", args: [] },
      ],
    });
    const result = await invokeTool(server, "go_to_cue", { cueList: 9, cue: 1 });
    const body = parseToolJson<{ fired: { cueList: number; cue: string } | null }>(result);
    assert.deepEqual(body.fired, { cueList: 9, cue: "1" });
  });

  it("eos_ping succeeds on a reply and fails without one", async () => {
    const ok = createHarness({
      consoleMode: "blind",
      oscReplies: [{ pattern: /^\/eos\/out\/ping/, address: "/eos/out/ping", args: ["mcp-1"] }],
    });
    const good = await invokeTool(ok.server, "eos_ping", {});
    assert.equal(isToolError(good), false);
    assert.ok(ok.client.sent.some((m) => m.address === "/eos/ping"));

    const none = createHarness({ consoleMode: "blind" });
    assert.equal(isToolError(await invokeTool(none.server, "eos_ping", {})), true);
  });
});
