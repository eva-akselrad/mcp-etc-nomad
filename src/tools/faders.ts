import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  faderAction,
  faderBankConfig,
  faderBankPage,
  faderBankReset,
  faderLevel,
  subFire,
} from "../eos/addresses.js";
import type { EosContext } from "../eos/context.js";
import { buttonEdgeValue, checkLiveWrite, toolError, toolResult } from "./helpers.js";

const liveSchema = {
  confirm: z.boolean().optional(),
  allowLive: z.boolean().optional(),
};

const faderActionSchema = z.enum([
  "load",
  "unload",
  "stop",
  "fire",
  "out",
  "home",
  "level",
  "min",
  "max",
  "full",
]);

export function registerFaderTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "fader_bank_config",
    {
      description:
        "Create or jump to an OSC fader bank page (/eos/fader/{bank}/config/{count} or /config/{page}/{count})",
      inputSchema: z.object({
        bank: z.number().int().min(0).describe("OSC fader bank index (0 = grand master)"),
        fadersPerPage: z.number().int().positive(),
        page: z.number().int().positive().optional(),
      }),
    },
    async ({ bank, fadersPerPage, page }) => {
      const address = faderBankConfig(bank, fadersPerPage, page);
      await ctx.client.send(address);
      return toolResult({ bank, fadersPerPage, page, address });
    }
  );

  server.registerTool(
    "fader_bank_page",
    {
      description: "Page an OSC fader bank up or down by pages",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        delta: z.number().int().describe("Positive = page down, negative = page up"),
      }),
    },
    async ({ bank, delta }) => {
      const address = faderBankPage(bank, delta);
      await ctx.client.send(address, delta);
      return toolResult({ bank, delta, address });
    }
  );

  server.registerTool(
    "fader_set_level",
    {
      description: "Set an OSC fader level (0.0-1.0)",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        level: z.number().min(0).max(1),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, level, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = faderLevel(bank, fader);
      await ctx.client.send(address, level);
      return toolResult({ bank, fader, level, address });
    }
  );

  server.registerTool(
    "fader_load",
    {
      description: "Load command-line content to a fader",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = faderAction(bank, fader, "load");
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ bank, fader, action: "load", address });
    }
  );

  server.registerTool(
    "fader_unload",
    {
      description: "Unload a fader target",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = faderAction(bank, fader, "unload");
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ bank, fader, action: "unload", address });
    }
  );

  server.registerTool(
    "fader_stop",
    {
      description: "Stop a running fader cue list",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = faderAction(bank, fader, "stop");
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ bank, fader, action: "stop", address });
    }
  );

  server.registerTool(
    "fader_fire",
    {
      description: "Fire (go) a fader target",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = faderAction(bank, fader, "fire");
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ bank, fader, action: "fire", address });
    }
  );

  server.registerTool(
    "fader_action",
    {
      description:
        "Run a fader action: load, unload, stop, fire, out, home, level, min, max, or full",
      inputSchema: z.object({
        bank: z.number().int().min(0),
        fader: z.number().int().positive(),
        action: faderActionSchema,
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ bank, fader, action, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = faderAction(bank, fader, action);
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ bank, fader, action, address });
    }
  );

  server.registerTool(
    "fader_bank_reset",
    {
      description: "Reset an OSC fader bank configuration",
      inputSchema: z.object({
        bank: z.number().int().positive(),
        confirm: z.boolean().optional(),
      }),
    },
    async ({ bank, confirm }) => {
      if (ctx.config.requireConfirm && !confirm) {
        return toolError("Pass confirm=true to reset fader bank.");
      }

      const address = faderBankReset(bank);
      await ctx.client.send(address);
      return toolResult({ bank, address });
    }
  );

  server.registerTool(
    "submaster_fire",
    {
      description: "Bump (fire) a submaster; use edge down/up for bump hold/release",
      inputSchema: z.object({
        sub: z.number().int().positive(),
        edge: z.enum(["down", "up", "tap"]).optional(),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ sub, edge, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const address = subFire(sub);
      await ctx.client.send(address, buttonEdgeValue(edge));
      return toolResult({ sub, edge, address });
    }
  );
}
