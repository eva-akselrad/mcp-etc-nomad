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
import { formatGroupChannelsString } from "../src/eos/show-types.js";
import { setGroupChannels } from "../src/eos/addresses.js";
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
  it("one_shot record: Record Cue before target", () => {
    assert.equal(
      buildRecordCommand({ target: "cue", number: 5, cueList: 1, style: "one_shot" }),
      "Record Cue 1/5"
    );
  });

  it("two_step record: Cue then Record as separate steps", () => {
    const built = buildRecordCommand({ target: "cue", number: 5, style: "two_step" });
    assert.deepEqual(asProgrammingSteps(built).steps, ["Cue 5", "Record"]);
  });

  it("group_set_channels Thru uses > in OSC string", () => {
    assert.equal(
      formatGroupChannelsString({ ranges: [{ from: 1, thru: 9 }], channels: [21] }),
      "1 > 9 21"
    );
    assert.equal(setGroupChannels(1), "/eos/set/group/1/chans");
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

  it("patch move uses double Copy To", () => {
    assert.equal(buildPatchMoveCommand({ sourceChannel: 116, destChannel: 120 }), "116 Copy To Copy To 120");
  });
});

describe("spec-aligned programming tools", () => {
  it("record_cue sends via /eos/newcmd", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "record_cue", { cue: 5, cueList: 1, refresh_cache: false });
    assert.equal(client.sent.at(-1)?.address, "/eos/newcmd");
    assert.match(String(client.sent.at(-1)?.args[0]), /Record Cue 1\/5 Enter$/);
  });

  it("delete_target requires confirm_delete", async () => {
    const { server, client } = createHarness({ consoleMode: "blind" });
    const blocked = await invokeTool(server, "delete_target", {
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

  it("label_target uses /eos/set/group/{n}/label", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "label_target", { target: "group", number: 1, label: "Wash" });
    assert.equal(client.sent.at(-1)?.address, "/eos/set/group/1/label");
    assert.equal(client.sent.at(-1)?.args[0], "Wash");
  });

  it("group_set_channels uses /eos/set/group/{n}/chans", async () => {
    const { server, client } = createHarness({ consoleMode: "blind", config: { requireConfirm: false } });
    await invokeTool(server, "group_set_channels", {
      group: 1,
      ranges: [{ from: 1, thru: 10 }],
    });
    assert.equal(client.sent.at(-1)?.address, "/eos/set/group/1/chans");
    assert.equal(client.sent.at(-1)?.args[0], "1 > 10");
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

  it("sync_show_targets + get_groups populate cache", async () => {
    const result = await invokeTool(server, "sync_show_targets", { cues: [1], presets: false, palettes: false, timeoutMs: 5000 });
    assert.equal(isToolError(result), false);
    const body = parseToolJson<{ groups: number }>(result);
    assert.equal(body.groups, 2);

    const groups = await invokeTool(server, "get_groups", {});
    assert.equal(parseToolJson<{ count: number }>(groups).count, 2);
  });
});
