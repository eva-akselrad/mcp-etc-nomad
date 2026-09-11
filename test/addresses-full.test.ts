import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  atLevel,
  channelLevel,
  channelSelect,
  commandLine,
  cueFire,
  cueListBankConfig,
  cueListBankReset,
  cueListStop,
  cueSelect,
  directSelectBankCreate,
  directSelectBankPage,
  directSelectPress,
  faderAction,
  faderBankReset,
  getCue,
  getCueCount,
  getCueList,
  getCueListCount,
  getGroup,
  getGroupCount,
  getPresetCount,
  getSubscribe,
  groupLevel,
  keyPress,
  macroFire,
  macroFireNumber,
  macroSelect,
  magicSheet,
  oscReset,
  paletteFire,
  paletteSelect,
  presetFire,
  presetSelect,
  setCueLabel,
  setGroupLabel,
  setPaletteLabel,
  setPresetLabel,
  softkeyPress,
  stagingModeKey,
  subFire,
  subLevel,
  subSelect,
  targetNumber,
  withUserPrefix,
} from "../src/eos/addresses.js";
import { makeTestConfig } from "./harness.js";

describe("addresses.ts — full Dictionary coverage", () => {
  it("targetNumber accepts point cues and rejects slashes", () => {
    assert.equal(targetNumber(1.5), "1.5");
    assert.equal(targetNumber("10"), "10");
    assert.throws(() => targetNumber("1/5"), /Invalid target/);
  });

  it("cue paths distinguish fire, select, stop, and part cues", () => {
    assert.equal(cueFire(1, 5), "/eos/cue/1/5/fire");
    assert.equal(cueFire(1, "1.5"), "/eos/cue/1/1.5/fire");
    assert.equal(cueFire(1, 5, 2), "/eos/cue/1/5/2/fire");
    assert.equal(cueFire(undefined, 5), "/eos/cue/fire");
    assert.equal(cueSelect(1, 5), "/eos/cue/1/5");
    assert.equal(cueSelect(1), "/eos/cue/1");
    assert.equal(cueSelect(undefined), "/eos/cue");
    assert.equal(cueListStop(1), "/eos/cues/1/stop");
    assert.equal(cueListStop(), "/eos/cues/stop");
  });

  it("cue list bank config supports optional offset", () => {
    assert.equal(cueListBankConfig(1, 1, 3, 6), "/eos/cuelist/1/config/1/3/6");
    assert.equal(cueListBankConfig(1, 1, 3, 6, 0), "/eos/cuelist/1/config/1/3/6/0");
    assert.equal(cueListBankReset(1), "/eos/cuelist/1/reset");
  });

  it("fader actions and bank reset", () => {
    assert.equal(faderAction(1, 3, "load"), "/eos/fader/1/3/load");
    assert.equal(faderAction(2, 5, "fire"), "/eos/fader/2/5/fire");
    assert.equal(faderBankReset(1), "/eos/fader/1/reset");
  });

  it("direct select bank create supports flexi and page", () => {
    assert.equal(directSelectBankCreate(2, "chan", 24), "/eos/ds/2/chan/24");
    assert.equal(directSelectBankCreate(2, "group", 12, { flexi: true }), "/eos/ds/2/group/flexi/12");
    assert.equal(
      directSelectBankCreate(3, "preset", 10, { page: 2 }),
      "/eos/ds/3/preset/2/10"
    );
    assert.equal(directSelectBankPage(2, -1), "/eos/ds/2/page/-1");
    assert.equal(directSelectPress(2, 5), "/eos/ds/2/5");
  });

  it("levels, subs, palettes, presets, macros", () => {
    assert.equal(channelLevel(42), "/eos/chan/42");
    assert.equal(channelSelect(), "/eos/chan");
    assert.equal(groupLevel(3), "/eos/group/3");
    assert.equal(atLevel(), "/eos/at");
    assert.equal(subLevel(5), "/eos/sub/5");
    assert.equal(subSelect(), "/eos/sub");
    assert.equal(subFire(5), "/eos/sub/5/fire");
    assert.equal(subFire(), "/eos/sub/fire");
    assert.equal(paletteSelect("cp"), "/eos/cp");
    assert.equal(paletteFire("ip", 2), "/eos/ip/2/fire");
    assert.equal(paletteFire("fp"), "/eos/fp/fire");
    assert.equal(presetSelect(), "/eos/preset");
    assert.equal(presetFire(7), "/eos/preset/7/fire");
    assert.equal(macroSelect(), "/eos/macro");
    assert.equal(macroFire(), "/eos/macro/fire");
    assert.equal(macroFireNumber(5), "/eos/macro/5/fire");
  });

  it("command line, reset, magic sheet, staging", () => {
    assert.equal(commandLine("cmd"), "/eos/cmd");
    assert.equal(commandLine("newcmd"), "/eos/newcmd");
    assert.equal(commandLine("event"), "/eos/event");
    assert.equal(oscReset(), "/eos/reset");
    assert.equal(magicSheet(3), "/eos/ms");
    assert.equal(magicSheet(3, 2), "/eos/ms/3");
    assert.equal(stagingModeKey(), "/eos/key/staging_mode");
    assert.equal(keyPress("go_0"), "/eos/key/go_0");
    assert.equal(softkeyPress(6), "/eos/softkey/6");
  });

  it("OSC get/set paths", () => {
    assert.equal(getSubscribe(), "/eos/subscribe");
    assert.equal(getGroupCount(), "/eos/get/group/count");
    assert.equal(getGroup(1), "/eos/get/group/1");
    assert.equal(getCueListCount(), "/eos/get/cuelist/count");
    assert.equal(getCueList(1), "/eos/get/cuelist/1");
    assert.equal(getCueCount(1), "/eos/get/cue/1/noparts/count");
    assert.equal(getCue(1, 5), "/eos/get/cue/1/5/0");
    assert.equal(getPresetCount(), "/eos/get/preset/count");
    assert.equal(setGroupLabel(1), "/eos/set/group/1/label");
    assert.equal(setCueLabel(1, 5), "/eos/set/cue/1/5/label");
    assert.equal(setPresetLabel(3), "/eos/set/preset/3/label");
    assert.equal(setPaletteLabel("cp", 2), "/eos/set/cp/2/label");
  });

  it("withUserPrefix inserts /eos/user/{id} for positive user ids", () => {
    const config = makeTestConfig({ userId: 5 });
    assert.equal(withUserPrefix(config, "/eos/chan/1"), "/eos/user/5/chan/1");
    assert.equal(withUserPrefix(config, "/eos/user"), "/eos/user");
    assert.equal(withUserPrefix(makeTestConfig({ userId: -1 }), "/eos/chan/1"), "/eos/chan/1");
  });
});
