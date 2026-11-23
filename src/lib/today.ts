import { Temporal } from "temporal-polyfill";
import type { AppDatabase } from "./db";
import type { Project, Task } from "./db/schema";
import {
  computeDayCapacity,
  formatMinutes,
  taskMinutes,
  resolveDayWorkingWindow,
  type DayCapacity,
  type TaskTypeMinutes,
} from "./capacity";
import { dateInTimezone } from "./dates";
import { listEvents } from "./events";
import { getPreferences, listWorkingHoursOverrides } from "./preferences";
import { listProjects } from "./projects";
import { listTasks } from "./tasks";

export type TodayItem = {
  id: string;
  kind: "event" | "task-block" | "project-deadline";
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  done: boolean;
  taskId?: string;
  task?: Task;
  projectId?: string;
  project?: Project;
  projectName?: string;
};

export type TodayNext = {
  id: string;
  kind: "event" | "project-deadline";
  title: string;
  minutes: number;
  at: string;
  href: string;
};

/** The first open task in today's queue. Tasks have no clock time, so this is "next" by order, not by time. */
export type TodayNextTask = {
  id: string;
  title: string;
  taskType: Task["taskType"];
  minutes: number;
  projectName: string | null;
  href: string;
};

export type TodaySummary = {
  remaining: number;
  total: number;
  /** Next upcoming timed event or timed project deadline. */
  next: TodayNext | null;
  /** First open task in today's queue (what the Today screen shows as "Next up"). */
  nextTask?: TodayNextTask | null;
};
export type DayState = "empty" | "active" | "clear";

export type TodayTimeline = {
  today: string;
  capacity: DayCapacity;
  taskTypeMinutes: TaskTypeMinutes;
  /** Today's events and project deadlines in chronological order. */
  schedule: TodayItem[];
  /** Today's linear task queue (open ordered by dayOrder, then completed). */
  tasks: Task[];
  /** Backwards-compatible combined list (schedule items). */
  items: TodayItem[];
  /** Legacy alias kept empty/for compatibility. */
  dueUnscheduled: Task[];
  /** Non-recurring open tasks with executionDate (or legacy dueDate) before today. */
  overdue: Task[];
  summary: TodaySummary;
  dayState: DayState;
};

function projectDeadlineDate(project: Project, fallbackTimezone: string): string | null {
  if (project.deadlineAt) {
    return dateInTimezone(project.deadlineAt, project.deadlineTimezone ?? fallbackTimezone);
  }
  return project.deadline ?? null;
}

