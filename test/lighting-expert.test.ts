import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCueFireRate, type EosContext } from "../src/eos/context.js";
import { createInitialState } from "../src/eos/state.js";
import {
  createHarness,
  createLiveHarness,
  invokeTool,
  isToolError,
  makeTestConfig,
  parseToolJson,
} from "./harness.js";

describe("Lighting Expert priority pack", () => {
  it("go_to_cue selects cue then presses go_to_cue key", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const result = await invokeTool(server, "go_to_cue", {
      cueList: 1,
      cue: 5,
      confirm: true,
    });
    assert.equal(isToolError(result), false);
    const addresses = client.sent.map((m) => m.address);
    assert.ok(addresses.some((a) => a.includes("/eos/cue/1")));
    assert.ok(addresses.includes("/eos/key/go_to_cue"));
    assert.ok(!addresses.some((a) => a.match(/\/eos\/cue\/.*\/fire$/)));
  });

  it("go_to_cue time=0 slams via assert key", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "go_to_cue", {
      cue: 1,
      time: 0,
      confirm: true,
    });
    const addresses = client.sent.map((m) => m.address);
    assert.ok(addresses.includes("/eos/key/assert"));
    assert.ok(addresses.includes("/eos/key/go_to_cue"));
  });

  it("blackout uses /eos/key/blackout — never Chan Thru Out", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "blackout", { confirm: true });
    const addresses = client.sent.map((m) => m.address);
    assert.ok(addresses.includes("/eos/key/blackout"));
    assert.ok(!addresses.some((a) => a.includes("/eos/chan")));
    assert.ok(!client.sent.some((m) => String(m.args).toLowerCase().includes("out")));
  });

  it("grandmaster_set_level uses /eos/fader/0/1", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "grandmaster_set_level", { level: 0.5, confirm: true });
    assert.equal(client.sent.at(-1)?.address, "/eos/fader/0/1");
    assert.equal(client.sent.at(-1)?.args[0], 0.5);
  });

  it("park_channel sends CLI Park via newcmd", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const result = await invokeTool(server, "park_channel", { channel: 10, confirm: true });
    assert.equal(isToolError(result), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/newcmd");
    assert.match(String(client.sent.at(-1)?.args[0]), /Park Channel 10/);
  });

  it("channel_select Thru range uses thru key", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "channel_select", { from: 1, thru: 10 });
    const addresses = client.sent.map((m) => m.address);
    assert.ok(addresses.includes("/eos/key/thru"));
    assert.equal(client.sent.filter((m) => m.address === "/eos/chan").length, 2);
  });

  it("color_set_hs uses Dictionary color path", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "color_set_hs", {
      hue: 330,
      saturation: 75,
      channel: 1,
      confirm: true,
    });
    assert.equal(client.sent.at(-1)?.address, "/eos/chan/1/color/hs");
    assert.deepEqual(client.sent.at(-1)?.args, [330, 75]);
  });

  it("confirm does NOT bypass cue-fire rate limit; override_rate_limit does", () => {
    const ctx = {
      config: makeTestConfig({ maxCueFiresPerMinute: 1 }),
      client: {} as EosContext["client"],
      listener: { getState: () => ({ ...createInitialState(), consoleMode: "blind" }) },
      cueFireLog: [Date.now()],
    } as unknown as EosContext;

    assert.match(assertCueFireRate(ctx, false) ?? "", /override_rate_limit=true/);
    assert.equal(assertCueFireRate({ ...ctx, cueFireLog: [Date.now()] }, true), null);
  });

  it("cue_hold uses stop key; cue_back uses back key", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    client.clear();
    await invokeTool(server, "cue_hold", { confirm: true });
    assert.equal(client.sent.at(-1)?.address, "/eos/key/stop");

    client.clear();
    await invokeTool(server, "cue_back", { confirm: true });
    assert.equal(client.sent.at(-1)?.address, "/eos/key/back");
  });

  it("update_cue refuses Live without cue number", async () => {
    const { server, client } = createLiveHarness("live");

    const blocked = await invokeTool(server, "update_cue", {
      confirm: true,
      allow_live: true,
    });
    assert.equal(isToolError(blocked), true);
    const body = parseToolJson<{ error: string }>(blocked);
    assert.match(body.error, /explicit cue number/);
    assert.equal(client.sent.length, 0);
  });

  it("macro_fire requires confirm_macro", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const blocked = await invokeTool(server, "macro_fire", { macro: 5, confirm: true });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /confirm_macro=true/);
    assert.equal(client.sent.length, 0);

    const ok = await invokeTool(server, "macro_fire", {
      macro: 5,
      confirm: true,
      confirm_macro: true,
    });
    assert.equal(isToolError(ok), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/macro/fire");
    const body = parseToolJson<{ echoed: string; macro: number }>(ok);
    assert.match(body.echoed, /Macro 5/);
    assert.equal(body.macro, 5);
  });

  it("patch_channel forces Patch display step on Live", async () => {
    const { server, client } = createLiveHarness("live");

    await invokeTool(server, "patch_channel", {
      channel: 101,
      confirm: true,
      allow_live: true,
    });
    const cmds = client.sent
      .filter((m) => m.address === "/eos/newcmd")
      .map((m) => String(m.args[0]));
    assert.ok(cmds.some((c) => c.includes("Patch")));
  });
});
