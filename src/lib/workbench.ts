import { z } from "zod";
import type { AppDatabase } from "./db";
import { listProjects, getProjectProgress, projectStatuses } from "./projects";
import { listTasks, taskStatuses } from "./tasks";
import { dateInTimezone, dateOnlySchema } from "./dates";
import { listEvents } from "./events";

// Planned work is a non-deleted event linked to the task: an all-day event's date, or a timed event's start day in `timezone`
// (the event's own zone when omitted). Returns each task's planned dates in ascending order.
function plannedDates(db: Pick<AppDatabase, "select">, ownerId: string, timezone?: string) {
  const dates = new Map<string, string[]>();
  for (const e of listEvents(db, ownerId)) if (e.taskId) {
    dates.set(e.taskId, [...(dates.get(e.taskId) ?? []), e.allDay ? e.start : dateInTimezone(e.start, timezone ?? e.timezone)].sort());
  }
  return dates;
}

export type WorkItem = { kind: "project" | "task" | "event"; id: string; title: string; href: string; date: string | null; dateKind: "deadline" | "planned" | null; updatedAt: string };
export const searchSchema = z.object({
  q: z.string().max(500).default(""), status: z.enum([...projectStatuses, ...taskStatuses]).optional(),
  projectId: z.string().min(1).optional(), date: dateOnlySchema.optional(), important: z.enum(["true", "false", "unset"]).optional(),
}).strict();

export function searchWorkspace(db: Pick<AppDatabase, "select">, ownerId: string, input: unknown) {
  const data = searchSchema.parse(input), q = data.q.toLowerCase(), planned = plannedDates(db, ownerId);
  const items: WorkItem[] = [
    ...listProjects(db, ownerId).filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q) &&
      (!data.status || p.status === data.status) && !data.important && (!data.projectId || p.id === data.projectId) &&
      (!data.date || p.deadline === data.date)).map((p) => ({
      kind: "project" as const, id: p.id, title: p.name, href: `/projects/${p.id}`, date: p.deadline, dateKind: p.deadline ? "deadline" as const : null, updatedAt: p.updatedAt,
    })),
    ...listTasks(db, ownerId).filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q) &&
      (!data.status || t.status === data.status) &&
      (!data.important || t.important === (data.important === "unset" ? null : data.important === "true")) &&
      (!data.projectId || (data.projectId === "inbox" ? !t.projectId : t.projectId === data.projectId)) &&
       (!data.date || planned.get(t.id)?.includes(data.date) || t.dueDate === data.date || (t.dueAt && dateInTimezone(t.dueAt, t.timezone!) === data.date))).map((t) => ({
      kind: "task" as const, id: t.id, title: t.title, href: `${t.projectId ? `/projects/${t.projectId}` : "/inbox"}?task=${t.id}`,
      date: t.dueDate ?? t.dueAt ?? planned.get(t.id)?.[0] ?? null, dateKind: t.dueDate || t.dueAt ? "deadline" as const : planned.has(t.id) ? "planned" as const : null,
      updatedAt: t.updatedAt,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items: items.slice(0, 100), total: items.length };
}

export function homeData(db: Pick<AppDatabase, "select">, ownerId: string, timezone: string, now = new Date().toISOString()) {
  const today = dateInTimezone(now, timezone), projects = listProjects(db, ownerId), tasks = listTasks(db, ownerId);
  const overdue = tasks.filter((t) => t.status !== "Done" && (t.dueDate ? t.dueDate < today : t.dueAt ? Date.parse(t.dueAt) < Date.parse(now) : false));
  const dueToday = tasks.filter((t) => t.status !== "Done" && (t.dueDate === today || Boolean(t.dueAt && dateInTimezone(t.dueAt, timezone) === today)));
  const planned = plannedDates(db, ownerId, timezone), isPlannedToday = (id: string) => Boolean(planned.get(id)?.includes(today));
  const plannedToday = tasks.filter((t) => isPlannedToday(t.id));
  const currentDay = tasks.filter((t) => isPlannedToday(t.id) || t.dueDate === today ||
    Boolean(t.dueAt && dateInTimezone(t.dueAt, timezone) === today));
  const todayTasks = [...new Map([...overdue, ...currentDay].map((t) => [t.id, t])).values()]
    .sort((a, b) => (a.status === "Done" ? 1 : 0) - (b.status === "Done" ? 1 : 0) ||
      (a.dueDate ?? (isPlannedToday(a.id) ? today : null) ?? a.dueAt ?? "").localeCompare(b.dueDate ?? (isPlannedToday(b.id) ? today : null) ?? b.dueAt ?? "") ||
      a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  return {
    projects: projects.filter((p) => p.status === "Active").map((p) => ({ ...p, progress: getProjectProgress(db, ownerId, p.id) })),
    overdue, dueToday, plannedToday, todayTasks,
    todayProgress: { done: currentDay.filter((t) => t.status === "Done").length, total: currentDay.length },
    tasks,
  };
}
