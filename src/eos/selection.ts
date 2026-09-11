import { channelSelect, groupSelect, keyPress } from "./addresses.js";
import type { EosContext } from "./context.js";

async function tapKey(ctx: EosContext, address: string): Promise<void> {
  await ctx.client.send(address, 1.0);
  await ctx.client.send(address, 0.0);
}

export interface ChannelRange {
  from: number;
  thru: number;
}

export interface ChannelSelectionInput {
  channel?: number;
  channels?: number[];
  ranges?: ChannelRange[];
  from?: number;
  thru?: number;
  minus?: number[];
}

export interface GroupSelectionInput {
  group?: number;
  groups?: number[];
  from?: number;
  thru?: number;
}

function expandLegacyRange(input: ChannelSelectionInput): ChannelRange[] {
  const ranges = [...(input.ranges ?? [])];
  if (input.from !== undefined) {
    ranges.push({ from: input.from, thru: input.thru ?? input.from });
  }
  return ranges;
}

/** Send OSC channel selection steps (Thru / + / − via Dictionary keys). */
export async function sendChannelSelection(
  ctx: EosContext,
  input: ChannelSelectionInput
): Promise<string[]> {
  const sent: string[] = [];
  const items: Array<number | "thru" | "plus" | "minus"> = [];

  if (input.channel !== undefined) {
    items.push(input.channel);
  }

  for (const range of expandLegacyRange(input)) {
    if (items.length > 0) {
      items.push("plus");
    }
    items.push(range.from);
    if (range.thru !== range.from) {
      items.push("thru", range.thru);
    }
  }

  for (const ch of input.channels ?? []) {
    if (items.length > 0) {
      items.push("plus");
    }
    items.push(ch);
  }

  for (const ch of input.minus ?? []) {
    if (items.length > 0) {
      items.push("minus");
    }
    items.push(ch);
  }

  if (items.length === 0) {
    throw new Error("Provide channel, channels, ranges, or from/thru for selection.");
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
    if (item === "minus") {
      await tapKey(ctx, keyPress("_-%"));
      sent.push("/eos/key/_-%");
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
