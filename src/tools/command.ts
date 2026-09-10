import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildCommand } from "../eos/command.js";
import type { EosContext } from "../eos/context.js";
import { assertLiveAllowed } from "../eos/context.js";

const terminatorSchema = z.enum(["none", "enter", "hash"]).optional();

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
        confirm: z.boolean().optional().describe("Required when EOS_REQUIRE_CONFIRM=true"),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ text, terminator, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      const built = buildCommand(text, terminator ?? "enter");
      await ctx.client.send("/eos/cmd", built.text);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sent: built.text, path: "/eos/cmd" }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "eos_new_command",
    {
      description: "Clear the command line, then send an instruction via /eos/newcmd",
      inputSchema: z.object({
        text: z.string(),
        terminator: terminatorSchema,
        confirm: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ text, terminator, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      const built = buildCommand(text, terminator ?? "enter");
      await ctx.client.send("/eos/newcmd", built.text);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sent: built.text, path: "/eos/newcmd" }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "eos_event",
    {
      description: "Send a console event via /eos/event (same syntax as eos_command)",
      inputSchema: z.object({
        text: z.string(),
        terminator: terminatorSchema,
        confirm: z.boolean().optional(),
      }),
    },
    async ({ text, terminator, confirm }) => {
      const blocked = assertLiveAllowed(ctx, confirm);
      if (blocked) {
        return { content: [{ type: "text" as const, text: blocked }], isError: true };
      }

      const built = buildCommand(text, terminator ?? "enter");
      await ctx.client.send("/eos/event", built.text);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sent: built.text, path: "/eos/event" }, null, 2),
          },
        ],
      };
    }
  );
}
