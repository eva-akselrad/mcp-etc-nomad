import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "node-osc";
import {
  channelDmx,
  cueFire,
  cueListBankPage,
  cueListBankSelect,
  cueListGo,
  directSelectBankCreate,
  faderBankConfig,
  faderLevel,
  getCueIndex,
  getCueIndexPrimary,
  getCueListIndex,
  getGroupIndex,
  getPaletteIndex,
  getPresetIndex,
  getSubscribe,
} from "../src/eos/addresses.js";
import { assertLiveAllowed, type EosContext } from "../src/eos/context.js";
import { EosClient } from "../src/eos/client.js";
import { EosListener } from "../src/eos/listener.js";
import { createInitialState } from "../src/eos/state.js";
import {
  createHarness,
  createLiveHarness,
  invokeTool,
  isToolError,
  makeTestConfig,
  parseToolJson,
} from "./harness.js";
import { MockOscPeer } from "./mock-osc-peer.js";

describe("address builders (Dictionary OSC paths)", () => {
  it("cue_fire uses /eos/cue/.../fire, not /eos/cues/.../fire", () => {
    assert.equal(cueFire(1, 5), "/eos/cue/1/5/fire");
    assert.equal(cueFire(undefined, 5), "/eos/cue/fire");
    assert.notEqual(cueFire(1, 5), cueListGo(1));
  });

  it("cue_list_go uses /eos/cues/.../fire", () => {
    assert.equal(cueListGo(1), "/eos/cues/1/fire");
    assert.equal(cueListGo(), "/eos/cues/fire");
  });

  it("cue list bank view paths are not fire addresses", () => {
    assert.equal(cueListBankSelect(1, 5), "/eos/cuelist/1/select/5");
    assert.equal(cueListBankPage(1, 0), "/eos/cuelist/1/page/0");
    assert.doesNotMatch(cueListBankSelect(1, 5), /\/fire$/);
    assert.doesNotMatch(cueListBankPage(1, 0), /\/fire$/);
  });

  it("bank config addresses match Dictionary layout", () => {
    assert.equal(faderBankConfig(1, 10), "/eos/fader/1/config/10");
    assert.equal(directSelectBankCreate(2, "chan", 24), "/eos/ds/2/chan/24");
    assert.equal(faderLevel(1, 3), "/eos/fader/1/3");
    assert.equal(channelDmx(42), "/eos/chan/42/dmx");
    assert.doesNotMatch(channelDmx(42), /\/DMX$/);
  });

  it("OSC get index helpers use base path (index as int arg, not path segment)", () => {
    assert.equal(getSubscribe(), "/eos/subscribe");
    assert.equal(getGroupIndex(), "/eos/get/group/index");
    assert.equal(getCueListIndex(), "/eos/get/cuelist/index");
    assert.equal(getCueIndex(1), "/eos/get/cue/1/noparts/index");
    assert.equal(getCueIndexPrimary(1), "/eos/get/cue/1/index");
    assert.equal(getPresetIndex(), "/eos/get/preset/index");
    assert.equal(getPaletteIndex("ip"), "/eos/get/ip/index");
    assert.doesNotMatch(getGroupIndex(), /\/index\/\d/);
    assert.doesNotMatch(getSubscribe(), /=/);
  });
});

describe("assertLiveAllowed — confirm vs allow_live are separate gates", () => {
  function ctx(mode: "blind" | "live" | "unknown") {
    return {
      config: makeTestConfig({ allowLive: false, requireConfirm: true }),
      client: {} as EosContext["client"],
      listener: { getState: () => ({ ...createInitialState(), consoleMode: mode }) },
      cueFireLog: [],
    } as unknown as EosContext;
  }

  it("requires confirm when EOS_REQUIRE_CONFIRM=true", () => {
    const err = assertLiveAllowed(ctx("blind"), {});
    assert.match(err ?? "", /confirm=true/);
    assert.equal(assertLiveAllowed(ctx("blind"), { confirm: true }), null);
  });

  it("refuses LIVE without allow_live even when confirm=true", () => {
    const err = assertLiveAllowed(ctx("live"), { confirm: true });
    assert.match(err ?? "", /allow_live=true/);
    assert.doesNotMatch(err ?? "", /confirm=true to execute this action/);
  });

  it("refuses unknown state without allow_live even when confirm=true", () => {
    const err = assertLiveAllowed(ctx("unknown"), { confirm: true });
    assert.match(err ?? "", /LIVE or unconfirmed/);
    assert.match(err ?? "", /allow_live=true/);
  });

  it("allows LIVE writes with confirm and allow_live", () => {
    assert.equal(assertLiveAllowed(ctx("live"), { confirm: true, allow_live: true }), null);
    assert.equal(assertLiveAllowed(ctx("unknown"), { confirm: true, allow_live: true }), null);
  });

  it("skips live gate in blind mode with confirm only", () => {
    assert.equal(assertLiveAllowed(ctx("blind"), { confirm: true }), null);
  });
});

