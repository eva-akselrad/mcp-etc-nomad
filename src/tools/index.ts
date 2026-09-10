import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";
import { registerCommandTools } from "./command.js";
import { registerLevelTools } from "./levels.js";
import { registerPlaybackTools } from "./playback.js";
import { registerQueryTools } from "./queries.js";

/** Phase 1+ tool modules — stubs exported for planned expansion. */
export { registerFaderTools } from "./stubs/faders.js";
export { registerPaletteTools } from "./stubs/palettes.js";
export { registerBankTools } from "./stubs/banks.js";

export function registerTools(server: McpServer, ctx: EosContext): void {
  registerCommandTools(server, ctx);
  registerLevelTools(server, ctx);
  registerPlaybackTools(server, ctx);
  registerQueryTools(server, ctx);
}
