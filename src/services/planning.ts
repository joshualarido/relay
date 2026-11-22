import { desc, eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { AppDatabase } from "../lib/db";
import { activity, type Event, type Project, type Task } from "../lib/db/schema";
import { dateInTimezone, dateOnlySchema, instantToLocal } from "../lib/dates";
import { getPreferences, timezoneSchema } from "../lib/preferences";
import { summarySentence, todayTimeline, type TodayTimeline } from "../lib/today";
import { WORKING_HOURS_END, WORKING_HOURS_START } from "../lib/calendar-schedule";
import { AppError } from "../lib/errors";
import { getProjectProgress, listProjects, projectStatuses, type ProjectProgress } from "./projects";
import { listTasks, taskStatuses } from "./tasks";
import { listEvents } from "./events";

export const getTodaySchema = z.object({
  now: z.iso.datetime({ offset: true }).optional(),
  timezone: timezoneSchema.optional(),
}).strict();

export type TodayContext = TodayTimeline & {
  timezone: string;
  summarySentence: string;
  activeProjects: Array<Project & { progress: ProjectProgress }>;
};

export function getTodayContext(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  input: unknown = {},
): TodayContext {
  const data = getTodaySchema.parse(input);
  const timezone = data.timezone ?? getPreferences(db, ownerId).timezone;
  const now = data.now ? new Date(data.now).toISOString() : new Date().toISOString();
  const timeline = todayTimeline(db, ownerId, timezone, now);
  const activeProjects = listProjects(db, ownerId)
    .filter((p) => p.status === "Active")
    .map((p) => ({ ...p, progress: getProjectProgress(db, ownerId, p.id) }));

  return {
    ...timeline,
    timezone,
    summarySentence: summarySentence(timeline.summary, timeline.dayState),
    activeProjects,
  };
}

export const searchAllSchema = z.object({
  query: z.string().max(500).default(""),
  types: z.array(z.enum(["project", "task", "event"])).min(1).optional(),
  status: z.enum([...projectStatuses, ...taskStatuses]).optional(),
  projectId: z.string().min(1).optional(),
  date: dateOnlySchema.optional(),
  important: z.union([z.boolean(), z.literal("unset")]).optional(),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(50),
  timezone: timezoneSchema.optional(),
}).strict();

export type SearchResultItem =
  | { kind: "project"; id: string; title: string; status: Project["status"]; deadline: string | null; archivedAt: string | null; revision: number; updatedAt: string }
  | { kind: "task"; id: string; title: string; status: Task["status"]; projectId: string | null; dueDate: string | null; dueAt: string | null; important: boolean | null; archivedAt: string | null; revision: number; updatedAt: string }
  | { kind: "event"; id: string; title: string; start: string; end: string; allDay: boolean; projectId: string | null; taskId: string | null; location: string; archivedAt: string | null; revision: number; updatedAt: string };

export function searchAll(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  input: unknown = {},
): { items: SearchResultItem[]; total: number } {
  const data = searchAllSchema.parse(input);
  const q = data.query.trim().toLowerCase();
  const timezone = data.timezone ?? getPreferences(db, ownerId).timezone;
  const types = new Set(data.types ?? ["project", "task", "event"]);

  const allProjects = data.includeArchived
    ? [...listProjects(db, ownerId, false), ...listProjects(db, ownerId, true)]
    : listProjects(db, ownerId, false);
  const allTasks = listTasks(db, ownerId, data.includeArchived);
  const allEvents = listEvents(db, ownerId, data.includeArchived);

  const plannedByTask = new Map<string, string[]>();
  for (const e of allEvents) {
    if (e.taskId && e.start) {
      const d = e.allDay ? e.start : dateInTimezone(e.start, timezone);
      const existing = plannedByTask.get(e.taskId) ?? [];
      existing.push(d);
      plannedByTask.set(e.taskId, existing);
    }
  }

  const items: SearchResultItem[] = [];

  if (types.has("project") && data.important === undefined) {
    for (const p of allProjects) {
      if (q && !`${p.name} ${p.description}`.toLowerCase().includes(q)) continue;
      if (data.status && p.status !== data.status) continue;
      if (data.projectId && p.id !== data.projectId) continue;
      if (data.date && p.deadline !== data.date) continue;
      items.push({
        kind: "project",
        id: p.id,
        title: p.name,
        status: p.status,
        deadline: p.deadline,
        archivedAt: p.archivedAt,
        revision: p.revision,
        updatedAt: p.updatedAt,
      });
    }
  }

  if (types.has("task")) {
    for (const t of allTasks) {
      if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q)) continue;
      if (data.status && t.status !== data.status) continue;
      if (data.important !== undefined) {
        if (data.important === "unset" ? t.important !== null : t.important !== data.important) continue;
      }
      if (data.projectId) {
        if (data.projectId === "none" || data.projectId === "inbox") {
          if (t.projectId !== null) continue;
        } else if (t.projectId !== data.projectId) {
          continue;
        }
      }
      if (data.date) {
        const dueOn = t.dueDate ?? (t.dueAt ? dateInTimezone(t.dueAt, t.timezone ?? timezone) : null);
        if (dueOn !== data.date && !plannedByTask.get(t.id)?.includes(data.date)) continue;
      }
      items.push({
        kind: "task",
        id: t.id,
        title: t.title,
        status: t.status,
        projectId: t.projectId,
        dueDate: t.dueDate,
        dueAt: t.dueAt,
        important: t.important,
        archivedAt: t.archivedAt,
        revision: t.revision,
        updatedAt: t.updatedAt,
      });
    }
  }

  if (types.has("event") && !data.status && data.important === undefined) {
    const taskProjectById = new Map(allTasks.map((t) => [t.id, t.projectId]));
    for (const e of allEvents) {
      if (q && !`${e.title} ${e.description} ${e.location}`.toLowerCase().includes(q)) continue;
      if (data.projectId) {
        const effectiveProjectId = e.taskId ? (taskProjectById.get(e.taskId) ?? null) : e.projectId;
        if (data.projectId === "none" || data.projectId === "inbox") {
          if (effectiveProjectId !== null) continue;
        } else if (effectiveProjectId !== data.projectId) {
          continue;
        }
      }
      if (data.date) {
        if (!e.start || !e.end) continue;
        if (e.allDay) {
          if (!(e.start <= data.date && e.end > data.date)) continue;
        } else {
          const startDate = dateInTimezone(e.start, timezone);
          const endDate = dateInTimezone(new Date(Date.parse(e.end) - 1).toISOString(), timezone);
          if (!(startDate <= data.date && endDate >= data.date)) continue;
        }
      }
      items.push({
        kind: "event",
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        projectId: e.projectId,
        taskId: e.taskId,
        location: e.location,
        archivedAt: e.archivedAt,
        revision: e.revision,
        updatedAt: e.updatedAt,
      });
    }
  }

  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
  return { items: items.slice(0, data.limit), total: items.length };
}

