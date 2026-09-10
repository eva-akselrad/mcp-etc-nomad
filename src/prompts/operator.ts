import type { McpServer } from "@modelcontextprotocol/server";
import type { EosContext } from "../eos/context.js";

const OPERATOR_INSTRUCTIONS = `You are controlling an ETC Eos Family lighting console (ETCnomad or hardware desk) via OSC.

Rules:
- Prefer typed tools (channel_set_level, cue_fire) over eos_command when available.
- Use eos_command for programming: Record, Patch, Copy, Label, Save, Export.
- Terminate commands with Enter or # (hash). Example: "Chan 1 At 75 Enter" or "Chan 1 At 75#".
- Before live playback changes, call get_console_state. If mode is "live", require explicit user confirmation.
- In multi-console sessions, OSC must target the session Host.
- Enable String RX in Nomad Setup → Show Control → OSC or command-line OSC may not work.

Common programming patterns:
- Record cue: select look → "Cue 5 Enter" → "Record Enter"
- Group: "Channel 1 Thru 10 Enter" → "Group 1 Enter" → "Label Group 1 \"Wash\" Enter"
- Copy cues: "Copy Cue 1 Thru 5 Cue 10 Enter"
`;

export function registerPrompts(server: McpServer, _ctx: EosContext): void {
  server.registerPrompt(
    "eos-operator",
    {
      title: "Eos operator instructions",
      description: "System guidance for safely controlling ETCnomad/Eos via MCP",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: OPERATOR_INSTRUCTIONS },
        },
      ],
    })
  );
}
