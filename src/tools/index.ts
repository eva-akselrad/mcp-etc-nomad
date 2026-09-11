import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";
import { registerBankTools } from "./banks.js";
import { registerCommandTools } from "./command.js";
import { registerFaderTools } from "./faders.js";
import { registerKeysMacroTools } from "./keys_macros.js";
import { registerLevelTools } from "./levels.js";
import { registerPaletteTools } from "./palettes.js";
import { registerPlaybackTools } from "./playback.js";
import { registerQueryTools } from "./queries.js";

export function registerTools(server: McpServer, ctx: EosContext): void {
  registerCommandTools(server, ctx);
  registerLevelTools(server, ctx);
  registerPlaybackTools(server, ctx);
  registerFaderTools(server, ctx);
  registerPaletteTools(server, ctx);
  registerBankTools(server, ctx);
  registerKeysMacroTools(server, ctx);
  registerQueryTools(server, ctx);
}