export const findFreeSlotsSchema = z.object({
  date: dateOnlySchema.optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  durationMinutes: z.number().int().min(15).max(720).default(60),
  workdayStartHour: z.number().int().min(0).max(23).default(WORKING_HOURS_START),
  workdayEndHour: z.number().int().min(1).max(24).default(WORKING_HOURS_END),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  excludePast: z.boolean().default(true),
  timezone: timezoneSchema.optional(),
  now: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.workdayEndHour <= data.workdayStartHour) {
    ctx.addIssue({ code: "custom", path: ["workdayEndHour"], message: "workdayEndHour must be after workdayStartHour." });
  }
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must be on or after startDate." });
  }
});

export type FreeSlot = {
  date: string;
  start: string;
  end: string;
  localStart: string;
  localEnd: string;
  durationMinutes: number;
  timezone: string;
};

export function findFreeSlots(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  input: unknown = {},
): { timezone: string; startDate: string; endDate: string; durationMinutes: number; slots: FreeSlot[] } {
  const data = findFreeSlotsSchema.parse(input);
  const timezone = data.timezone ?? getPreferences(db, ownerId).timezone;
  const nowIso = data.now ? new Date(data.now).toISOString() : new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const today = dateInTimezone(nowIso, timezone);

  const startDateStr = data.date ?? data.startDate ?? today;
  const endDateStr = data.date ?? data.endDate ?? startDateStr;
  const startPlain = Temporal.PlainDate.from(startDateStr);
  const endPlain = Temporal.PlainDate.from(endDateStr);
  const spanDays = startPlain.until(endPlain).days + 1;
  if (spanDays > 14) {
    throw new AppError(400, "Date range for find_free_slots cannot exceed 14 days.");
  }

  const bufferMs = data.bufferMinutes * 60_000;
  const minDurationMs = data.durationMinutes * 60_000;

  // Gather all timed busy intervals from events and direct task blocks.
  const rawBusy: Array<[number, number]> = [];
  for (const e of listEvents(db, ownerId)) {
    if (e.allDay || !e.start || !e.end) continue;
    const s = Date.parse(e.start);
    const en = Date.parse(e.end);
    if (!Number.isNaN(s) && !Number.isNaN(en) && en > s) {
      rawBusy.push([s - bufferMs, en + bufferMs]);
    }
  }
  for (const t of listTasks(db, ownerId)) {
    if (t.allDay || t.status === "Done" || !t.startAt || !t.endAt) continue;
    const s = Date.parse(t.startAt);
    const en = Date.parse(t.endAt);
    if (!Number.isNaN(s) && !Number.isNaN(en) && en > s) {
      rawBusy.push([s - bufferMs, en + bufferMs]);
    }
  }

  const slots: FreeSlot[] = [];

  for (let offset = 0; offset < spanDays; offset++) {
    const day = startPlain.add({ days: offset });
    const dayStr = day.toString();
    const windowStartZdt = day.toZonedDateTime({
      timeZone: timezone,
      plainTime: Temporal.PlainTime.from({ hour: data.workdayStartHour }),
    });
    const windowEndZdt = data.workdayEndHour === 24
      ? day.add({ days: 1 }).toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from({ hour: 0 }) })
      : day.toZonedDateTime({
          timeZone: timezone,
          plainTime: Temporal.PlainTime.from({ hour: data.workdayEndHour }),
        });

    let windowStart = windowStartZdt.epochMilliseconds;
    const windowEnd = windowEndZdt.epochMilliseconds;
    if (data.excludePast && nowMs > windowStart) {
      windowStart = nowMs;
    }
    if (windowEnd - windowStart < minDurationMs) continue;

    // Clip and merge busy intervals inside [windowStart, windowEnd]
    const clipped = rawBusy
      .filter(([s, en]) => en > windowStart && s < windowEnd)
      .map(([s, en]): [number, number] => [Math.max(s, windowStart), Math.min(en, windowEnd)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    const merged: Array<[number, number]> = [];
    for (const [s, en] of clipped) {
      const prev = merged[merged.length - 1];
      if (prev && s <= prev[1]) {
        prev[1] = Math.max(prev[1], en);
      } else {
        merged.push([s, en]);
      }
    }

    let cursor = windowStart;
    for (const [busyStart, busyEnd] of merged) {
      if (busyStart - cursor >= minDurationMs) {
        const startIso = new Date(cursor).toISOString();
        const endIso = new Date(busyStart).toISOString();
        slots.push({
          date: dayStr,
          start: startIso,
          end: endIso,
          localStart: instantToLocal(startIso, timezone).slice(0, 16),
          localEnd: instantToLocal(endIso, timezone).slice(0, 16),
          durationMinutes: Math.floor((busyStart - cursor) / 60_000),
          timezone,
        });
      }
      cursor = Math.max(cursor, busyEnd);
    }
    if (windowEnd - cursor >= minDurationMs) {
      const startIso = new Date(cursor).toISOString();
      const endIso = new Date(windowEnd).toISOString();
      slots.push({
        date: dayStr,
        start: startIso,
        end: endIso,
        localStart: instantToLocal(startIso, timezone).slice(0, 16),
        localEnd: instantToLocal(endIso, timezone).slice(0, 16),
        durationMinutes: Math.floor((windowEnd - cursor) / 60_000),
        timezone,
      });
    }
  }

  return { timezone, startDate: startDateStr, endDate: endDateStr, durationMinutes: data.durationMinutes, slots };
}

