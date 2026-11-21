import { Temporal } from "temporal-polyfill";
import type { Event, Project, Task } from "./db/schema";
import { dateOnlySchema, instantToLocal, localToInstant } from "./dates";

export const WORKING_HOURS_START = 9;
export const WORKING_HOURS_END = 18;
export const NO_PROJECT_KEY = "__none__";

export type ScheduleTaskGroup = {
  key: string;
  name: string;
  tasks: Task[];
};

export type ScheduleDropTarget =
  | { kind: "time"; startInstant: string }
  | { kind: "day"; date: string };

export type ScheduleDropAction =
  | {
      endpoint: "/api/events";
      method: "POST";
      entityKey: string;
      payload: {
        title: string;
        start: string;
        end: string;
        allDay: false;
        timezone: string;
        taskId: string;
        projectId: null;
      };
    }
  | {
      endpoint: `/api/tasks/${string}`;
      method: "PATCH";
      entityKey: string;
      payload: {
        dueDate: string;
        dueAt: null;
        timezone: null;
        expectedRevision: number;
      };
    }
  | {
      endpoint: `/api/projects/${string}`;
      method: "PATCH";
      entityKey: string;
      payload: {
        deadline: string;
        expectedRevision: number;
      };
    };

export function isWorkingHour(hour: number): boolean {
  return hour >= WORKING_HOURS_START && hour < WORKING_HOURS_END;
}

/**
 * Open tasks with no linked events, grouped by project with "No project" first.
 * `includeTaskIds` keeps highlighted or Shift+dropped tasks visible even if they already have an event.
 */
export function groupUnscheduledTasks(
  tasks: readonly Task[],
  projects: readonly Project[],
  events: readonly Event[],
  options?: {
    query?: string;
    includeTaskIds?: ReadonlySet<string>;
  },
): ScheduleTaskGroup[] {
  const scheduledTaskIds = new Set<string>();
  for (const e of events) {
    if (e.taskId && !e.deletedAt) scheduledTaskIds.add(e.taskId);
  }
  const q = options?.query?.trim().toLowerCase() ?? "";
  const include = options?.includeTaskIds;
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const eligible = tasks.filter((t) => {
    if (t.deletedAt || t.status === "Done") return false;
    const forceInclude = include?.has(t.id) ?? false;
    if (!forceInclude && scheduledTaskIds.has(t.id)) return false;
    if (!q) return true;
    const projectName = t.projectId ? (projectMap.get(t.projectId)?.name ?? "") : "No project";
    return t.title.toLowerCase().includes(q) || projectName.toLowerCase().includes(q);
  });

  const byKey = new Map<string, Task[]>();
  for (const t of eligible) {
    const key = t.projectId && projectMap.has(t.projectId) ? t.projectId : NO_PROJECT_KEY;
    const list = byKey.get(key);
    if (list) list.push(t);
    else byKey.set(key, [t]);
  }

  const groups: ScheduleTaskGroup[] = [];
  const noProject = byKey.get(NO_PROJECT_KEY);
  if (noProject && noProject.length > 0) {
    groups.push({ key: NO_PROJECT_KEY, name: "No project", tasks: noProject });
  }
  for (const p of projects) {
    const list = byKey.get(p.id);
    if (list && list.length > 0) {
      groups.push({ key: p.id, name: p.name, tasks: list });
    }
  }
  return groups;
}

/** Non-archived, non-Done projects with no deadline. */
export function listDatelessProjects(
  projects: readonly Project[],
  query = "",
): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => {
    if (p.deletedAt || p.archivedAt || p.status === "Done" || p.deadline !== null) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q);
  });
}

/** Add minutes to an ISO instant, preserving exact elapsed duration across DST. */
export function addMinutesInstant(startInstant: string, minutes = 60): string {
  return Temporal.Instant.from(startInstant).add({ minutes }).toString();
}

/** Exclusive next calendar date for a 1-day all-day event. */
export function nextCalendarDate(date: string): string {
  dateOnlySchema.parse(date);
  return Temporal.PlainDate.from(date).add({ days: 1 }).toString();
}

/** Build the server mutation for dropping a task onto a time slot or day/all-day row. */
export function buildTaskDropAction(
  task: Pick<Task, "id" | "title" | "revision">,
  target: ScheduleDropTarget,
  timezone: string,
): ScheduleDropAction {
  if (target.kind === "time") {
    const start = Temporal.Instant.from(target.startInstant).toString();
    const end = addMinutesInstant(start, 60);
    return {
      endpoint: "/api/events",
      method: "POST",
      entityKey: `task:${task.id}`,
      payload: {
        title: task.title,
        start,
        end,
        allDay: false,
        timezone,
        taskId: task.id,
        projectId: null,
      },
    };
  }
  dateOnlySchema.parse(target.date);
  return {
    endpoint: `/api/tasks/${task.id}`,
    method: "PATCH",
    entityKey: `task:${task.id}`,
    payload: {
      dueDate: target.date,
      dueAt: null,
      timezone: null,
      expectedRevision: task.revision,
    },
  };
}

/** Build the server mutation for dropping a project. Returns null for time slots (disallowed). */
export function buildProjectDropAction(
  project: Pick<Project, "id" | "revision">,
  target: ScheduleDropTarget,
): ScheduleDropAction | null {
  if (target.kind !== "day") return null;
  dateOnlySchema.parse(target.date);
  return {
    endpoint: `/api/projects/${project.id}`,
    method: "PATCH",
    entityKey: `project:${project.id}`,
    payload: {
      deadline: target.date,
      expectedRevision: project.revision,
    },
  };
}

/** Compute the validated `end` value for an event edge resize, without altering start/allDay/links. */
export function buildEventResizeEnd(
  event: Pick<Event, "allDay" | "start">,
  resizedEnd: { endStr: string; endDate: Date | null },
): string | null {
  if (event.allDay) {
    const nextEnd = resizedEnd.endStr.slice(0, 10);
    if (!dateOnlySchema.safeParse(nextEnd).success || nextEnd <= event.start) return null;
    return nextEnd;
  }
  if (!resizedEnd.endDate || Number.isNaN(resizedEnd.endDate.getTime())) return null;
  const nextEnd = resizedEnd.endDate.toISOString();
  if (Date.parse(nextEnd) <= Date.parse(event.start)) return null;
  return nextEnd;
}

/** Build default local start/end strings for inline event creation. */
export function defaultInlineTimedRange(startInstant: string, timezone: string): { start: string; end: string } {
  const startIso = Temporal.Instant.from(startInstant).toString();
  const endIso = addMinutesInstant(startIso, 60);
  return {
    start: instantToLocal(startIso, timezone).slice(0, 16),
    end: instantToLocal(endIso, timezone).slice(0, 16),
  };
}

/** Build POST /api/events payload for inline event creation. */
export function buildInlineEventPayload(input: {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  timezone: string;
}) {
  const title = input.title;
  if (input.allDay) {
    dateOnlySchema.parse(input.start);
    const end = input.end || nextCalendarDate(input.start);
    dateOnlySchema.parse(end);
    return {
      title,
      start: input.start,
      end,
      allDay: true as const,
      timezone: input.timezone,
      projectId: null,
      taskId: null,
    };
  }
  const start = localToInstant(input.start, input.timezone);
  const end = localToInstant(input.end, input.timezone);
  return {
    title,
    start,
    end,
    allDay: false as const,
    timezone: input.timezone,
    projectId: null,
    taskId: null,
  };
}
