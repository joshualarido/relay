import type { AppDatabase } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { preferences } from "./db/schema";
import { AppError } from "./errors";

export const timezoneSchema = z.string().max(100).refine((timezone) => {
  if (/^[+-]/.test(timezone)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); return true; } catch { return false; }
}, "Choose a valid IANA timezone.");

const inputSchema = z.object({
  timezone: timezoneSchema,
  weekStart: z.number().int().min(0).max(6),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

export function getPreferences(db: Pick<AppDatabase, "select">, userId: string) {
  return db.select().from(preferences).where(eq(preferences.userId, userId)).get()
    ?? { timezone: "Asia/Jakarta", weekStart: 1, revision: 0 };
}

export function savePreferences(db: AppDatabase, userId: string, input: unknown) {
  const data = inputSchema.parse(input);
  return db.transaction((tx) => {
    const current = getPreferences(tx, userId);
    if (current.revision !== data.expectedRevision) throw new AppError(409, "Preferences changed. Reload and try again.");
    tx.insert(preferences).values({
      userId, timezone: data.timezone, weekStart: data.weekStart, revision: current.revision + 1,
    }).onConflictDoUpdate({
      target: preferences.userId,
      set: { timezone: data.timezone, weekStart: data.weekStart, revision: current.revision + 1 },
    }).run();
    return getPreferences(tx, userId);
  }, { behavior: "immediate" });
}