export const getNeglectedStateSchema = z.object({
  now: z.iso.datetime({ offset: true }).optional(),
  timezone: timezoneSchema.optional(),
  dueSoonDays: z.number().int().min(1).max(30).default(3),
  stalledProjectDays: z.number().int().min(1).max(90).default(7),
}).strict();

export type NeglectedTaskSummary = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  dueDate: string | null;
  dueAt: string | null;
  important: boolean | null;
  revision: number;
};

export type OverdueTaskSummary = NeglectedTaskSummary & { daysOverdue: number };
export type DueSoonTaskSummary = NeglectedTaskSummary & { daysUntilDue: number };

export type StalledProjectSummary = {
  id: string;
  name: string;
  deadline: string | null;
  lastMovementAt: string;
  daysSinceMovement: number;
  openTaskCount: number;
  doneTaskCount: number;
  totalTaskCount: number;
  revision: number;
};

export type NeglectedState = {
  today: string;
  timezone: string;
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
  isIdle: boolean;
  needsRecovery: boolean;
  overdueTasks: OverdueTaskSummary[];
  unscheduledDueSoonTasks: DueSoonTaskSummary[];
  stalledActiveProjects: StalledProjectSummary[];
  summary: {
    overdueCount: number;
    unscheduledDueSoonCount: number;
    stalledActiveProjectCount: number;
    totalOpenTasks: number;
    activeProjectCount: number;
  };
};

