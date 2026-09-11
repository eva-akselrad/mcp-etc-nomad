import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

export function registerShowResources(server: McpServer, ctx: EosContext): void {
  server.registerResource(
    "show-groups",
    "eos://show/groups",
    {
      title: "Show groups",
      description: "Cached groups (sync via sync_show_targets)",
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
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
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
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerResource(
    "show-cues",
    new ResourceTemplate("eos://show/cues/{list}", {
      list: async () => {
        const state = ctx.listener.getState();
        const lists = new Set<number>();
        for (const cl of Object.values(state.cueLists)) lists.add(cl.number);
        for (const cue of Object.values(state.cues)) lists.add(cue.cueList);
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
      description: "Cached cues — URI: eos://show/cues/{list}",
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
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerResource(
    "show-patch",
    "eos://show/patch",
    {
      title: "Show patch",
      description: "Cached patch channels (sync via sync_show_targets patch=true)",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        patch: Object.values(state.patch),
        count: Object.keys(state.patch).length,
        lastSyncedAt: state.syncStatus.patchAt ?? state.lastSyncedAt,
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerResource(
    "show-presets",
    "eos://show/presets",
    {
      title: "Show presets",
      description: "Cached presets from sync_show_targets",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = ctx.listener.getState();
      const payload = {
        presets: Object.values(state.presets),
        count: Object.keys(state.presets).length,
        lastSyncedAt: state.syncStatus.presetsAt ?? state.lastSyncedAt,
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerResource(
    "show-palettes",
    new ResourceTemplate("eos://show/palettes/{type}", {
      list: async () => ({
        resources: (["ip", "fp", "cp", "bp"] as const).map((type) => ({
          uri: `eos://show/palettes/${type}`,
          name: `${type.toUpperCase()} palettes`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Show palettes",
      description: "Cached palettes — URI: eos://show/palettes/{type} (ip|fp|cp|bp)",
      mimeType: "application/json",
    },
    async (uri, { type }) => {
      const paletteType = String(type) as "ip" | "fp" | "cp" | "bp";
      const state = ctx.listener.getState();
      const palettes = Object.values(state.palettes).filter((p) => p.type === paletteType);
      const payload = {
        type: paletteType,
        palettes,
        count: palettes.length,
        lastSyncedAt: state.syncStatus.palettesAt[paletteType] ?? state.lastSyncedAt,
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );
}
