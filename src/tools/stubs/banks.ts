import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../../eos/context.js";

/** Phase 1: cue list banks, direct select banks — see PLAN.md */
export function registerBankTools(_server: McpServer, _ctx: EosContext): void {
  // Planned: cue_list_bank_config, direct_select_bank_create, ...
}
