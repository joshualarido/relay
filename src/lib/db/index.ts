import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export function openDatabase(path: string) {
  if (!path || path.includes("://") || path === ":memory:") {
    throw new Error("DATABASE_URL must be a persistent SQLite filesystem path.");
  }
  const filename = resolve(path);
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("cache_size = -16000");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof openDatabase>;
let database: AppDatabase | undefined;

export function getDatabase() {
  database ??= openDatabase(process.env.DATABASE_URL || "./data/relay.db");
  return database;
}
