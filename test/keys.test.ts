import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeOscKey, normalizeOscKey, oscKeyCatalog } from "../src/eos/keys.js";

describe("normalizeOscKey — Dictionary aliases", () => {
  it("maps common operator aliases to canonical OSC names", () => {
    assert.equal(normalizeOscKey("go"), "go_0");
    assert.equal(normalizeOscKey("GO"), "go_0");
    assert.equal(normalizeOscKey("stop_back"), "stop");
    assert.equal(normalizeOscKey("staging"), "staging_mode");
    assert.equal(normalizeOscKey("slash"), "\\");
    assert.equal(normalizeOscKey("thru"), "thru");
  });

  it("normalizes spaces to underscores", () => {
    assert.equal(normalizeOscKey("open browser"), "open_browser");
  });

  it("rejects invalid key segments", () => {
    assert.throws(() => normalizeOscKey("bad/key"), /Invalid OSC key name/);
  });

  it("describeOscKey and catalog expose operator keys", () => {
    assert.equal(describeOscKey("go_0")?.osc, "go_0");
    const catalog = oscKeyCatalog();
    assert.ok(catalog.keys.some((k) => k.osc === "stop"));
    assert.equal(catalog.aliases.go, "go_0");
  });
});
