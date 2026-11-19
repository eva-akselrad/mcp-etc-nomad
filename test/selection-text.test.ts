import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChannelSelectionText, sendChannelSelection } from "../src/eos/selection.js";
import type { EosContext } from "../src/eos/context.js";

function fakeCtx() {
  const sent: unknown[][] = [];
  const ctx = {
    client: {
      send: async (address: string, ...args: unknown[]) => {
        sent.push([address, ...args]);
      },
    },
  } as unknown as EosContext;
  return { ctx, sent };
}

describe("channel selection text", () => {
  it("builds Thru / + / - selections", () => {
    assert.equal(buildChannelSelectionText([201, "thru", 208, "plus", 210, "minus", 205]), "Chan 201 Thru 208 + 210 - 205");
  });

  it("selects a single channel in one newcmd (no bare /eos/chan)", async () => {
    const { ctx, sent } = fakeCtx();
    await sendChannelSelection(ctx, { channel: 205 });
    assert.deepEqual(sent, [["/eos/newcmd", "Chan 205"]]);
  });

  it("can terminate the selection with Enter for read-only readback", async () => {
    const { ctx, sent } = fakeCtx();
    await sendChannelSelection(ctx, { channel: 205 }, { enter: true });
    assert.deepEqual(sent, [["/eos/newcmd", "Chan 205 Enter"]]);
  });

  it("combines ranges, channels and minus", async () => {
    const { ctx, sent } = fakeCtx();
    await sendChannelSelection(ctx, { ranges: [{ from: 201, thru: 208 }], channels: [301], minus: [204] });
    assert.deepEqual(sent, [["/eos/newcmd", "Chan 201 Thru 208 + 301 - 204"]]);
  });
});
