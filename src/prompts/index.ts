import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";
import { registerLivePrompt } from "./live.js";
import { registerOperatorPrompt } from "./operator.js";

export function registerPrompts(server: McpServer, ctx: EosContext): void {
  registerOperatorPrompt(server, ctx);
  registerLivePrompt(server, ctx);
}
