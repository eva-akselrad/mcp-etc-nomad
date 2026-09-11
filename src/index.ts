#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { EosClient } from "./eos/client.js";
import type { EosContext } from "./eos/context.js";
import { EosListener } from "./eos/listener.js";
import { registerPrompts } from "./prompts/operator.js";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

serveStdio(() => {
  const config = loadConfig();
  const client = new EosClient(config);
  const listener = new EosListener(config);
  listener.start();

  const ctx: EosContext = { config, client, listener, cueFireLog: [] };

  const server = new McpServer({
    name: "mcp-etc-nomad",
    version: "0.2.0",
  });

  registerTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, ctx);

  process.on("SIGINT", () => {
    void client.close();
    void listener.stop();
  });

  return server;
});
