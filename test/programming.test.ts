import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  buildCopyCommand,
  buildDeleteCommand,
  buildGroupFromChannelsCommand,
  buildMoveCommand,
  buildRecordCommand,
  buildUpdateCommand,
} from "../src/eos/programming.js";
import { EosClient } from "../src/eos/client.js";
import { EosListener } from "../src/eos/listener.js";
import {
  createHarness,
  invokeTool,
  isToolError,
  makeTestConfig,
  parseToolJson,
} from "./harness.js";
import { MockOscPeer } from "./mock-osc-peer.js";

describe("programming command builders", () => {
  it("buildRecordCommand formats cue record with list and label", () => {
    assert.equal(
      buildRecordCommand({ target: "cue", number: 5, cueList: 1, label: "Intro" }),
      'Cue 1/5 Record Label "Intro"'
    );
  });

  it("buildUpdateCommand formats cue update", () => {
    assert.equal(
      buildUpdateCommand({ target: "cue", number: 1.5, cueList: 2, block: true }),
      "Cue 2/1.5 Update Block"
    );
  });

  it("buildCopyCommand formats cue range copy", () => {
    assert.equal(
      buildCopyCommand({
        sourceType: "cue",
        sourceFrom: 1,
        sourceThru: 5,
        sourceCueList: 1,
        destType: "cue",
        dest: 10,
        destCueList: 1,
      }),
      "Copy Cue 1/1 Thru Cue 1/5 Cue 1/10"
    );
  });

  it("buildMoveCommand formats effect move", () => {
    assert.equal(
      buildMoveCommand({
        sourceType: "effect",
        source: 1,
        destType: "effect",
        dest: 2,
      }),
      "Move Effect 1 At Effect 2"
    );
  });

  it("buildDeleteCommand formats delete with thru", () => {
    assert.equal(
      buildDeleteCommand({
        target: "cue",
        from: 1,
        thru: 5,
        cueList: 1,
      }),
      "Delete Cue 1/1 Thru Cue 1/5"
    );
  });

  it("buildGroupFromChannelsCommand formats channel range to group", () => {
    assert.equal(
      buildGroupFromChannelsCommand({
        channelFrom: 1,
        channelThru: 10,
        group: 1,
        label: "Wash",
      }),
      'Channel 1 Thru 10 Group 1 Label Group 1 "Wash"'
    );
  });
});

describe("programming tools via recording client", () => {
  it("cue_record sends CLI via /eos/cmd with Enter terminator", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const result = await invokeTool(server, "cue_record", {
      cue: 5,
      cueList: 1,
      confirm: true,
    });
    assert.equal(isToolError(result), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/cmd");
    assert.match(String(client.sent.at(-1)?.args[0]), /Cue 1\/5 Record Enter$/);
  });

  it("programming_delete requires confirm_delete when EOS_REQUIRE_CONFIRM=true", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const blocked = await invokeTool(server, "programming_delete", {
      target: "cue",
      from: 5,
      cueList: 1,
      confirm: true,
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /confirm_delete=true/);
    assert.equal(client.sent.length, 0);
  });

  it("programming_delete sends delete CLI with confirm_delete", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const ok = await invokeTool(server, "programming_delete", {
      target: "cue",
      from: 5,
      cueList: 1,
      confirm: true,
      confirm_delete: true,
    });
    assert.equal(isToolError(ok), false);
    assert.match(String(client.sent.at(-1)?.args[0]), /Delete Cue 1\/5 Enter$/);
  });

  it("confirm and allow_live remain separate for programming writes in live mode", async () => {
    const { server, client } = createHarness({ consoleMode: "live" });

    const blocked = await invokeTool(server, "cue_record", {
      cue: 1,
      confirm: true,
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /allow_live=true/);
    assert.equal(client.sent.length, 0);

    client.clear();
    const ok = await invokeTool(server, "cue_record", {
      cue: 1,
      confirm: true,
      allow_live: true,
    });
    assert.equal(isToolError(ok), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/cmd");
  });
});

describe("sync_show_targets via mock OSC peer", () => {
  const txPort = 18200;
  const rxPort = 19201;
  let peer: MockOscPeer;
  let listener: EosListener;
  let client: EosClient;
  let server: ReturnType<typeof createHarness>["server"];

  before(async () => {
    peer = new MockOscPeer({ txPort, rxPort, consoleMode: 0 });
    peer.start();

    const config = makeTestConfig({ portTx: txPort, portRx: rxPort, rxBind: "127.0.0.1" });
    listener = new EosListener(config);
    listener.start();
    client = new EosClient(config);

    const harness = createHarness({ config: { portTx: txPort, portRx: rxPort, rxBind: "127.0.0.1" } });
    harness.ctx.client = client as unknown as typeof harness.ctx.client;
    harness.ctx.listener = listener;
    server = harness.server;

    await new Promise((r) => setTimeout(r, 100));
  });

  after(async () => {
    await client.close();
    await listener.stop();
    await peer.close();
  });

  it("sync_show_targets populates groups and cues cache", async () => {
    const result = await invokeTool(server, "sync_show_targets", {
      cues: [1],
      timeoutMs: 5000,
    });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ groups: number; cueLists: number; cues: Record<string, number> }>(
      result
    );
    assert.equal(body.groups, 2);
    assert.equal(body.cueLists, 1);
    assert.equal(body.cues["1"], 2);

    const state = listener.getState();
    assert.equal(Object.keys(state.groups).length, 2);
    assert.equal(state.groups["1"]?.label, "Wash");
    assert.equal(state.groups["1"]?.channels?.length, 5);
    assert.equal(Object.keys(state.cues).length, 2);

    const groupsQuery = await invokeTool(server, "query_groups", {});
    const groupsBody = parseToolJson<{ count: number }>(groupsQuery);
    assert.equal(groupsBody.count, 2);

    assert.ok(peer.received.some((m) => m.address === "/eos/get/group/count"));
    assert.ok(peer.received.some((m) => m.address === "/eos/get/cue/1/noparts/count"));
    assert.ok(peer.received.some((m) => m.address === "/eos/subscribe=1"));
  });
});
