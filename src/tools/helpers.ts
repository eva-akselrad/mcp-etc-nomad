import * as z from "zod/v4";
import type { EosContext } from "../eos/context.js";
import { assertCueFireRate, assertLiveAllowed, type LiveWriteOptions } from "../eos/context.js";

export const liveWriteFields = {
  confirm: z
    .boolean()
    .optional()
    .describe("Required when EOS_REQUIRE_CONFIRM=true (default). Confirms a live-show write."),
  allow_live: z
    .boolean()
    .optional()
    .describe(
      "Required when the console is LIVE (or state is unknown) and EOS_ALLOW_LIVE is false."
    ),
};

export const cueFireFields = {
  ...liveWriteFields,
  override_rate_limit: z
    .boolean()
    .optional()
    .describe(
      "Bypass the cue-fire rate limit (default 12/min). Separate from confirm — confirm does NOT bypass rate limits."
    ),
};

export type LiveWriteInput = {
  confirm?: boolean;
  allow_live?: boolean;
  override_rate_limit?: boolean;
};

export function jsonResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function gateLiveWrite(ctx: EosContext, options: LiveWriteOptions) {
  const blocked = assertLiveAllowed(ctx, options);
  if (blocked) {
    return jsonResult({ ok: false, error: blocked }, true);
  }
  return null;
}

export type DestructiveWriteOptions = LiveWriteOptions & {
  confirm_delete?: boolean;
};

export type SystemWriteOptions = LiveWriteOptions & {
  /** Explicit user intent for system/show-file operations (PLAN §8). */
  user_intent?: string;
};

export type ShowSaveOptions = SystemWriteOptions & {
  /** Second Enter / desk confirm for Save dialogs (Eos OSC domain). */
  confirm_save?: boolean;
};

export type LoadMergeOptions = SystemWriteOptions & {
  /** Confirms echoed load/merge path with second Enter (Eos OSC domain). */
  confirm_path?: boolean;
};

const loadMergeFields = {
  confirm_path: z
    .boolean()
    .optional()
    .describe(
      "Required when EOS_REQUIRE_CONFIRM=true. Sends second Enter after Browser path echo / confirm dialog."
    ),
};

const systemWriteFields = {
  user_intent: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Required: short description of why this system/show operation is being performed."
    ),
};

const showSaveFields = {
  confirm_save: z
    .boolean()
    .optional()
    .describe(
      "Required when EOS_REQUIRE_CONFIRM=true. Sends second Enter after Save (desk confirm dialog)."
    ),
};

export { loadMergeFields, showSaveFields, systemWriteFields };

/** System/show-file writes require confirm and user_intent when EOS_REQUIRE_CONFIRM=true. */
export function gateSystemWrite(ctx: EosContext, options: SystemWriteOptions) {
  const live = gateLiveWrite(ctx, options);
  if (live) return live;

  if (ctx.config.requireConfirm && !options.user_intent?.trim()) {
    return jsonResult(
      {
        ok: false,
        error:
          "Pass user_intent with a short description of this system operation (EOS_REQUIRE_CONFIRM=true).",
      },
      true
    );
  }
  return null;
}

/** Save operations need confirm_save for second Enter when gating is on. */
export function gateShowSave(ctx: EosContext, options: ShowSaveOptions) {
  const blocked = gateSystemWrite(ctx, options);
  if (blocked) return blocked;

  if (ctx.config.requireConfirm && !options.confirm_save) {
    return jsonResult(
      {
        ok: false,
        error:
          "Pass confirm_save=true for save operations — desk often needs a second Enter (EOS_REQUIRE_CONFIRM=true).",
      },
      true
    );
  }
  return null;
}

/**
 * Load/merge always require user_intent and prefer Blind/offline.
 * Never auto-load — opens Browser only.
 */
export function gateLoadMerge(ctx: EosContext, options: LoadMergeOptions) {
  if (!options.user_intent?.trim()) {
    return jsonResult(
      {
        ok: false,
        error:
          "Pass user_intent describing which show to load/merge. Load/merge is never automatic.",
      },
      true
    );
  }

  const mode = ctx.listener.getState().consoleMode;
  if ((mode === "live" || mode === "unknown") && !options.allow_live) {
    return jsonResult(
      {
        ok: false,
        error:
          "Prefer Blind/offline for load/merge. Pass allow_live=true to open Browser while LIVE.",
      },
      true
    );
  }

  const system = gateSystemWrite(ctx, options);
  if (system) return system;

  if (ctx.config.requireConfirm && !options.confirm_path) {
    return jsonResult(
      {
        ok: false,
        error:
          "Pass confirm_path=true for load/merge — desk confirms echoed path with second Enter (EOS_REQUIRE_CONFIRM=true).",
      },
      true
    );
  }

  return null;
}

export function gateDestructiveWrite(ctx: EosContext, options: DestructiveWriteOptions) {
  const live = gateLiveWrite(ctx, options);
  if (live) return live;

  if (ctx.config.requireConfirm && !options.confirm_delete) {
    return jsonResult(
      {
        ok: false,
        error:
          "Pass confirm_delete=true for destructive delete operations (EOS_REQUIRE_CONFIRM=true).",
      },
      true
    );
  }
  return null;
}

export function gateCueFire(ctx: EosContext, options: LiveWriteInput) {
  const live = gateLiveWrite(ctx, options);
  if (live) return live;
  const rate = assertCueFireRate(ctx, options.override_rate_limit);
  if (rate) {
    return jsonResult({ ok: false, error: rate }, true);
  }
  return null;
}

/** Force Patch display entry on Live desk before patch CLI tools. */
export function ensurePatchDisplay(ctx: EosContext): boolean {
  const mode = ctx.listener.getState().consoleMode;
  return mode === "live" || mode === "unknown";
}

export async function sendButton(
  ctx: EosContext,
  address: string,
  edge?: "down" | "up" | "tap"
): Promise<void> {
  if (edge === "down") {
    await ctx.client.send(address, 1.0);
    return;
  }
  if (edge === "up") {
    await ctx.client.send(address, 0.0);
    return;
  }
  await ctx.client.send(address, 1.0);
  await ctx.client.send(address, 0.0);
}
