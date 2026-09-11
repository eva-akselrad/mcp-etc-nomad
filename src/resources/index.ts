import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";
import { oscKeyCatalog } from "../eos/keys.js";
import { registerPlaybackResources } from "./playback.js";

/** Phase 2: eos://show/patch, groups, cuelists — see PLAN.md */
export function registerShowResources(_server: McpServer, _ctx: EosContext): void {
  // Planned show-file resources after sync_show_targets is implemented.
}

export function registerResources(server: McpServer, ctx: EosContext): void {
  registerPlaybackResources(server, ctx);
  registerKeyResources(server);
}

function registerKeyResources(server: McpServer): void {
  server.registerResource(
    "console-keys",
    "eos://console/keys",
    {
      title: "OSC hardkey map",
      description: "ETC OSC Dictionary subset: playback/programming keys and aliases",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(oscKeyCatalog(), null, 2),
        },
      ],
    })
  );
}
