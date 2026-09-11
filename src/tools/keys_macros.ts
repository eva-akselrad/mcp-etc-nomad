import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { keyPress, macroFire, macroSelect, softkeyPress, stagingModeKey } from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { describeOscKey, normalizeOscKey, oscKeyCatalog } from "../eos/keys.js";
import { gateLiveWrite, jsonResult, liveWriteFields, sendButton } from "./helpers.js";

export function registerKeyMacroTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "key_press",
    {
      description:
        "Press an Eos hardkey by OSC name (e.g. go_0, stop, live, sneak, enter). Aliases: go, stop_back, staging. See eos://console/keys.",
      inputSchema: z.object({
        key: z.string().describe("OSC key name or alias from the Eos OSC Dictionary"),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ key, edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      let oscName: string;
      try {
        oscName = normalizeOscKey(key);
      } catch (error) {
        return jsonResult({ ok: false, error: error instanceof Error ? error.message : String(error) }, true);
      }

      const address = keyPress(oscName);
      await sendButton(ctx, address, edge);
      const info = describeOscKey(oscName);
      return jsonResult({
        ok: true,
        action: "key_press",
        address,
        key: oscName,
        requested: key,
        edge: edge ?? "tap",
        description: info?.description,
      });
    }
  );

  server.registerTool(
    "softkey_press",
    {
      description: "Press a CIA softkey 1–12 (two pages of six) via /eos/softkey/{n}",
      inputSchema: z.object({
        softkey: z.number().int().min(1).max(12),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ softkey, edge, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = softkeyPress(softkey);
      await sendButton(ctx, address, edge);
      return jsonResult({ ok: true, action: "softkey_press", address, softkey, edge: edge ?? "tap" });
    }
  );

  server.registerTool(
    "macro_select",
    {
      description: "Select a macro on the command line via /eos/macro",
      inputSchema: z.object({
        macro: z.number().int().positive(),
      }),
    },
    async ({ macro }) => {
      await ctx.client.send(macroSelect(), macro);
      return jsonResult({ ok: true, action: "macro_select", macro });
    }
  );

  server.registerTool(
    "macro_fire",
    {
      description:
        "Run a macro by number via /eos/macro/fire. Requires confirm_macro in addition to confirm when EOS_REQUIRE_CONFIRM=true.",
      inputSchema: z.object({
        macro: z.number().int().positive(),
        confirm_macro: z
          .boolean()
          .optional()
          .describe(
            "Required when EOS_REQUIRE_CONFIRM=true — explicit macro-fire confirmation (separate from confirm)."
          ),
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ macro, confirm_macro, confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      if (ctx.config.requireConfirm && !confirm_macro) {
        return jsonResult(
          {
            ok: false,
            error:
              "Pass confirm_macro=true to fire a macro (EOS_REQUIRE_CONFIRM=true). Echo the macro number/label before firing.",
            macro,
          },
          true
        );
      }

      const state = ctx.listener.getState();
      const macroLabel = state.labels[`macro/${macro}`];
      const address = macroFire();
      await ctx.client.send(address, macro);
      return jsonResult({
        ok: true,
        action: "macro_fire",
        address,
        macro,
        label: macroLabel,
        echoed: `Macro ${macro}${macroLabel ? ` "${macroLabel}"` : ""}`,
      });
    }
  );

  server.registerTool(
    "staging_mode_toggle",
    {
      description: "Toggle Staging Mode via /eos/key/staging_mode",
      inputSchema: z.object({
        ...liveWriteFields,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ confirm, allow_live }) => {
      const blocked = gateLiveWrite(ctx, { confirm, allow_live });
      if (blocked) return blocked;

      const address = stagingModeKey();
      await sendButton(ctx, address);
      return jsonResult({ ok: true, action: "staging_mode_toggle", address });
    }
  );

  server.registerTool(
    "list_osc_keys",
    {
      description:
        "Return the Phase 1 OSC hardkey mapping table (ETC OSC Dictionary subset + aliases)",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => jsonResult(oscKeyCatalog())
  );
}