describe("tool TX paths via recording client", () => {
  it("cue_fire emits /eos/cue/.../fire; cue_list_go emits /eos/cues/.../fire", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const fire = await invokeTool(server, "cue_fire", {
      cueList: 1,
      cue: 5,
      confirm: true,
    });
    assert.equal(isToolError(fire), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/cue/1/5/fire");
    assert.deepEqual(client.sent.at(-1)?.args, [1.0]);

    client.clear();
    const go = await invokeTool(server, "cue_list_go", { cueList: 1, confirm: true });
    assert.equal(isToolError(go), false);
    const goAddresses = client.sent.map((m) => m.address);
    assert.ok(goAddresses.includes("/eos/cues/1/fire"));
    assert.ok(!goAddresses.some((a) => a.match(/^\/eos\/cue\/\d+/)));
  });

  it("bank config must precede paging/select/use (OSC paths)", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "fader_bank_config", { bank: 1, count: 10 });
    assert.equal(client.sent.at(-1)?.address, "/eos/fader/1/config/10");

    await invokeTool(server, "fader_bank_page", { bank: 1, delta: 1 });
    assert.equal(client.sent.at(-1)?.address, "/eos/fader/1/page/1");

    await invokeTool(server, "cue_list_bank_config", {
      bank: 1,
      cueList: 1,
      previous: 3,
      pending: 6,
    });
    assert.equal(client.sent.at(-1)?.address, "/eos/cuelist/1/config/1/3/6");

    await invokeTool(server, "cue_list_bank_page", { bank: 1, delta: 0 });
    assert.equal(client.sent.at(-1)?.address, "/eos/cuelist/1/page/0");

    await invokeTool(server, "cue_list_bank_select", { bank: 1, cue: 5 });
    assert.equal(client.sent.at(-1)?.address, "/eos/cuelist/1/select/5");

    await invokeTool(server, "direct_select_bank_create", { bank: 2, type: "chan", count: 24 });
    assert.equal(client.sent.at(-1)?.address, "/eos/ds/2/chan/24");
  });

  it("cue_list_bank_select and cue_list_bank_page are view-only (no live gate)", async () => {
    const { server, client } = createLiveHarness("live");

    const page = await invokeTool(server, "cue_list_bank_page", { bank: 1, delta: 0 });
    assert.equal(isToolError(page), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/cuelist/1/page/0");
    assert.doesNotMatch(client.sent.at(-1)?.address ?? "", /\/fire$/);

    const select = await invokeTool(server, "cue_list_bank_select", { bank: 1, cue: 10 });
    assert.equal(isToolError(select), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/cuelist/1/select/10");
    assert.doesNotMatch(client.sent.at(-1)?.address ?? "", /\/fire$/);
  });

  it("refuses live cue_fire without allow_live even with confirm", async () => {
    const { server, client } = createLiveHarness("live");

    const blocked = await invokeTool(server, "cue_fire", {
      cueList: 1,
      cue: 1,
      confirm: true,
    });
    assert.equal(isToolError(blocked), true);
    const body = parseToolJson<{ error: string }>(blocked);
    assert.match(body.error, /allow_live=true/);
    assert.equal(client.sent.length, 0);
  });

  it("allows live cue_fire with confirm and allow_live", async () => {
    const { server, client } = createLiveHarness("live");

    const ok = await invokeTool(server, "cue_fire", {
      cueList: 1,
      cue: 2,
      confirm: true,
      allow_live: true,
    });
    assert.equal(isToolError(ok), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/cue/1/2/fire");
  });

  it("fader_set_level TX uses 0–1 floats only (no immediate /eos/out/fader echo)", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    for (const level of [0, 0.5, 1]) {
      client.clear();
      const result = await invokeTool(server, "fader_set_level", {
        bank: 1,
        fader: 1,
        level,
        confirm: true,
      });
      assert.equal(isToolError(result), false);
      assert.equal(client.sent.at(-1)?.address, "/eos/fader/1/1");
      assert.equal(client.sent.at(-1)?.args[0], level);
    }
  });

  it("channel_set_dmx uses lowercase /eos/chan/{n}/dmx", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const result = await invokeTool(server, "channel_set_dmx", {
      channel: 10,
      dmx: 128,
      confirm: true,
    });
    assert.equal(isToolError(result), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/chan/10/dmx");
    assert.equal(client.sent.at(-1)?.args[0], 128);
  });

  it("submaster_fire sends button edge 1.0/0.0 on /eos/sub/{n}/fire only", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "submaster_fire", { sub: 5, confirm: true, edge: "tap" });
    const fireMsgs = client.sent.filter((m) => m.address === "/eos/sub/5/fire");
    assert.equal(fireMsgs.length, 2);
    assert.deepEqual(fireMsgs[0]?.args, [1.0]);
    assert.deepEqual(fireMsgs[1]?.args, [0.0]);
    assert.ok(
      fireMsgs.every((m) => m.args[0] === 1.0 || m.args[0] === 0.0),
      "fire address must only carry button edges, not intensity"
    );
    assert.equal(
      client.sent.filter((m) => m.address === "/eos/sub/5").length,
      0,
      "intensity belongs on /eos/sub/{n}, not fire"
    );
  });

  it("submaster_set_level sends intensity on /eos/sub/{n}", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    await invokeTool(server, "submaster_set_level", { sub: 5, level: 0.75, confirm: true });
    assert.equal(client.sent.at(-1)?.address, "/eos/sub/5");
    assert.equal(client.sent.at(-1)?.args[0], 0.75);
  });
});

