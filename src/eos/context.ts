import type { ServerConfig } from "../config.js";
import type { EosClient } from "../eos/client.js";
import type { EosListener } from "../eos/listener.js";

export interface EosContext {
  config: ServerConfig;
  client: EosClient;
  listener: EosListener;
}

export interface LiveWriteOptions {
  confirm?: boolean;
  allowLive?: boolean;
}

export function assertLiveAllowed(ctx: EosContext, options?: LiveWriteOptions): string | null {
  const { confirm, allowLive } = options ?? {};
  const state = ctx.listener.getState();

  if (ctx.config.requireConfirm && !confirm) {
    return "Pass confirm=true to execute this action.";
  }

  if (state.consoleMode === "live" && !ctx.config.allowLive && !allowLive) {
    return "Console is LIVE. Pass allow_live=true on this call, or set EOS_ALLOW_LIVE=true.";
  }

  return null;
}
