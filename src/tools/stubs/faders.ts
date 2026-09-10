import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../../eos/context.js";

/** Phase 1: fader banks, load/unload/stop/fire — see PLAN.md */
export function registerFaderTools(_server: McpServer, _ctx: EosContext): void {
  // Planned: fader_bank_config, fader_set_level, fader_load, ...
}
