import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncShowTargets } from "../src/eos/sync.js";
import { createHarness } from "./harness.js";

const list0 = (path: string) => new RegExp(`^/eos/out/get/${path}/list/0(?:/\\d+)?$`);

describe("extra show targets (macros, effects)", () => {
  it("reads effects with type and duration", async () => {
    const { ctx } = createHarness({
      oscReplies: [
        { pattern: new RegExp("^/eos/out/get/fx/count$"), address: "/eos/out/get/fx/count", args: [1] },
        {
          pattern: list0("fx/[\\d.]+"),
          address: "/eos/out/get/fx/901/list/0/8",
          args: [0, "UID", "Circle", "Focus", "Immediate", "Immediate", "Infinite", 25],
        },
      ],
    });
    const result = await syncShowTargets(ctx.client, ctx.listener, {
      groups: false, cueLists: false, presets: false, palettes: false, subscribe: false, extras: ["fx"],
    });
    assert.equal(result.extras?.fx, 1);
    const fx = ctx.listener.getState().extraTargets.fx?.["901"];
    assert.equal(fx?.label, "Circle");
    assert.equal(fx?.details.effectType, "Focus");
    assert.equal(fx?.details.duration, "Infinite");
  });

  it("reads macro text", async () => {
    const { ctx } = createHarness({
      oscReplies: [
        { pattern: new RegExp("^/eos/out/get/macro/count$"), address: "/eos/out/get/macro/count", args: [1] },
        { pattern: list0("macro/[\\d.]+"), address: "/eos/out/get/macro/1/list/0/4", args: [0, "UID", "Reset", ""] },
        { pattern: list0("macro/1/text"), address: "/eos/out/get/macro/1/text/list/0/3", args: [0, "UID", "Go_To_Cue Out Time 0"] },
      ],
    });
    await syncShowTargets(ctx.client, ctx.listener, {
      groups: false, cueLists: false, presets: false, palettes: false, subscribe: false, extras: ["macro"],
    });
    const macro = ctx.listener.getState().extraTargets.macro?.["1"];
    assert.equal(macro?.label, "Reset");
    assert.equal(macro?.details.text, "Go_To_Cue Out Time 0");
  });
});