describe("mock OSC peer integration (PLAN §11.1)", () => {
  const txPort = 18100;
  const rxPort = 19101;
  let peer: MockOscPeer;
  let listener: EosListener;
  let client: EosClient;

  before(async () => {
    peer = new MockOscPeer({ txPort, rxPort, consoleMode: 0 });
    peer.start();

    const config = makeTestConfig({ portTx: txPort, portRx: rxPort, rxBind: "127.0.0.1" });
    listener = new EosListener(config);
    listener.start();
    client = new EosClient(config);

    await new Promise((r) => setTimeout(r, 100));
  });

  after(async () => {
    await client.close();
    await listener.stop();
    await peer.close();
  });

  it("mock peer captures TX and sends canned /eos/out/event/state", async () => {
    peer.received.length = 0;
    await client.send("/eos/reset");
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(peer.received.some((m) => m.address === "/eos/reset"));
    assert.equal(listener.getState().consoleMode, "blind");
  });

  it("fader bank config is tracked; fader level TX does not produce immediate echo", async () => {
    peer.received.length = 0;
    await client.send(faderBankConfig(1, 10));
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(peer.isFaderBankConfigured(1));

    await client.send(faderLevel(1, 1), 0.75);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(Object.keys(listener.getState().faderLevels), []);
  });

  it("fader echo arrives only after waiting ≥3s (Eos delay)", async () => {
    const delayedPeer = new MockOscPeer({ txPort: 18101, rxPort: 19102, consoleMode: 0 });
    delayedPeer.start();
    const config = makeTestConfig({
      portTx: 18101,
      portRx: 19102,
      rxBind: "127.0.0.1",
    });
    const delayedListener = new EosListener(config);
    delayedListener.start();
    const delayedClient = new EosClient(config);
    await new Promise((r) => setTimeout(r, 100));

    try {
      await delayedClient.send(faderBankConfig(1, 10));
      await new Promise((r) => setTimeout(r, 100));
      await delayedClient.send(faderLevel(1, 1), 1.0);
      assert.deepEqual(Object.keys(delayedListener.getState().faderLevels), []);

      // Simulate delayed Eos echo after ≥3s
      await new Promise((r) => setTimeout(r, 3100));
      const reply = new Client("127.0.0.1", 19102);
      await reply.send("/eos/out/fader/1/1", 1.0);
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(delayedListener.getState().faderLevels["1/1"], 1.0);
      await reply.close();
    } finally {
      await delayedClient.close();
      await delayedListener.stop();
      await delayedPeer.close();
    }
  });
});