// `timezone` is the owner's preference zone; "today" is the [midnight, next midnight) window there (DST-safe).
export function todayTimeline(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  timezone: string,
  now = new Date().toISOString(),
): TodayTimeline {
  const zoned = Temporal.Instant.from(now).toZonedDateTimeISO(timezone).startOfDay();
  const today = zoned.toPlainDate().toString();
  const dayStart = zoned.epochMilliseconds;
  const dayEnd = zoned.add({ days: 1 }).epochMilliseconds;
  const nowMs = Date.parse(now);

  const prefs = getPreferences(db, ownerId);
  const overrides = listWorkingHoursOverrides(db, ownerId, today, today);
  const window = resolveDayWorkingWindow(today, prefs.workingHours, overrides[today]);

  const allTasks = listTasks(db, ownerId);
  const allProjects = listProjects(db, ownerId);
  const allEvents = listEvents(db, ownerId);
  const projectNames = new Map(allProjects.map((p) => [p.id, p.name]));

  const capacity = computeDayCapacity({
    date: today,
    timezone,
    window,
    events: allEvents,
    tasks: allTasks,
    taskTypeMinutes: prefs.taskTypeMinutes,
  });

  // 1. Events occurring today (excluding legacy task-linked time blocks)
  const eventItems: TodayItem[] = allEvents
    .filter(
      (e) =>
        !e.taskId &&
        Boolean(e.start && e.end) &&
        (e.allDay
          ? e.start <= today && e.end > today
          : Date.parse(e.start) < dayEnd && Date.parse(e.end) > dayStart),
    )
    .map((e) => ({
      id: e.id,
      kind: "event" as const,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      done: !e.allDay && Date.parse(e.end) <= nowMs,
      ...(e.projectId && projectNames.has(e.projectId) && { projectName: projectNames.get(e.projectId) }),
    }));

  // 2. Project deadlines falling on today (both date-only and timed)
  const deadlineItems: TodayItem[] = allProjects
    .filter((p) => p.status !== "Done" && projectDeadlineDate(p, timezone) === today)
    .map((p) => {
      const timed = Boolean(p.deadlineAt);
      const start = timed ? p.deadlineAt! : today;
      const end = timed
        ? p.deadlineAt!
        : Temporal.PlainDate.from(today).add({ days: 1 }).toString();
      return {
        id: `project-deadline-${p.id}`,
        kind: "project-deadline" as const,
        title: p.name,
        start,
        end,
        allDay: !timed,
        done: false,
        projectId: p.id,
        project: p,
        projectName: p.name,
      };
    });

  const schedule: TodayItem[] = [...eventItems, ...deadlineItems].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || startMs(a) - startMs(b) || a.title.localeCompare(b.title),
  );

  // 3. Today's linear task queue (executionDate === today)
  const todayTasks = allTasks
    .filter((t) => t.executionDate === today)
    .sort(
      (a, b) =>
        Number(a.status === "Done") - Number(b.status === "Done") ||
        a.dayOrder - b.dayOrder ||
        a.position - b.position ||
        a.createdAt.localeCompare(b.createdAt),
    );

  // 4. Overdue non-recurring tasks (recurring tasks auto-advance)
  const overdue = allTasks.filter((t) => {
    if (t.status === "Done" || t.recurrenceRule) return false;
    const d = t.executionDate ?? t.dueDate ?? (t.dueAt ? dateInTimezone(t.dueAt, timezone) : null);
    return Boolean(d && d < today);
  });

  // 5. Summary & Next timed item (event or timed project deadline)
  const upcomingTimed = schedule.find((i) => !i.allDay && !i.done && Date.parse(i.start) > nowMs);
  const next: TodayNext | null = upcomingTimed
    ? {
        id: upcomingTimed.id,
        kind: upcomingTimed.kind === "project-deadline" ? "project-deadline" : "event",
        title: upcomingTimed.title,
        minutes: Math.max(1, Math.ceil((Date.parse(upcomingTimed.start) - nowMs) / 60_000)),
        at: upcomingTimed.start,
        href:
          upcomingTimed.kind === "project-deadline" && upcomingTimed.projectId
            ? `/projects/${upcomingTimed.projectId}`
            : `/?event=${upcomingTimed.id}`,
      }
    : null;

  const firstOpen = todayTasks.find((t) => t.status !== "Done");
  const nextTask: TodayNextTask | null = firstOpen
    ? {
        id: firstOpen.id,
        title: firstOpen.title,
        taskType: firstOpen.taskType,
        minutes: taskMinutes(firstOpen, prefs.taskTypeMinutes),
        projectName: firstOpen.projectId ? (projectNames.get(firstOpen.projectId) ?? null) : null,
        href: `/?task=${firstOpen.id}`,
      }
    : null;

  const timedEvents = eventItems.filter((e) => !e.allDay);
  const total = todayTasks.length + timedEvents.length;
  const remaining =
    todayTasks.filter((t) => t.status !== "Done").length +
    timedEvents.filter((e) => !e.done).length;

  const hasAnything = todayTasks.length > 0 || schedule.length > 0;
  const dayState: DayState = !hasAnything
    ? "empty"
    : total > 0 && remaining === 0 && deadlineItems.length === 0
      ? "clear"
      : "active";

  return {
    today,
    capacity,
    taskTypeMinutes: prefs.taskTypeMinutes,
    schedule,
    tasks: todayTasks,
    items: schedule,
    dueUnscheduled: [],
    overdue,
    summary: { remaining, total, next, nextTask },
    dayState,
  };

  function startMs(item: TodayItem) {
    return item.allDay ? Date.parse(`${item.start}T00:00:00Z`) : Date.parse(item.start);
  }
}

const plural = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

// Pure: the one-line summary shown above the timeline.
export function summarySentence(summary: TodaySummary, dayState: DayState) {
  if (dayState === "clear") return "Nothing left today";
  if (summary.remaining === 0) return dayState === "empty" ? "Nothing planned today" : "Nothing timed today";
  const then = summary.next ? `${summary.next.title} in ${duration(summary.next.minutes)}` : "";
  if (summary.nextTask) {
    const t = summary.nextTask;
    return `${plural(summary.remaining)} today · up next: ${t.title} (${t.taskType} · ${formatMinutes(t.minutes)})${then ? ` · then ${then}` : ""}`;
  }
  if (!summary.next) return `${plural(summary.remaining)} left today`;
  return `${plural(summary.remaining)} today · next: ${then}`;
}
