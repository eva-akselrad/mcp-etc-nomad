import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { EosListener } from "../src/eos/listener.js";
import { groupKey } from "../src/eos/show-types.js";
import { makeTestConfig } from "./harness.js";
import { replayOscMessages } from "./replay-osc.js";

type GoldenScenario = {
  name: string;
  messages: Array<{ address: string; args: unknown[] }>;
  expect: Record<string, unknown>;
};

type GoldenFixture = {
  scenarios: GoldenScenario[];
};

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/golden-traces.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as GoldenFixture;

describe("golden OSC trace replay (PLAN §11.3)", () => {
  for (const scenario of fixture.scenarios) {
    it(scenario.name, () => {
      const listener = new EosListener(makeTestConfig());
      replayOscMessages(listener, scenario.messages);
      const state = listener.getState();
      const expect = scenario.expect;

      if (expect.consoleMode !== undefined) {
        assert.equal(state.consoleMode, expect.consoleMode);
      }
      if (expect.connected !== undefined) {
        assert.equal(state.connected, expect.connected);
      }
      if (expect.activeCueText !== undefined) {
        assert.equal(state.activeCue.text, expect.activeCueText);
      }
      if (expect.activeCuePercent !== undefined) {
        assert.equal(state.activeCue.percent, expect.activeCuePercent);
      }
      if (expect.activeCueList !== undefined) {
        assert.equal(state.activeCue.cueList, expect.activeCueList);
      }
      if (expect.activeCueNumber !== undefined) {
        assert.equal(state.activeCue.cue, expect.activeCueNumber);
      }
      if (expect.commandLine !== undefined) {
        assert.equal(state.commandLine, expect.commandLine);
      }
      if (expect.showPath !== undefined) {
        assert.equal(state.showPath, expect.showPath);
      }
      if (expect.showFileEvent !== undefined) {
        assert.equal(state.showFile?.lastEvent, expect.showFileEvent);
      }
      if (expect.showFilePath !== undefined) {
        assert.equal(state.showFile?.path, expect.showFilePath);
      }
      if (expect.faderLabels !== undefined) {
        assert.deepEqual(state.faderLabels, expect.faderLabels);
      }
      if (expect.faderLevels !== undefined) {
        assert.deepEqual(state.faderLevels, expect.faderLevels);
      }
      if (expect.groupCount !== undefined) {
        assert.equal(Object.keys(state.groups).length, expect.groupCount);
      }
      if (expect.groupLabel !== undefined) {
        const group = state.groups[groupKey(1)];
        assert.equal(group?.label, expect.groupLabel);
      }
      if (expect.groupChannels !== undefined) {
        const group = state.groups[groupKey(1)];
        assert.deepEqual(group?.channels, expect.groupChannels);
      }
      if (expect.directSelectLabels !== undefined) {
        for (const [key, label] of Object.entries(expect.directSelectLabels as Record<string, string>)) {
          assert.equal(state.directSelects[key]?.label, label);
        }
      }
    });
  }
});
