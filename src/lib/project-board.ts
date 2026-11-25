import type { Event, Project, Task } from "./db/schema";
import { dateInTimezone } from "./dates";

/** Selection key for the left pane: a project id, or "none" for loose tasks. */
export const NO_PROJECT = "none";
export const projectGroups = ["Active", "Planned", "Paused", "Done"] as const;
export const taskColumns = ["To do", "Done"] as const;

type Ordered = { id: string; position: number; createdAt: string };
const byOrder = (a: Ordered, b: Ordered) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);

/** A task's deadline as a calendar date: the date-only due date, or a timed deadline's date in its own zone. */
export function taskDeadline(task: Pick<Task, "dueDate" | "dueAt" | "timezone">) {
  return task.dueDate ?? (task.dueAt ? dateInTimezone(task.dueAt, task.timezone ?? "UTC") : null);
}

export type Deadline = { date: string; kind: "project" | "task" };
export type Summary = { done: number; total: number; next: Deadline | null };

/**
 * Progress (done / total tasks) and the next deadline: the earliest of the project's own deadline
 * and its open tasks' deadlines. Overdue dates count, since they are still the next thing due.
 * A Done project has no next deadline.
 */
export function summarize(project: Pick<Project, "deadline" | "status"> | null, tasks: Task[]): Summary {
  const done = tasks.filter((t) => t.status === "Done").length;
  if (project?.status === "Done") return { done, total: tasks.length, next: null };
  const dates: Deadline[] = tasks.filter((t) => t.status !== "Done").flatMap((t) => {
    const date = taskDeadline(t);
    return date ? [{ date, kind: "task" as const }] : [];
  });
  if (project?.deadline) dates.push({ date: project.deadline, kind: "project" });
  // Project first on a tie: the project deadline is the stronger signal.
  dates.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "project" ? -1 : 1));
  return { done, total: tasks.length, next: dates[0] ?? null };
}

/** True when a live Active project has zero open ("To do") tasks. */
export function isEmptyActiveProject(
  project: Pick<Project, "status" | "archivedAt" | "deletedAt"> | null | undefined,
  summaryOrTasks: Summary | readonly Pick<Task, "status" | "archivedAt" | "deletedAt">[],
): boolean {
  if (!project || project.status !== "Active" || project.archivedAt || project.deletedAt) return false;
  if (Array.isArray(summaryOrTasks)) {
    return !summaryOrTasks.some((t) => !t.archivedAt && !t.deletedAt && t.status !== "Done");
  }
  const summary = summaryOrTasks as Summary;
  return summary.total - summary.done === 0;
}

/** Tasks grouped by project key ("none" for loose tasks), each list in board order. */
export function tasksByProject(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const t of [...tasks].sort(byOrder)) {
    const key = t.projectId ?? NO_PROJECT;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return groups;
}

/** Projects split into status groups (archived apart), each in list order. */
export function groupProjects(projects: Project[]) {
  const sorted = [...projects].sort(byOrder);
  const live = sorted.filter((p) => !p.archivedAt);
  return {
    ...Object.fromEntries(projectGroups.map((s) => [s, live.filter((p) => p.status === s)])) as Record<Project["status"], Project[]>,
    archived: sorted.filter((p) => p.archivedAt),
  };
}

export type ReorderPlan<T> = {
  /** Optimistic state: every item, with the moved item and its new group renumbered. */
  next: T[];
  orderedIds: string[];
  expectedRevisions: { id: string; revision: number }[];
};

type Movable = Ordered & { revision: number };

/**
 * Plan a move into a group at an index (end when omitted), in the shape the reorder APIs expect:
 * the destination group's full order, and the revisions of every row the server will rewrite.
 */
function plan<T extends Movable>(items: T[], id: string, inGroup: (item: T) => boolean, patch: (item: T) => T, index?: number): ReorderPlan<T> | null {
  const moving = items.find((i) => i.id === id);
  if (!moving) return null;
  const target = items.filter((i) => i.id !== id && inGroup(i)).sort(byOrder);
  const at = Math.max(0, Math.min(index ?? target.length, target.length));
  target.splice(at, 0, moving);
  const positions = new Map(target.map((t, position) => [t.id, position]));
  const affected = items.filter((i) => i.id === id || inGroup(i));
  return {
    next: items.map((i) => positions.has(i.id) ? { ...(i.id === id ? patch(i) : i), position: positions.get(i.id)! } : i),
    orderedIds: target.map((t) => t.id),
    expectedRevisions: affected.map((t) => ({ id: t.id, revision: t.revision })),
  };
}

/** Move a task to a project ("none" for loose) and status, at an index in that column. */
export function planTaskMove(tasks: Task[], id: string, to: { projectId: string | null; status: Task["status"]; index?: number }, now = new Date().toISOString()) {
  return plan(tasks, id, (t) => t.projectId === to.projectId && t.status === to.status,
    (t) => ({ ...t, projectId: to.projectId, status: to.status, completedAt: to.status === "Done" ? t.completedAt ?? now : null }), to.index);
}

/** Move a live project to a status group, at an index in that group. */
export function planProjectMove(projects: Project[], id: string, to: { status: Project["status"]; index?: number }) {
  return plan(projects.filter((p) => !p.archivedAt), id, (p) => p.status === to.status, (p) => ({ ...p, status: to.status }), to.index);
}

/**
 * Events still ahead (or under way) for a selection: linked to the project directly or through one of its
 * tasks. For "none", standalone events and events linked to loose tasks. Soonest first.
 */
export function upcomingEvents(events: Event[], tasks: Task[], key: string, now: string, timezone: string, limit = 5) {
  const taskProject = new Map(tasks.map((t) => [t.id, t.projectId ?? NO_PROJECT]));
  const today = dateInTimezone(now, timezone);
  return events.filter((e) => {
    const owner = e.taskId ? taskProject.get(e.taskId) : e.projectId ?? NO_PROJECT;
    if (owner !== key) return false;
    return e.allDay ? e.end > today : Date.parse(e.end) > Date.parse(now);
  }).sort((a, b) => eventStart(a, timezone).localeCompare(eventStart(b, timezone))).slice(0, limit);
}

const eventStart = (e: Event, timezone: string) => e.allDay ? `${e.start}T00:00` : new Date(e.start).toLocaleString("sv-SE", { timeZone: timezone }).replace(" ", "T");
