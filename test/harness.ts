import { McpServer } from "@modelcontextprotocol/server";
import type { ServerConfig } from "../src/config.js";
import type { EosContext } from "../src/eos/context.js";
import { EosListener } from "../src/eos/listener.js";
import { createInitialState, type ConsoleMode, type EosState } from "../src/eos/state.js";
import { registerTools } from "../src/tools/index.js";
import { RecordingEosClient } from "./recording-client.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
type ToolRegistry = Record<string, { handler: ToolHandler }>;

export type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

export interface TestHarness {
  server: McpServer;
  ctx: EosContext;
  client: RecordingEosClient;
  listener: EosListener;
}

export function makeTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const base = {
    host: "127.0.0.1",
    portTx: 18000,
    portRx: 19001,
    rxBind: "127.0.0.1",
    protocol: "udp" as const,
    tcpPort: 3037,
    userId: -1,
    allowLive: false,
    requireConfirm: true,
    maxCueFiresPerMinute: 12,
    eosVersion: "3.3.6",
    ...overrides,
  };
  const tcpPort = base.tcpPort;
  const tcpMode =
    overrides.tcpMode ??
    (tcpPort === 3032 ? "length" : tcpPort === 3037 ? "slip" : "length");
  const tcpOscVersion =
    overrides.tcpOscVersion ?? (tcpMode === "slip" ? "1.1" : "1.0");
  return { ...base, tcpMode, tcpOscVersion };
}

class StubListener {
  private state: EosState = createInitialState();

  constructor(mode: ConsoleMode = "unknown") {
    this.state.consoleMode = mode;
  }

  setConsoleMode(mode: ConsoleMode): void {
    this.state.consoleMode = mode;
  }

  getState(): EosState {
    return this.state;
  }

  start(): void {}
  async stop(): Promise<void> {}
  waitFor(): Promise<never> {
    return Promise.reject(new Error("waitFor not available in stub listener"));
  }
}

export function createHarness(options?: {
  config?: Partial<ServerConfig>;
  consoleMode?: ConsoleMode;
}): TestHarness {
  const config = makeTestConfig(options?.config);
  const client = new RecordingEosClient(config);
  const listener = new StubListener(options?.consoleMode ?? "unknown");
  const ctx: EosContext = {
    config,
    client: client as unknown as EosContext["client"],
    listener: listener as unknown as EosListener,
    cueFireLog: [],
  };

  const server = new McpServer({ name: "mcp-etc-nomad-test", version: "0.0.0-test" });
  registerTools(server, ctx);

  return { server, ctx, client, listener: listener as unknown as EosListener };
}

export function createLiveHarness(consoleMode: ConsoleMode = "live"): TestHarness {
  return createHarness({ consoleMode });
}

export async function invokeTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const tools = (server as unknown as { _registeredTools: ToolRegistry })._registeredTools;
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool not registered: ${name}`);
  }
  return tool.handler(args);
}

export function parseToolJson<T extends Record<string, unknown>>(result: ToolResult): T {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

export function isToolError(result: ToolResult): boolean {
  return Boolean(result.isError);
}
