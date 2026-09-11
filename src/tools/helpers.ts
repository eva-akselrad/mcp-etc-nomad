import type { EosContext } from "../eos/context.js";
import { assertLiveAllowed, type LiveWriteOptions } from "../eos/context.js";

export function jsonText(data: unknown): { type: "text"; text: string } {
  return { type: "text", text: JSON.stringify(data, null, 2) };
}

export function toolResult(data: unknown) {
  return { content: [jsonText(data)] };
}

export function toolError(message: string) {
  return { content: [jsonText({ error: message })], isError: true };
}

export function checkLiveWrite(ctx: EosContext, options?: LiveWriteOptions): string | null {
  return assertLiveAllowed(ctx, options);
}

/** Map edge param to OSC button value (1.0=down, 0.0=up). Tap sends a single press. */
export function buttonEdgeValue(edge?: "down" | "up" | "tap"): number | undefined {
  if (edge === "down") return 1.0;
  if (edge === "up") return 0.0;
  return 0;
}
