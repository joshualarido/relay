import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../../src/lib/db";
import { authOptions } from "../../src/lib/auth-options";

export function assertTestTarget(path: string, baseURL: string) {
  const url = new URL(baseURL);
  const resolved = resolve(path);
  const roots = [resolve(tmpdir()) + sep, resolve(".artifacts") + sep];
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !roots.some((root) => resolved.startsWith(root)) ||
      !resolved.includes("relay-test-") ||
      resolved === resolve(process.env.DATABASE_URL || "./data/relay.db")) {
    throw new Error("Tests require a dedicated relay-test- SQLite path and an HTTP loopback origin.");
  }
}

export async function testWorkspace(options?: { path: string; baseURL: string; secret: string }) {
  const path = options?.path || join(mkdtempSync(join(tmpdir(), "relay-test-")), "test.db");
  const baseURL = options?.baseURL || "http://127.0.0.1:3100";
  const secret = options?.secret || randomBytes(48).toString("base64url");
  assertTestTarget(path, baseURL);
  const db = openDatabase(path);
  migrate(db, { migrationsFolder: "./drizzle" });
  const config = authOptions(db, { baseURL, secret });
  const auth = betterAuth({ ...config, plugins: [testUtils()] });
  const helpers = (await auth.$context).test;
  const alice = await helpers.saveUser(helpers.createUser({ name: "Alice", email: `${crypto.randomUUID()}@example.test` }));
  const bob = await helpers.saveUser(helpers.createUser({ name: "Bob", email: `${crypto.randomUUID()}@example.test` }));
  return { db, path, config, auth, helpers, alice, bob, close: () => db.$client.close() };
}
