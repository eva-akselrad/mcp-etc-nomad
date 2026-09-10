import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";
import { registerPlaybackResources } from "./playback.js";

/** Phase 2: eos://show/patch, groups, cuelists — see PLAN.md */
export function registerShowResources(_server: McpServer, _ctx: EosContext): void {
  // Planned show-file resources after sync_show_targets is implemented.
}

export function registerResources(server: McpServer, ctx: EosContext): void {
  registerPlaybackResources(server, ctx);
}
