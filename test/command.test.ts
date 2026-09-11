import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCommand, commandOscArgs } from "../src/eos/command.js";

describe("buildCommand — Eos CLI terminators", () => {
  it("appends Enter by default", () => {
    assert.equal(buildCommand("Channel 1 At 75").text, "Channel 1 At 75 Enter");
    assert.equal(buildCommand("Channel 1 At 75", "enter").terminator, "enter");
  });

  it("preserves existing Enter or hash suffix", () => {
    assert.equal(buildCommand("Patch 1 Enter").text, "Patch 1 Enter");
    assert.equal(buildCommand("Patch 1#", "enter").text, "Patch 1#");
  });

  it("hash terminator adds # when missing", () => {
    assert.equal(buildCommand("Label Group 1 Wash", "hash").text, "Label Group 1 Wash#");
    assert.equal(buildCommand("Already#", "hash").text, "Already#");
  });

  it("none terminator leaves text unchanged", () => {
    assert.equal(buildCommand("  Raw text  ", "none").text, "Raw text");
  });

  it("commandOscArgs wraps text for OSC", () => {
    const built = buildCommand("Cue 1");
    assert.deepEqual(commandOscArgs(built), ["Cue 1 Enter"]);
  });
});
