import type { ServerConfig } from "../config.js";
import type { EosClient } from "../eos/client.js";
import type { EosListener } from "../eos/listener.js";

export interface EosContext {
  config: ServerConfig;
  client: EosClient;
  listener: EosListener;
}

export function assertLiveAllowed(ctx: EosContext, confirm?: boolean): string | null {
  const state = ctx.listener.getState();
  if (state.consoleMode === "live" && !ctx.config.allowLive) {
    if (!confirm) {
      return "Console is LIVE. Pass confirm=true to execute, or set EOS_ALLOW_LIVE=true.";
    }
  }
  if (ctx.config.requireConfirm && !confirm) {
    return "Pass confirm=true to execute this action.";
  }
  return null;
}
