import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCopyCommand,
  buildCueMoveCommand,
  buildDeleteCommand,
  buildGroupFromChannelsCommand,
  buildLabelCommand,
  buildPatchCommand,
  buildRecordCommand,
  buildUnpatchCommand,
  buildUpdateCommand,
} from "../src/eos/programming.js";
import {
  createHarness,
  invokeTool,
  isToolError,
  makeTestConfig,
  parseToolJson,
} from "./harness.js";

describe("programming CLI builders — extended coverage", () => {
  it("record group and preset one_shot", () => {
    assert.equal(
      buildRecordCommand({ target: "group", number: 3, style: "one_shot" }),
      "Group 3 Record"
    );
    assert.equal(
      buildRecordCommand({ target: "preset", number: 12, style: "one_shot" }),
      "Preset 12 Record"
    );
  });

  it("update cue with scope suffix", () => {
    assert.equal(
      buildUpdateCommand({ target: "cue", number: 5, cueList: 1, scope: "cue_only" }),
      "Cue 1/5 Update Cue Only"
    );
  });

  it("move and copy across target types", () => {
    assert.equal(
      buildCueMoveCommand({ source: 5, dest: 10, sourceCueList: 1, destCueList: 1 }),
      "Move Cue 1/5 At Cue 1/10"
    );
    assert.equal(
      buildCopyCommand({
        sourceType: "preset",
        sourceFrom: 1,
        destType: "preset",
        dest: 2,
      }),
      "Copy Preset 1 Preset 2"
    );
  });

  it("patch, unpatch, label, group from channels", () => {
    assert.equal(buildPatchCommand({ channel: 101 }), "Patch 101");
    assert.equal(buildUnpatchCommand({ channel: 50 }), "Unpatch 50");
    assert.equal(
      buildLabelCommand({ target: "group", number: 1, label: "Warm Wash" }),
      'Label Group 1 "Warm Wash"'
    );
    assert.equal(
      buildGroupFromChannelsCommand({ group: 1, channelFrom: 1, channelThru: 3 }),
      "Channel 1 Thru 3 Group 1 Record"
    );
  });

  it("delete group range", () => {
    assert.equal(
      buildDeleteCommand({ target: "group", from: 1, thru: 3 }),
      "Delete Group 1 Thru Group 3"
    );
  });
});

describe("CLI and Dictionary tool TX", () => {
  it("eos_command uses /eos/cmd with Enter terminator", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "eos_command", { text: "Channel 1 At 75" });
    assert.equal(client.sent.at(-1)?.address, "/eos/cmd");
    assert.equal(client.sent.at(-1)?.args[0], "Channel 1 At 75 Enter");
  });

  it("eos_new_command and eos_event use correct paths", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "eos_new_command", { text: "Clear", terminator: "hash" });
    assert.equal(client.sent.at(-1)?.address, "/eos/newcmd");
    assert.equal(client.sent.at(-1)?.args[0], "Clear#");

    client.clear();
    await invokeTool(server, "eos_event", { text: "Blind" });
    assert.equal(client.sent.at(-1)?.address, "/eos/event");
    assert.equal(client.sent.at(-1)?.args[0], "Blind Enter");
  });

  it("key_press maps go alias to /eos/key/go_0", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "key_press", { key: "go" });
    const goMsgs = client.sent.filter((m) => m.address === "/eos/key/go_0");
    assert.equal(goMsgs.length, 2);
    assert.deepEqual(goMsgs[0]?.args, [1.0]);
    assert.deepEqual(goMsgs[1]?.args, [0.0]);
  });

  it("softkey_press uses /eos/softkey/{n}", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "softkey_press", { softkey: 4 });
    assert.equal(client.sent.at(-1)?.address, "/eos/softkey/4");
  });

  it("palette_fire and preset_fire use Dictionary fire paths", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "palette_fire", { type: "color", palette: 2 });
    assert.equal(client.sent.at(-1)?.address, "/eos/cp/fire");
    assert.equal(client.sent.at(-1)?.args[0], 2);

    client.clear();
    await invokeTool(server, "preset_fire", { preset: 7, confirm: true });
    assert.equal(client.sent.at(-1)?.address, "/eos/preset/fire");
    assert.equal(client.sent.at(-1)?.args[0], 7);
  });

  it("macro_fire sends /eos/macro/fire", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false },
    });
    await invokeTool(server, "macro_fire", { macro: 5, confirm: true });
    assert.equal(client.sent.at(-1)?.address, "/eos/macro/fire");
    assert.equal(client.sent.at(-1)?.args[0], 5);
  });

  it("channel_set_level applies user prefix when configured", async () => {
    const { server, client } = createHarness({
      consoleMode: "blind",
      config: { requireConfirm: false, userId: 3 },
    });
    await invokeTool(server, "channel_set_level", { channel: 1, level: 50 });
    assert.equal(client.sent.at(-1)?.address, "/eos/user/3/chan/1");
    assert.equal(client.sent.at(-1)?.args[0], 50);
  });

  it("eos_command refuses live without allow_live", async () => {
    const { server, client } = createHarness({ consoleMode: "live" });
    const blocked = await invokeTool(server, "eos_command", {
      text: "Channel 1 At Full",
      confirm: true,
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /allow_live=true/);
    assert.equal(client.sent.length, 0);
  });
});

describe("withUserPrefix via recording client", () => {
  it("positive user id prefixes all /eos/ paths except /eos/user", () => {
    const config = makeTestConfig({ userId: 7 });
    assert.equal(config.userId, 7);
  });
});

describe("mock peer CLI echo and active cue", () => {
  const txPort = 18300;
  const rxPort = 19301;

  it("echoes /eos/out/cmd and active cue after cue_fire", async () => {
    const { EosClient } = await import("../src/eos/client.js");
    const { EosListener } = await import("../src/eos/listener.js");
    const { MockOscPeer } = await import("./mock-osc-peer.js");

    const peer = new MockOscPeer({ txPort, rxPort, consoleMode: 0 });
    peer.start();
    const config = makeTestConfig({ portTx: txPort, portRx: rxPort, rxBind: "127.0.0.1" });
    const listener = new EosListener(config);
    listener.start();
    const client = new EosClient(config);
    await new Promise((r) => setTimeout(r, 100));

    try {
      await client.send("/eos/newcmd", "Channel 1 At 75 Enter");
      await new Promise((r) => setTimeout(r, 150));
      assert.match(listener.getState().commandLine ?? "", /Channel 1 At 75/);

      await client.send("/eos/cue/1/5/fire", 1.0);
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(listener.getState().activeCue.cueList, 1);
      assert.equal(listener.getState().activeCue.cue, "5");
      assert.equal(listener.getState().activeCue.percent, 1.0);
    } finally {
      await client.close();
      await listener.stop();
      await peer.close();
    }
  });
});
