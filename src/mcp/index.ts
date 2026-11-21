import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDatabase } from "../lib/db";
import { resolveDefaultOwnerId } from "./context";
import { createRelayMcpServer } from "./server";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  const envPath = join(projectRoot, ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  const configuredDb = process.env.DATABASE_URL || "./data/relay.db";
  const dbPath = isAbsolute(configuredDb) ? configuredDb : resolve(projectRoot, configuredDb);
  const db = openDatabase(dbPath);
  const server = createRelayMcpServer({
    db,
    resolveOwnerId: () => resolveDefaultOwnerId(db),
  });

  const transport = new StdioServerTransport();
  let closed = false;
  const shutdown = () => {
    if (closed) return;
    closed = true;
    try {
      db.$client.close();
    } catch {
      // Ignore close errors during shutdown.
    }
  };

  transport.onclose = shutdown;
  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`Relay MCP server failed to start: ${message}\n`);
  process.exit(1);
});
