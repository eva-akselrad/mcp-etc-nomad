import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  buildCopyCommand,
  buildCueMoveCommand,
  buildDeleteCommand,
  buildEffectMoveCommand,
  buildGroupFromChannelsCommand,
  buildPatchCopyCommand,
  buildPatchMoveCommand,
  buildRecordCommand,
  buildUpdateCommand,
  asProgrammingSteps,
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

describe("programming command builders (Eos OSC domain)", () => {
  it("one_shot record: Record Cue before target when style=one_shot", () => {
    assert.equal(
      buildRecordCommand({ target: "cue", number: 5, cueList: 1, label: "Intro", style: "one_shot" }),
      'Record Cue 1/5 Label Cue 1/5 "Intro"'
    );
  });

  it("two_step record: Cue then Record as separate steps", () => {
    const built = buildRecordCommand({
      target: "cue",
      number: 5,
      style: "two_step",
    });
    assert.deepEqual(asProgrammingSteps(built).steps, ["Cue 5", "Record"]);
  });

  it("record_only mode uses Record Only verb", () => {
    assert.equal(
      buildRecordCommand({ target: "cue", number: 5, mode: "record_only", style: "one_shot" }),
      "Record Only Cue 5"
    );
  });

  it("update with part uses Part N syntax", () => {
    assert.equal(
      buildUpdateCommand({
        target: "cue",
        number: 1,
        part: 2,
        scope: "track",
        style: "one_shot",
      }),
      "Cue 1 Part 2 Update Track"
    );
  });

  it("cue copy on active list: Copy Cue 1 Thru 5 Cue 10", () => {
    assert.equal(
      buildCopyCommand({
        sourceType: "cue",
        sourceFrom: 1,
        sourceThru: 5,
        destType: "cue",
        dest: 10,
      }),
      "Copy Cue 1 Thru Cue 5 Cue 10"
    );
  });

  it("buildEffectMoveCommand is separate from cue templates", () => {
    assert.equal(buildEffectMoveCommand({ source: 1, dest: 2 }), "Move Effect 1 At Effect 2");
  });

  it("buildCueMoveCommand for cues", () => {
    assert.equal(
      buildCueMoveCommand({ source: 5, dest: 10 }),
      "Move Cue 5 At Cue 10"
    );
  });

  it("patch move uses double Copy To", () => {
    assert.equal(buildPatchMoveCommand({ sourceChannel: 116, destChannel: 120 }), "116 Copy To Copy To 120");
    assert.equal(buildPatchCopyCommand({ sourceChannel: 111, destChannel: 116 }), "111 Copy To 116");
    assert.notEqual(buildPatchCopyCommand({ sourceChannel: 111, destChannel: 116 }), buildPatchMoveCommand({ sourceChannel: 111, destChannel: 116 }));
  });

  it("buildDeleteCommand formats delete with thru", () => {
    assert.equal(
      buildDeleteCommand({
        target: "cue",
        from: 1,
        thru: 5,
      }),
      "Delete Cue 1 Thru Cue 5"
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
      'Channel 1 Thru 10 Group 1 Record Label Group 1 "Wash"'
    );
  });
});

describe("programming tools via recording client", () => {
  it("cue_record sends CLI via /eos/newcmd with Enter terminator", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });

    const result = await invokeTool(server, "cue_record", {
      cue: 5,
      cueList: 1,
      refresh_cache: false,
    });
    assert.equal(isToolError(result), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/newcmd");
    assert.match(String(client.sent.at(-1)?.args[0]), /Record Cue 1\/5 Enter$/);
  });

  it("two_step cue_record sends multiple newcmd lines", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });

    await invokeTool(server, "cue_record", {
      cue: 5,
      style: "two_step",
      refresh_cache: false,
    });
    const paths = client.sent.map((m) => m.address);
    assert.equal(paths.filter((p) => p === "/eos/newcmd").length, 2);
    assert.match(String(client.sent[0]?.args[0]), /Cue 5 Enter$/);
    assert.match(String(client.sent[1]?.args[0]), /Record Enter$/);
  });

  it("programming_delete requires confirm_delete when EOS_REQUIRE_CONFIRM=true", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const blocked = await invokeTool(server, "programming_delete", {
      target: "cue",
      from: 5,
      cueList: 1,
      confirm: true,
      refresh_cache: false,
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /confirm_delete=true/);
    assert.equal(client.sent.length, 0);
  });

  it("programming_delete sends delete CLI with confirm_delete via newcmd", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });

    const ok = await invokeTool(server, "programming_delete", {
      target: "cue",
      from: 5,
      cueList: 1,
      confirm: true,
      confirm_delete: true,
      refresh_cache: false,
    });
    assert.equal(isToolError(ok), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/newcmd");
    assert.match(String(client.sent.at(-1)?.args[0]), /Delete Cue 1\/5 Enter$/);
  });

  it("confirm and allow_live remain separate for programming writes in live mode", async () => {
    const { server, client } = createHarness({ consoleMode: "live" });

    const blocked = await invokeTool(server, "cue_record", {
      cue: 1,
      confirm: true,
      refresh_cache: false,
    });
    assert.equal(isToolError(blocked), true);
    assert.match(parseToolJson<{ error: string }>(blocked).error, /allow_live=true/);
    assert.equal(client.sent.length, 0);

    client.clear();
    const ok = await invokeTool(server, "cue_record", {
      cue: 1,
      confirm: true,
      allow_live: true,
      refresh_cache: false,
    });
    assert.equal(isToolError(ok), false);
    assert.equal(client.sent.at(-1)?.address, "/eos/newcmd");
  });

  it("patch_move sends double Copy To via newcmd", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });

    await invokeTool(server, "patch_move", {
      sourceChannel: 116,
      destChannel: 120,
      refresh_cache: false,
    });
    assert.match(String(client.sent.at(-1)?.args[0]), /116 Copy To Copy To 120 Enter$/);
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
