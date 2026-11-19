import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expandChannelArgs } from "../src/eos/sync.js";

describe("expandChannelArgs", () => {
  it("expands Eos range strings and keeps single channels", () => {
    assert.deepEqual(expandChannelArgs(["2-6", "9-13", 64]), [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 64]);
  });

  it("ignores non-channel values", () => {
    assert.deepEqual(expandChannelArgs(["", "abc", true, null, "75"]), [75]);
  });
});
