import * as z from "zod/v4";

/** Shared channel range for Thru selections. */
export const channelRangeSchema = z.object({
  from: z.number().int().positive(),
  thru: z.number().int().positive(),
});

/** Lighting-ops channel selection (channels + ranges; legacy from/thru supported). */
export const channelSelectionFields = {
  channel: z.number().int().positive().optional(),
  channels: z.array(z.number().int().positive()).optional(),
  ranges: z.array(channelRangeSchema).optional(),
  from: z.number().int().positive().optional().describe("Legacy Thru start — prefer ranges[]"),
  thru: z.number().int().positive().optional().describe("Legacy Thru end — prefer ranges[]"),
  minus: z.array(z.number().int().positive()).optional().describe("Deselect via /eos/key/_-%"),
};

export const groupSelectionFields = {
  group: z.number().int().positive().optional(),
  groups: z.array(z.number().int().positive()).optional(),
  from: z.number().int().positive().optional(),
  thru: z.number().int().positive().optional(),
};

export const highlightStateSchema = z.enum(["on", "off", "toggle"]);

export const grandmasterLevelSchema = z
  .number()
  .min(0)
  .max(100)
  .describe("Grand master 0–100% (mapped to /eos/fader/0/1 as 0.0–1.0)");

export const goToCueBaseSchema = z.object({
  cue: z.union([z.number(), z.string()]).optional(),
  cueList: z.number().int().positive().optional(),
  out: z.boolean().optional().describe("Go To Cue Out — XOR with cue."),
});

/** cue XOR out — exactly one target required for CLI GTC. */
export function refineGoToCueXor<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).superRefine((data, ctx) => {
    const hasCue = (data as { cue?: unknown }).cue !== undefined;
    const hasOut = (data as { out?: boolean }).out === true;
    if (hasCue === hasOut) {
      ctx.addIssue({
        code: "custom",
        message: "Provide cue OR out=true (XOR), not both and not neither.",
      });
    }
  });
}

export function hasChannelSelection(input: {
  channel?: number;
  channels?: number[];
  ranges?: Array<{ from: number; thru: number }>;
  from?: number;
  thru?: number;
}): boolean {
  return (
    input.channel !== undefined ||
    input.from !== undefined ||
    (input.channels?.length ?? 0) > 0 ||
    (input.ranges?.length ?? 0) > 0
  );
}