export function getNeglectedState(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  input: unknown = {},
): NeglectedState {
  const data = getNeglectedStateSchema.parse(input);
  const timezone = data.timezone ?? getPreferences(db, ownerId).timezone;
  const nowIso = data.now ? new Date(data.now).toISOString() : new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const today = dateInTimezone(nowIso, timezone);
  const todayPlain = Temporal.PlainDate.from(today);
  const dueSoonCutoff = todayPlain.add({ days: data.dueSoonDays }).toString();

  const projects = listProjects(db, ownerId);
  const tasks = listTasks(db, ownerId);
  const events = listEvents(db, ownerId);

  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const scheduledTaskIds = new Set(events.flatMap((e) => (e.taskId && e.start ? [e.taskId] : [])));

  // Determine last activity timestamp from activity log, falling back to latest entity updatedAt.
  const latestActivity = db.select({ createdAt: activity.createdAt }).from(activity)
    .where(eq(activity.ownerId, ownerId))
    .orderBy(desc(activity.createdAt))
    .limit(1)
    .get();

  let lastActivityAt: string | null = latestActivity?.createdAt ?? null;
  if (!lastActivityAt) {
    const timestamps = [
      ...projects.map((p) => p.updatedAt),
      ...tasks.map((t) => t.updatedAt),
      ...events.map((e) => e.updatedAt),
    ].filter(Boolean);
    if (timestamps.length > 0) {
      timestamps.sort((a, b) => b.localeCompare(a));
      lastActivityAt = timestamps[0]!;
    }
  }

  const daysSinceLastActivity = lastActivityAt
    ? Math.max(0, Math.floor((nowMs - Date.parse(lastActivityAt)) / 86_400_000))
    : null;

  const openTasks = tasks.filter((t) => t.status !== "Done");
  const overdueTasks: OverdueTaskSummary[] = [];
  const unscheduledDueSoonTasks: DueSoonTaskSummary[] = [];

  for (const t of openTasks) {
    const dueOn = t.dueDate ?? (t.dueAt ? dateInTimezone(t.dueAt, t.timezone ?? timezone) : null);
    const isOverdue = t.dueDate
      ? t.dueDate < today
      : t.dueAt
        ? Date.parse(t.dueAt) < nowMs
        : false;

    if (isOverdue && dueOn) {
      const daysOverdue = Math.max(1, Temporal.PlainDate.from(dueOn).until(todayPlain).days);
      overdueTasks.push({
        id: t.id,
        title: t.title,
        projectId: t.projectId,
        projectName: t.projectId ? (projectNames.get(t.projectId) ?? null) : null,
        dueDate: t.dueDate,
        dueAt: t.dueAt,
        important: t.important,
        revision: t.revision,
        daysOverdue,
      });
      continue;
    }

    if (dueOn && dueOn >= today && dueOn <= dueSoonCutoff) {
      const isScheduled = Boolean(t.startAt) || scheduledTaskIds.has(t.id);
      if (!isScheduled) {
        const daysUntilDue = todayPlain.until(Temporal.PlainDate.from(dueOn)).days;
        unscheduledDueSoonTasks.push({
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          projectName: t.projectId ? (projectNames.get(t.projectId) ?? null) : null,
          dueDate: t.dueDate,
          dueAt: t.dueAt,
          important: t.important,
          revision: t.revision,
          daysUntilDue,
        });
      }
    }
  }

  overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue || a.title.localeCompare(b.title));
  unscheduledDueSoonTasks.sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.title.localeCompare(b.title));

  // Stalled Active projects: Active projects with no movement in >= stalledProjectDays.
  const activeProjects = projects.filter((p) => p.status === "Active");
  const tasksByProject = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.projectId) continue;
    const list = tasksByProject.get(t.projectId) ?? [];
    list.push(t);
    tasksByProject.set(t.projectId, list);
  }
  const eventsByProject = new Map<string, Event[]>();
  const taskToProject = new Map(tasks.map((t) => [t.id, t.projectId]));
  for (const e of events) {
    const pid = e.taskId ? (taskToProject.get(e.taskId) ?? null) : e.projectId;
    if (!pid) continue;
    const list = eventsByProject.get(pid) ?? [];
    list.push(e);
    eventsByProject.set(pid, list);
  }

  const stalledActiveProjects: StalledProjectSummary[] = [];
  for (const p of activeProjects) {
    const childTasks = tasksByProject.get(p.id) ?? [];
    const childEvents = eventsByProject.get(p.id) ?? [];
    const candidates = [
      p.updatedAt,
      ...childTasks.flatMap((t) => (t.completedAt ? [t.updatedAt, t.completedAt] : [t.updatedAt])),
      ...childEvents.map((e) => e.updatedAt),
    ];
    let lastMovementAt = p.updatedAt;
    let lastMovementMs = Date.parse(p.updatedAt);
    for (const ts of candidates) {
      const ms = Date.parse(ts);
      if (!Number.isNaN(ms) && ms > lastMovementMs) {
        lastMovementMs = ms;
        lastMovementAt = ts;
      }
    }
    const daysSinceMovement = Math.max(0, Math.floor((nowMs - lastMovementMs) / 86_400_000));
    if (daysSinceMovement >= data.stalledProjectDays) {
      const doneTaskCount = childTasks.filter((t) => t.status === "Done").length;
      stalledActiveProjects.push({
        id: p.id,
        name: p.name,
        deadline: p.deadline,
        lastMovementAt,
        daysSinceMovement,
        openTaskCount: childTasks.length - doneTaskCount,
        doneTaskCount,
        totalTaskCount: childTasks.length,
        revision: p.revision,
      });
    }
  }
  stalledActiveProjects.sort((a, b) => b.daysSinceMovement - a.daysSinceMovement || a.name.localeCompare(b.name));

  const isIdle = daysSinceLastActivity !== null && daysSinceLastActivity >= 3;
  const needsRecovery = isIdle || overdueTasks.length > 0 || stalledActiveProjects.length > 0;

  return {
    today,
    timezone,
    lastActivityAt,
    daysSinceLastActivity,
    isIdle,
    needsRecovery,
    overdueTasks,
    unscheduledDueSoonTasks,
    stalledActiveProjects,
    summary: {
      overdueCount: overdueTasks.length,
      unscheduledDueSoonCount: unscheduledDueSoonTasks.length,
      stalledActiveProjectCount: stalledActiveProjects.length,
      totalOpenTasks: openTasks.length,
      activeProjectCount: activeProjects.length,
    },
  };
}
