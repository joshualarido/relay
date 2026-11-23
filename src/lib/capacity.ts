import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Event, Task } from "./db/schema";
import { jsWeekday } from "./recurrence";

/** A day's working time is just an amount of hours; events that day are subtracted from it. */
export const dayWorkingWindowSchema = z.object({
  enabled: z.boolean(),
  hours: z.number().min(0.5, "Enter at least 0.5 hours.").max(24, "A day has at most 24 hours."),
}).strict();

export type DayWorkingWindow = z.infer<typeof dayWorkingWindowSchema>;

export const weekdayKeys = ["0", "1", "2", "3", "4", "5", "6"] as const;
export type WeekdayKey = (typeof weekdayKeys)[number];

export const weeklyWorkingHoursSchema = z.object({
  "0": dayWorkingWindowSchema,
  "1": dayWorkingWindowSchema,
  "2": dayWorkingWindowSchema,
  "3": dayWorkingWindowSchema,
  "4": dayWorkingWindowSchema,
  "5": dayWorkingWindowSchema,
  "6": dayWorkingWindowSchema,
}).strict();

export type WeeklyWorkingHours = z.infer<typeof weeklyWorkingHoursSchema>;

export const taskTypeMinutesSchema = z.object({
  Instant: z.number().int().min(5).max(480),
  Medium: z.number().int().min(5).max(480),
  Deep: z.number().int().min(5).max(480),
}).strict();

export type TaskTypeMinutes = z.infer<typeof taskTypeMinutesSchema>;

export const DEFAULT_TASK_TYPE_MINUTES: TaskTypeMinutes = {
  Instant: 15,
  Medium: 45,
  Deep: 90,
};

export const DEFAULT_WORKING_HOURS: WeeklyWorkingHours = {
  "0": { enabled: false, hours: 8 },
  "1": { enabled: true, hours: 8 },
  "2": { enabled: true, hours: 8 },
  "3": { enabled: true, hours: 8 },
  "4": { enabled: true, hours: 8 },
  "5": { enabled: true, hours: 8 },
  "6": { enabled: false, hours: 8 },
};

function clockMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Older data stored a start/end window; convert it to hours (nearest half hour, 0.5-24). */
export function legacyWindowToHours(start: string, end: string): number {
  const hours = Math.round((clockMinutes(end) - clockMinutes(start)) / 30) / 2;
  return Math.min(24, Math.max(0.5, Number.isFinite(hours) ? hours : 8));
}

function upgradeLegacyDay(day: unknown): unknown {
  if (day && typeof day === "object" && !("hours" in day) && "start" in day && "end" in day) {
    const d = day as { enabled?: boolean; start: string; end: string };
    return { enabled: Boolean(d.enabled), hours: legacyWindowToHours(d.start, d.end) };
  }
  return day;
}

export function parseWorkingHours(raw: string | null | undefined): WeeklyWorkingHours {
  if (!raw) return DEFAULT_WORKING_HOURS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return weeklyWorkingHoursSchema.parse(
      Object.fromEntries(Object.entries(parsed).map(([key, day]) => [key, upgradeLegacyDay(day)])),
    );
  } catch {
    return DEFAULT_WORKING_HOURS;
  }
}

export function parseTaskTypeMinutes(raw: string | null | undefined): TaskTypeMinutes {
  if (!raw) return DEFAULT_TASK_TYPE_MINUTES;
  try {
    return taskTypeMinutesSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_TASK_TYPE_MINUTES;
  }
}

export type ResolvedWorkingWindow = DayWorkingWindow & { isOverride: boolean };

export function resolveDayWorkingWindow(
  date: string,
  weeklyDefaults: WeeklyWorkingHours,
  override?: DayWorkingWindow | null,
): ResolvedWorkingWindow {
  if (override) {
    return { ...override, isOverride: true };
  }
  const plain = Temporal.PlainDate.from(date);
  const key = String(jsWeekday(plain)) as WeekdayKey;
  return { ...weeklyDefaults[key], isOverride: false };
}

export type DayCapacity = {
  date: string;
  window: ResolvedWorkingWindow;
  workingMinutes: number;
  eventMinutes: number;
  usableMinutes: number;
  plannedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  overbookedMinutes: number;
};

/** The calendar day [00:00, next 00:00) in the user's timezone, as epoch ms. */
function dayBoundsMs(date: string, timezone: string): [number, number] {
  const start = Temporal.PlainDate.from(date).toZonedDateTime(timezone);
  return [start.epochMilliseconds, start.add({ days: 1 }).epochMilliseconds];
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function computeDayCapacity(params: {
  date: string;
  timezone: string;
  window: ResolvedWorkingWindow;
  events: readonly Event[];
  tasks: readonly Task[];
  taskTypeMinutes?: TaskTypeMinutes;
}): DayCapacity {
  const { date, timezone, window, events, tasks } = params;
  const weights = params.taskTypeMinutes ?? DEFAULT_TASK_TYPE_MINUTES;

  let workingMinutes = 0;
  let eventMinutes = 0;

  if (window.enabled) {
    const [winStart, winEnd] = dayBoundsMs(date, timezone);
    workingMinutes = Math.round(window.hours * 60);
    const clipped: Array<[number, number]> = [];
    for (const ev of events) {
      if (ev.deletedAt || ev.archivedAt || ev.allDay || !ev.start || !ev.end) continue;
      const evStart = Date.parse(ev.start);
      const evEnd = Date.parse(ev.end);
      if (Number.isNaN(evStart) || Number.isNaN(evEnd)) continue;
      if (evEnd <= winStart || evStart >= winEnd) continue;
      clipped.push([Math.max(evStart, winStart), Math.min(evEnd, winEnd)]);
    }
    const merged = mergeIntervals(clipped);
    eventMinutes = merged.reduce((sum, [s, e]) => sum + Math.round((e - s) / 60_000), 0);
  }

  const usableMinutes = Math.max(0, workingMinutes - eventMinutes);
  let plannedMinutes = 0;
  let completedMinutes = 0;
  let remainingMinutes = 0;

  for (const t of tasks) {
    if (t.deletedAt || t.archivedAt || t.executionDate !== date) continue;
    const mins = taskMinutes(t, weights);
    plannedMinutes += mins;
    if (t.status === "Done") completedMinutes += mins;
    else remainingMinutes += mins;
  }

  const overbookedMinutes = Math.max(0, plannedMinutes - usableMinutes);

  return {
    date,
    window,
    workingMinutes,
    eventMinutes,
    usableMinutes,
    plannedMinutes,
    completedMinutes,
    remainingMinutes,
    overbookedMinutes,
  };
}

/** A task's planned minutes: its own override when set, otherwise the task-type default. */
export function taskMinutes(
  t: { taskType: keyof TaskTypeMinutes; durationMinutes?: number | null },
  weights: TaskTypeMinutes = DEFAULT_TASK_TYPE_MINUTES,
): number {
  return t.durationMinutes ?? weights[t.taskType] ?? weights.Medium;
}

export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
