import type { ServerConfig } from "../config.js";
import type { EosClient } from "../eos/client.js";
import type { EosListener } from "../eos/listener.js";

export interface EosContext {
  config: ServerConfig;
  client: EosClient;
  listener: EosListener;
  /** Timestamps of recent cue fires for rate limiting. */
  cueFireLog: number[];
}

export interface LiveWriteOptions {
  confirm?: boolean;
  allow_live?: boolean;
  /** Bypass cue-fire rate limit (separate from confirm). */
  override_rate_limit?: boolean;
}

export function assertLiveAllowed(
  ctx: EosContext,
  confirmOrOptions?: boolean | LiveWriteOptions
): string | null {
  const options: LiveWriteOptions =
    typeof confirmOrOptions === "boolean" ? { confirm: confirmOrOptions } : (confirmOrOptions ?? {});

  if (ctx.config.requireConfirm && !options.confirm) {
    return "Pass confirm=true to execute this action (EOS_REQUIRE_CONFIRM=true).";
  }

  const mode = ctx.listener.getState().consoleMode;
  const potentiallyLive = mode === "live" || mode === "unknown";
  if (potentiallyLive && !ctx.config.allowLive && !options.allow_live) {
    const where = mode === "unknown" ? "LIVE or unconfirmed (no /eos/out/event/state yet)" : "LIVE";
    return (
      `Console is ${where}. Pass allow_live=true to execute, or set EOS_ALLOW_LIVE=true. ` +
      "Read get_console_state or eos://playback/state first."
    );
  }

  return null;
}

export function assertCueFireRate(ctx: EosContext, overrideRateLimit?: boolean): string | null {
  const now = Date.now();
  const windowMs = 60_000;
  const max = ctx.config.maxCueFiresPerMinute;
  ctx.cueFireLog = ctx.cueFireLog.filter((t) => now - t < windowMs);
  if (ctx.cueFireLog.length >= max && !overrideRateLimit) {
    return (
      `Cue fire rate limit: ${max} playback actions per minute. ` +
      "Pass override_rate_limit=true to bypass, or wait before firing again."
    );
  }
  ctx.cueFireLog.push(now);
  return null;
}
