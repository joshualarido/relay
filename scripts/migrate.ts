import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../src/lib/db";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = openDatabase(process.env.DATABASE_URL || "./data/relay.db");
try {
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("SQLite migrations applied.");
} finally {
  db.$client.close();
}
