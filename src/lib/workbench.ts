import { z } from "zod";
import type { AppDatabase } from "./db";
import { listProjects, getProjectProgress, projectStatuses } from "./projects";
import { listTasks, taskStatuses, priorities } from "./tasks";
import { dateInTimezone, dateOnlySchema } from "./dates";
import { dependencyWarnings } from "./dependencies";

export type WorkItem = { kind: "project" | "task" | "event"; id: string; title: string; href: string; date: string | null; dateKind: "deadline" | "planned" | null; updatedAt: string };
export const searchSchema = z.object({
  q: z.string().max(500).default(""), status: z.enum([...projectStatuses, ...taskStatuses]).optional(),
  priority: z.enum(priorities).optional(), projectId: z.string().min(1).optional(), date: dateOnlySchema.optional(),
  important: z.enum(["true", "false", "unset"]).optional(), urgent: z.enum(["true", "false", "unset"]).optional(),
}).strict();

export function searchWorkspace(db: Pick<AppDatabase, "select">, ownerId: string, input: unknown) {
  const data = searchSchema.parse(input), q = data.q.toLowerCase();
  const items: WorkItem[] = [
    ...listProjects(db, ownerId).filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q) &&
      (!data.status || p.status === data.status) && !data.priority && !data.important && !data.urgent && (!data.projectId || p.id === data.projectId) &&
      (!data.date || p.deadline === data.date)).map((p) => ({
      kind: "project" as const, id: p.id, title: p.name, href: `/projects/${p.id}`, date: p.deadline, dateKind: p.deadline ? "deadline" as const : null, updatedAt: p.updatedAt,
    })),
    ...listTasks(db, ownerId).filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q) &&
      (!data.status || t.status === data.status) && (!data.priority || t.priority === data.priority) &&
      (!data.important || t.important === (data.important === "unset" ? null : data.important === "true")) &&
      (!data.urgent || t.urgent === (data.urgent === "unset" ? null : data.urgent === "true")) &&
      (!data.projectId || (data.projectId === "inbox" ? !t.projectId : t.projectId === data.projectId)) &&
       (!data.date || t.plannedDate === data.date || t.dueDate === data.date || (t.dueAt && dateInTimezone(t.dueAt, t.timezone!) === data.date))).map((t) => ({
      kind: "task" as const, id: t.id, title: t.title, href: `${t.projectId ? `/projects/${t.projectId}` : "/inbox"}?task=${t.id}`,
      date: t.dueDate ?? t.dueAt ?? t.plannedDate, dateKind: t.dueDate || t.dueAt ? "deadline" as const : t.plannedDate ? "planned" as const : null,
      updatedAt: t.updatedAt,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items: items.slice(0, 100), total: items.length };
}

export function homeData(db: Pick<AppDatabase, "select">, ownerId: string, timezone: string, now = new Date().toISOString()) {
  const today = dateInTimezone(now, timezone), projects = listProjects(db, ownerId), tasks = listTasks(db, ownerId);
  const overdue = tasks.filter((t) => t.status !== "Done" && (t.dueDate ? t.dueDate < today : t.dueAt ? Date.parse(t.dueAt) < Date.parse(now) : false));
  const dueToday = tasks.filter((t) => t.status !== "Done" && (t.dueDate === today || Boolean(t.dueAt && dateInTimezone(t.dueAt, timezone) === today)));
  const plannedToday = tasks.filter((t) => t.plannedDate === today);
  const currentDay = tasks.filter((t) => t.plannedDate === today || t.dueDate === today ||
    Boolean(t.dueAt && dateInTimezone(t.dueAt, timezone) === today));
  const todayTasks = [...new Map([...overdue, ...currentDay].map((t) => [t.id, t])).values()]
    .sort((a, b) => (a.status === "Done" ? 1 : 0) - (b.status === "Done" ? 1 : 0) ||
      (a.dueDate ?? a.plannedDate ?? a.dueAt ?? "").localeCompare(b.dueDate ?? b.plannedDate ?? b.dueAt ?? "") ||
      a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map((t) => ({ ...t, warnings: dependencyWarnings(db, ownerId, t.id) }));
  return {
    projects: projects.filter((p) => p.status === "Active").map((p) => ({ ...p, progress: getProjectProgress(db, ownerId, p.id) })),
    overdue, dueToday, plannedToday, todayTasks,
    todayProgress: { done: currentDay.filter((t) => t.status === "Done").length, total: currentDay.length },
    tasks,
  };
}
