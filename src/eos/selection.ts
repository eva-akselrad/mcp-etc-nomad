import { channelSelect, groupSelect, keyPress } from "./addresses.js";
import type { EosContext } from "./context.js";

async function tapKey(ctx: EosContext, address: string): Promise<void> {
  await ctx.client.send(address, 1.0);
  await ctx.client.send(address, 0.0);
}

export interface ChannelSelectionInput {
  channel?: number;
  channels?: number[];
  from?: number;
  thru?: number;
}

export interface GroupSelectionInput {
  group?: number;
  groups?: number[];
  from?: number;
  thru?: number;
}

/** Send OSC channel selection steps (Thru / + / − via Dictionary keys). */
export async function sendChannelSelection(
  ctx: EosContext,
  input: ChannelSelectionInput
): Promise<string[]> {
  const sent: string[] = [];
  const items: Array<number | "thru" | "plus"> = [];

  if (input.channel !== undefined) {
    items.push(input.channel);
  }
  if (input.from !== undefined) {
    items.push(input.from);
    if (input.thru !== undefined) {
      items.push("thru", input.thru);
    }
  }
  for (const ch of input.channels ?? []) {
    if (items.length > 0) {
      items.push("plus");
    }
    items.push(ch);
  }

  if (items.length === 0) {
    throw new Error("Provide channel, channels, or from/thru for selection.");
  }

  for (const item of items) {
    if (item === "thru") {
      await tapKey(ctx, keyPress("thru"));
      sent.push("/eos/key/thru");
      continue;
    }
    if (item === "plus") {
      await tapKey(ctx, keyPress("+"));
      sent.push("/eos/key/+");
      continue;
    }
    await ctx.client.send(channelSelect(), item);
    sent.push(`/eos/chan (${item})`);
  }

  return sent;
}

/** Send OSC group selection (group number, optional Thru range). */
export async function sendGroupSelection(
  ctx: EosContext,
  input: GroupSelectionInput
): Promise<string[]> {
  const sent: string[] = [];
  const groups: number[] = [];

  if (input.group !== undefined) {
    groups.push(input.group);
  }
  if (input.from !== undefined) {
    groups.length = 0;
    await ctx.client.send(groupSelect(), input.from);
    sent.push(`/eos/group (${input.from})`);
    if (input.thru !== undefined) {
      await tapKey(ctx, keyPress("thru"));
      sent.push("/eos/key/thru");
      await ctx.client.send(groupSelect(), input.thru);
      sent.push(`/eos/group (${input.thru})`);
    }
    return sent;
  }
  for (const g of input.groups ?? groups) {
    if (sent.length > 0) {
      await tapKey(ctx, keyPress("+"));
      sent.push("/eos/key/+");
    }
    await ctx.client.send(groupSelect(), g);
    sent.push(`/eos/group (${g})`);
  }

  if (sent.length === 0) {
    throw new Error("Provide group, groups, or from/thru for group selection.");
  }
  return sent;
}

/** Adjust selection level via +% or -% keys (Dictionary). */
export async function sendLevelAdjust(
  ctx: EosContext,
  direction: "plus" | "minus"
): Promise<string> {
  const key = direction === "plus" ? "_+%" : "_-%";
  await tapKey(ctx, keyPress(key));
  return `/eos/key/${key}`;
}
