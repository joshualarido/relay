import type { AppDatabase } from "./db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { dayWorkingHoursOverride, preferences } from "./db/schema";
import {
  DEFAULT_TASK_TYPE_MINUTES,
  DEFAULT_WORKING_HOURS,
  dayWorkingWindowSchema,
  legacyWindowToHours,
  parseTaskTypeMinutes,
  parseWorkingHours,
  taskTypeMinutesSchema,
  weeklyWorkingHoursSchema,
  type DayWorkingWindow,
  type TaskTypeMinutes,
  type WeeklyWorkingHours,
} from "./capacity";
import { dateOnlySchema } from "./dates";
import { AppError } from "./errors";

export const timezoneSchema = z.string().max(100).refine((timezone) => {
  if (/^[+-]/.test(timezone)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); return true; } catch { return false; }
}, "Choose a valid IANA timezone.");

const inputSchema = z.object({
  timezone: timezoneSchema,
  weekStart: z.number().int().min(0).max(6),
  workingHours: weeklyWorkingHoursSchema.optional(),
  taskTypeMinutes: taskTypeMinutesSchema.optional(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

export type UserPreferences = {
  timezone: string;
  weekStart: number;
  workingHours: WeeklyWorkingHours;
  taskTypeMinutes: TaskTypeMinutes;
  revision: number;
};

export function getPreferences(db: Pick<AppDatabase, "select">, userId: string): UserPreferences {
  const row = db.select().from(preferences).where(eq(preferences.userId, userId)).get();
  if (!row) {
    return {
      timezone: "Asia/Jakarta",
      weekStart: 1,
      workingHours: DEFAULT_WORKING_HOURS,
      taskTypeMinutes: DEFAULT_TASK_TYPE_MINUTES,
      revision: 0,
    };
  }
  return {
    timezone: row.timezone,
    weekStart: row.weekStart,
    workingHours: parseWorkingHours(row.workingHoursJson),
    taskTypeMinutes: parseTaskTypeMinutes(row.taskTypeMinutesJson),
    revision: row.revision,
  };
}

export function savePreferences(db: AppDatabase, userId: string, input: unknown): UserPreferences {
  const data = inputSchema.parse(input);
  return db.transaction((tx) => {
    const current = getPreferences(tx, userId);
    if (current.revision !== data.expectedRevision) throw new AppError(409, "Preferences changed. Reload and try again.");
    const workingHours = data.workingHours ?? current.workingHours;
    const taskTypeMinutes = data.taskTypeMinutes ?? current.taskTypeMinutes;
    const workingHoursJson = JSON.stringify(workingHours);
    const taskTypeMinutesJson = JSON.stringify(taskTypeMinutes);
    tx.insert(preferences).values({
      userId,
      timezone: data.timezone,
      weekStart: data.weekStart,
      workingHoursJson,
      taskTypeMinutesJson,
      revision: current.revision + 1,
    }).onConflictDoUpdate({
      target: preferences.userId,
      set: {
        timezone: data.timezone,
        weekStart: data.weekStart,
        workingHoursJson,
        taskTypeMinutesJson,
        revision: current.revision + 1,
      },
    }).run();
    return getPreferences(tx, userId);
  }, { behavior: "immediate" });
}

export function listWorkingHoursOverrides(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  fromDate?: string,
  toDate?: string,
): Record<string, DayWorkingWindow> {
  const conditions = [eq(dayWorkingHoursOverride.ownerId, ownerId)];
  if (fromDate) conditions.push(gte(dayWorkingHoursOverride.date, dateOnlySchema.parse(fromDate)));
  if (toDate) conditions.push(lte(dayWorkingHoursOverride.date, dateOnlySchema.parse(toDate)));
  const rows = db.select().from(dayWorkingHoursOverride)
    .where(and(...conditions))
    .orderBy(asc(dayWorkingHoursOverride.date))
    .all();
  const map: Record<string, DayWorkingWindow> = {};
  for (const row of rows) {
    map[row.date] = { enabled: row.enabled, hours: row.hours ?? legacyWindowToHours(row.start, row.end) };
  }
  return map;
}

export function setWorkingHoursOverride(
  db: AppDatabase,
  ownerId: string,
  date: string,
  input: unknown,
): DayWorkingWindow & { date: string } {
  const validDate = dateOnlySchema.parse(date);
  const window = dayWorkingWindowSchema.parse(input);
  const now = new Date().toISOString();
  db.insert(dayWorkingHoursOverride).values({
    id: crypto.randomUUID(),
    ownerId,
    date: validDate,
    enabled: window.enabled,
    hours: window.hours,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [dayWorkingHoursOverride.ownerId, dayWorkingHoursOverride.date],
    set: {
      enabled: window.enabled,
      hours: window.hours,
      updatedAt: now,
    },
  }).run();
  return { date: validDate, ...window };
}

export function clearWorkingHoursOverride(
  db: AppDatabase,
  ownerId: string,
  date: string,
): { date: string; cleared: boolean } {
  const validDate = dateOnlySchema.parse(date);
  const deleted = db.delete(dayWorkingHoursOverride)
    .where(and(eq(dayWorkingHoursOverride.ownerId, ownerId), eq(dayWorkingHoursOverride.date, validDate)))
    .returning()
    .all();
  return { date: validDate, cleared: deleted.length > 0 };
}
