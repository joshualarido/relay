import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Event, Task } from "./db/schema";
import { jsWeekday } from "./recurrence";

const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const dayWorkingWindowSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(hhmmRegex, "Use HH:MM format."),
  end: z.string().regex(hhmmRegex, "Use HH:MM format."),
}).strict().refine((w) => !w.enabled || w.end > w.start, {
  message: "End time must be after start time.",
  path: ["end"],
});

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
  "0": { enabled: false, start: "09:00", end: "17:00" },
  "1": { enabled: true, start: "09:00", end: "17:00" },
  "2": { enabled: true, start: "09:00", end: "17:00" },
  "3": { enabled: true, start: "09:00", end: "17:00" },
  "4": { enabled: true, start: "09:00", end: "17:00" },
  "5": { enabled: true, start: "09:00", end: "17:00" },
  "6": { enabled: false, start: "09:00", end: "17:00" },
};

export function parseWorkingHours(raw: string | null | undefined): WeeklyWorkingHours {
  if (!raw) return DEFAULT_WORKING_HOURS;
  try {
    return weeklyWorkingHoursSchema.parse(JSON.parse(raw));
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

function windowBoundsMs(date: string, window: DayWorkingWindow, timezone: string): [number, number] | null {
  if (!window.enabled) return null;
  const startMs = Temporal.PlainDateTime.from(`${date}T${window.start}`)
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .epochMilliseconds;
  const endMs = Temporal.PlainDateTime.from(`${date}T${window.end}`)
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .epochMilliseconds;
  if (endMs <= startMs) return null;
  return [startMs, endMs];
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
  const bounds = windowBoundsMs(date, window, timezone);

  let workingMinutes = 0;
  let eventMinutes = 0;

  if (bounds) {
    const [winStart, winEnd] = bounds;
    workingMinutes = Math.round((winEnd - winStart) / 60_000);
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
