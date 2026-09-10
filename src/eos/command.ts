export type CommandTerminator = "none" | "enter" | "hash";

export interface BuiltCommand {
  text: string;
  terminator: CommandTerminator;
}

export function buildCommand(
  text: string,
  terminator: CommandTerminator = "enter"
): BuiltCommand {
  const trimmed = text.trim();
  if (terminator === "hash") {
    return { text: trimmed.endsWith("#") ? trimmed : `${trimmed}#`, terminator };
  }
  if (terminator === "enter") {
    if (trimmed.endsWith("#") || /\benter$/i.test(trimmed)) {
      return { text: trimmed, terminator };
    }
    return { text: `${trimmed} Enter`, terminator };
  }
  return { text: trimmed, terminator };
}

export function commandOscArgs(command: BuiltCommand): [string] | [string, ...string[]] {
  return [command.text];
}
