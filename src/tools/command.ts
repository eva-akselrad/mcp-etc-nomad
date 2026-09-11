import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import { checkLiveWrite, toolError, toolResult } from "./helpers.js";

const terminatorSchema = z.enum(["none", "enter", "hash"]).optional();

const liveSchema = {
  confirm: z.boolean().optional(),
  allowLive: z.boolean().optional(),
};

export function registerCommandTools(server: McpServer, ctx: EosContext): void {
  server.registerTool(
    "eos_command",
    {
      description:
        "Send an Eos command-line instruction via OSC (/eos/cmd). Use for record, patch, copy, save, and any CLI-only operations.",
      inputSchema: z.object({
        text: z.string().describe("Eos command line text, e.g. 'Chan 1 At 75'"),
        terminator: terminatorSchema.describe(
          "How to terminate: enter (default), hash (#), or none"
        ),
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ text, terminator, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const built = buildCommand(text, terminator ?? "enter");
      await ctx.client.send("/eos/cmd", built.text);

      return toolResult({ sent: built.text, path: "/eos/cmd" });
    }
  );

  server.registerTool(
    "eos_new_command",
    {
      description: "Clear the command line, then send an instruction via /eos/newcmd",
      inputSchema: z.object({
        text: z.string(),
        terminator: terminatorSchema,
        ...liveSchema,
      }),
      annotations: { destructiveHint: true },
    },
    async ({ text, terminator, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const built = buildCommand(text, terminator ?? "enter");
      await ctx.client.send("/eos/newcmd", built.text);

      return toolResult({ sent: built.text, path: "/eos/newcmd" });
    }
  );

  server.registerTool(
    "eos_event",
    {
      description: "Send a console event via /eos/event (same syntax as eos_command)",
      inputSchema: z.object({
        text: z.string(),
        terminator: terminatorSchema,
        ...liveSchema,
      }),
    },
    async ({ text, terminator, confirm, allowLive }) => {
      const blocked = checkLiveWrite(ctx, { confirm, allowLive });
      if (blocked) return toolError(blocked);

      const built = buildCommand(text, terminator ?? "enter");
      await ctx.client.send("/eos/event", built.text);

      return toolResult({ sent: built.text, path: "/eos/event" });
    }
  );
}
