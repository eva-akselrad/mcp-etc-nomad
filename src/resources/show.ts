import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

export function registerShowResources(server: McpServer, ctx: EosContext): void {
  server.registerResource(
    "show-groups",
    "eos://show/groups",
    {
      title: "Show groups",
      description: "Cached groups and channel membership (sync via sync_show_targets)",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        groups: Object.values(state.groups),
        count: Object.keys(state.groups).length,
        lastSyncedAt: state.syncStatus.groupsAt ?? state.lastSyncedAt,
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "show-cuelists",
    "eos://show/cuelists",
    {
      title: "Cue lists",
      description: "Cached cue list index from OSC sync",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        cueLists: Object.values(state.cueLists),
        count: Object.keys(state.cueLists).length,
        lastSyncedAt: state.syncStatus.cueListsAt ?? state.lastSyncedAt,
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "show-cues",
    new ResourceTemplate("eos://show/cues/{list}", {
      list: async () => {
        const state = ctx.listener.getState();
        const lists = new Set<number>();
        for (const cl of Object.values(state.cueLists)) {
          lists.add(cl.number);
        }
        for (const cue of Object.values(state.cues)) {
          lists.add(cue.cueList);
        }
        return {
          resources: [...lists].sort((a, b) => a - b).map((list) => ({
            uri: `eos://show/cues/${list}`,
            name: `Cues in list ${list}`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Cues in a cue list",
      description: "Cached cues for a cue list — URI: eos://show/cues/{list}",
      mimeType: "application/json",
    },
    async (uri, { list }) => {
      const cueList = Number(list);
      const state = ctx.listener.getState();
      const cues = Object.values(state.cues).filter((c) => c.cueList === cueList);
      const payload = {
        cueList,
        cues,
        count: cues.length,
        lastSyncedAt: state.syncStatus.cuesAt[String(cueList)] ?? state.lastSyncedAt,
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );
}
