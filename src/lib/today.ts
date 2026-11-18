import { Temporal } from "temporal-polyfill";
import type { AppDatabase } from "./db";
import type { Task } from "./db/schema";
import { dateInTimezone } from "./dates";
import { listEvents } from "./events";
import { listProjects } from "./projects";
import { listTasks } from "./tasks";

// One entry on Today's timeline. start/end are the event's own values (ISO instants for timed events,
// YYYY-MM-DD with exclusive end for all-day ones); a timed event crossing midnight keeps its real bounds,
// so the UI clamps it for display. All-day plain events are informational: never counted, never done.
export type TodayItem = {
  id: string; kind: "event" | "task-block"; title: string; start: string; end: string; allDay: boolean;
  done: boolean; taskId?: string; task?: Task; projectName?: string;
};
export type TodayNext = { id: string; title: string; minutes: number };
export type TodaySummary = { remaining: number; total: number; next: TodayNext | null };
export type DayState = "empty" | "active" | "clear";
export type TodayTimeline = {
  today: string; items: TodayItem[]; dueUnscheduled: Task[]; overdue: Task[]; summary: TodaySummary; dayState: DayState;
};

const countable = (item: TodayItem) => item.kind === "task-block" || !item.allDay;

// `timezone` is the owner's preference zone; "today" is the [midnight, next midnight) window there (DST-safe).
export function todayTimeline(db: Pick<AppDatabase, "select">, ownerId: string, timezone: string, now = new Date().toISOString()): TodayTimeline {
  const zoned = Temporal.Instant.from(now).toZonedDateTimeISO(timezone).startOfDay();
  const today = zoned.toPlainDate().toString();
  const dayStart = zoned.epochMilliseconds, dayEnd = zoned.add({ days: 1 }).epochMilliseconds, nowMs = Date.parse(now);
  const tasks = listTasks(db, ownerId), taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectNames = new Map(listProjects(db, ownerId).map((p) => [p.id, p.name]));

  const items: TodayItem[] = listEvents(db, ownerId)
    .filter((e) => e.allDay ? e.start <= today && e.end > today : Date.parse(e.start) < dayEnd && Date.parse(e.end) > dayStart)
    .map((e) => {
      const linked = e.taskId ? taskById.get(e.taskId) : undefined;
      const projectId = linked ? linked.projectId : e.projectId;
      return {
        id: e.id, kind: linked ? "task-block" as const : "event" as const, title: e.title, start: e.start, end: e.end, allDay: e.allDay,
        done: linked ? linked.status === "Done" : !e.allDay && Date.parse(e.end) <= nowMs,
        ...(linked && { taskId: linked.id, task: linked }),
        ...(projectId && projectNames.has(projectId) && { projectName: projectNames.get(projectId) }),
      };
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || startMs(a) - startMs(b) || a.title.localeCompare(b.title));

  const scheduled = new Set(items.flatMap((i) => i.taskId ? [i.taskId] : []));
  const dueOn = (t: Task) => t.dueDate ?? (t.dueAt ? dateInTimezone(t.dueAt, timezone) : null);
  const dueToday = tasks.filter((t) => dueOn(t) === today && !scheduled.has(t.id));
  const dueUnscheduled = dueToday.filter((t) => t.status !== "Done");
  const overdue = tasks.filter((t) => t.status !== "Done" && (dueOn(t) ?? today) < today);

  const counted = items.filter(countable);
  const next = counted.find((i) => !i.done && Date.parse(i.start) > nowMs);
  const total = counted.length + dueToday.length;
  const remaining = counted.filter((i) => !i.done).length + dueUnscheduled.length;
  const summary: TodaySummary = {
    remaining, total,
    next: next ? { id: next.id, title: next.title, minutes: Math.ceil((Date.parse(next.start) - nowMs) / 60_000) } : null,
  };
  const dayState: DayState = total === 0 ? (items.length ? "active" : "empty") : remaining === 0 ? "clear" : "active";
  return { today, items, dueUnscheduled, overdue, summary, dayState };

  function startMs(item: TodayItem) {
    return item.allDay ? Date.parse(`${item.start}T00:00:00Z`) : Date.parse(item.start);
  }
}

const plural = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

// Pure: the one-line summary shown above the timeline.
export function summarySentence(summary: TodaySummary, dayState: DayState) {
  if (dayState === "clear") return "Nothing left today";
  if (summary.remaining === 0) return dayState === "empty" ? "Nothing planned today" : "Nothing timed today";
  if (!summary.next) return `${plural(summary.remaining)} left today`;
  return `${plural(summary.remaining)} today · next: ${summary.next.title} in ${duration(summary.next.minutes)}`;
}
