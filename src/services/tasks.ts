import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../lib/db";
import { event, task, type Snapshot, type Task } from "../lib/db/schema";
import { DEFAULT_TASK_TYPE_MINUTES, type TaskTypeMinutes } from "../lib/capacity";
import { dateInTimezone, dateOnlySchema } from "../lib/dates";
import { getPreferences, timezoneSchema } from "../lib/preferences";
import { nextOccurrenceDate, nextOccurrenceOnOrAfter, recurrenceRuleSchema } from "../lib/recurrence";
import { getProject, listProjects } from "./projects";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "../lib/activity";
import { AppError } from "../lib/errors";

export const taskStatuses = ["To do", "Done"] as const;
export const taskTypes = ["Instant", "Medium", "Deep"] as const;
export type TaskType = (typeof taskTypes)[number];

export const TASK_TYPE_MINUTES: Record<TaskType, number> = { ...DEFAULT_TASK_TYPE_MINUTES };

export function taskTypeDurationMinutes(taskType?: TaskType | null, weights?: TaskTypeMinutes): number {
  const map = weights ?? TASK_TYPE_MINUTES;
  return map[taskType ?? "Medium"] ?? map.Medium;
}

export const taskFields = {
  title: z.string().min(1).max(500).refine((v) => v.trim().length > 0, "Enter a task title."),
  description: z.string().max(20_000),
  projectId: z.string().min(1).nullable(),
  status: z.enum(taskStatuses),
  taskType: z.enum(taskTypes),
  durationMinutes: z.number().int().min(1).max(1440).nullable(),
  important: z.boolean().nullable(),
  executionDate: dateOnlySchema.nullable(),
  dayOrder: z.number().int().min(0).max(1_000_000),
  recurrenceRule: recurrenceRuleSchema.nullable(),
  recurrenceSeriesId: z.string().min(1).nullable(),
  dueDate: dateOnlySchema.nullable(),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  startAt: z.string().max(100).nullable(),
  endAt: z.string().max(100).nullable(),
  allDay: z.boolean(),
  timezone: timezoneSchema.nullable(),
  position: z.number().int().min(0).max(1_000_000),
};

export const createTaskSchema = z.object({
  ...taskFields,
  description: taskFields.description.default(""),
  projectId: taskFields.projectId.default(null),
  status: taskFields.status.default("To do"),
  taskType: taskFields.taskType.default("Medium"),
  durationMinutes: taskFields.durationMinutes.default(null),
  important: taskFields.important.default(null),
  executionDate: taskFields.executionDate.default(null),
  dayOrder: taskFields.dayOrder.default(0),
  recurrenceRule: taskFields.recurrenceRule.default(null),
  recurrenceSeriesId: taskFields.recurrenceSeriesId.default(null),
  dueDate: taskFields.dueDate.default(null),
  dueAt: taskFields.dueAt.default(null),
  startAt: taskFields.startAt.default(null),
  endAt: taskFields.endAt.default(null),
  allDay: taskFields.allDay.default(false),
  timezone: taskFields.timezone.default(null),
  position: taskFields.position.default(0),
  mutationId: mutationIdSchema,
}).strict();

export const updateTaskSchema = z.object(taskFields)
  .partial()
  .extend({ mutationId: mutationIdSchema })
  .strict();

export const archiveTaskSchema = z.object({
  archived: z.boolean(),
  mutationId: mutationIdSchema,
}).strict();

export const completeTaskSchema = z.object({
  completed: z.boolean().default(true),
  mutationId: mutationIdSchema,
}).strict();

export const moveTaskSchema = z.object({
  projectId: z.string().min(1).nullable().optional(),
  status: z.enum(taskStatuses).optional(),
  taskType: z.enum(taskTypes).optional(),
  executionDate: dateOnlySchema.nullable().optional(),
  dayOrder: z.number().int().min(0).max(1_000_000).optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
  mutationId: mutationIdSchema,
}).strict();

export const reorderDayTasksSchema = z.object({
  executionDate: dateOnlySchema,
  orderedIds: z.array(z.string()).max(2000),
  expectedRevisions: z.array(z.object({ id: z.string(), revision: z.number().int().positive() }).strict()),
  mutationId: mutationIdSchema,
}).strict();

export const reorderTasksSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  status: z.enum(taskStatuses),
  orderedIds: z.array(z.string()).max(2000),
  expectedRevisions: z.array(z.object({ id: z.string(), revision: z.number().int().positive() }).strict()),
  mutationId: mutationIdSchema,
}).strict();

export const listTasksOptionsSchema = z.object({
  projectId: z.string().min(1).nullable().optional(),
  status: z.enum(taskStatuses).optional(),
  taskType: z.enum(taskTypes).optional(),
  important: z.union([z.boolean(), z.literal("unset")]).optional(),
  dueBefore: dateOnlySchema.optional(),
  dueAfter: dateOnlySchema.optional(),
  unscheduledOnly: z.boolean().default(false),
  includeArchived: z.boolean().default(false),
  timezone: timezoneSchema.optional(),
}).strict();

export function validateTaskDeadline(data: { dueDate: string | null; dueAt: string | null; timezone: string | null }) {
  z.object({ dueDate: taskFields.dueDate, dueAt: taskFields.dueAt, timezone: taskFields.timezone }).superRefine((value, ctx) => {
    if (value.dueDate && value.dueAt) ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Choose a date-only or timed deadline, not both." });
    if (Boolean(value.dueAt) !== Boolean(value.timezone)) ctx.addIssue({ code: "custom", path: ["timezone"], message: "A timed deadline needs an IANA timezone." });
  }).parse(data);
}

export function listTasks(db: Pick<AppDatabase, "select">, ownerId: string, includeArchived = false) {
  const rows = db.select().from(task).where(and(eq(task.ownerId, ownerId), isNull(task.deletedAt)))
    .orderBy(asc(task.position), asc(task.createdAt)).all();
  if (includeArchived) return rows;
  const visibleProjects = new Set(listProjects(db, ownerId).map((p) => p.id));
  return rows.filter((t) => !t.archivedAt && (!t.projectId || visibleProjects.has(t.projectId)));
}

export function listTasksWithOptions(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  input: unknown = {},
): Task[] {
  const options = listTasksOptionsSchema.parse(input);
  const timezone = options.timezone ?? getPreferences(db, ownerId).timezone;
  const rows = listTasks(db, ownerId, options.includeArchived);
  let scheduledTaskIds: Set<string> | null = null;
  if (options.unscheduledOnly) {
    const activeEvents = db.select({ taskId: event.taskId }).from(event)
      .where(and(eq(event.ownerId, ownerId), isNull(event.deletedAt), isNull(event.archivedAt))).all();
    scheduledTaskIds = new Set(activeEvents.flatMap((e) => (e.taskId ? [e.taskId] : [])));
  }
  const effectiveDate = (t: Task) =>
    t.executionDate ?? t.dueDate ?? (t.dueAt ? dateInTimezone(t.dueAt, t.timezone ?? timezone) : null);

  return rows.filter((t) => {
    if (options.projectId !== undefined) {
      if (options.projectId === null || options.projectId === "none" || options.projectId === "inbox") {
        if (t.projectId !== null) return false;
      } else if (t.projectId !== options.projectId) {
        return false;
      }
    }
    if (options.status && t.status !== options.status) return false;
    if (options.taskType && t.taskType !== options.taskType) return false;
    if (options.important !== undefined) {
      if (options.important === "unset") {
        if (t.important !== null) return false;
      } else if (t.important !== options.important) {
        return false;
      }
    }
    if (options.dueBefore || options.dueAfter) {
      const due = effectiveDate(t);
      if (!due) return false;
      if (options.dueBefore && due > options.dueBefore) return false;
      if (options.dueAfter && due < options.dueAfter) return false;
    }
    if (options.unscheduledOnly && (Boolean(t.executionDate) || Boolean(t.startAt) || scheduledTaskIds?.has(t.id))) {
      return false;
    }
    return true;
  });
}

export function listArchivedTasks(db: Pick<AppDatabase, "select">, ownerId: string) {
  return db.select().from(task)
    .where(and(eq(task.ownerId, ownerId), isNull(task.deletedAt), isNotNull(task.archivedAt)))
    .orderBy(desc(task.archivedAt), asc(task.createdAt)).all();
}

export function getTask(db: Pick<AppDatabase, "select">, ownerId: string, id: string): Task {
  const result = db.select().from(task).where(and(eq(task.id, id), eq(task.ownerId, ownerId), isNull(task.deletedAt))).get();
  if (!result) throw new AppError(404, "Task not found.");
  if (result.projectId) getProject(db, ownerId, result.projectId);
  return result;
}

// Pre-v3 creates (main@691c3bb) hashed the parsed request in this key order, with legacy statuses
// (default "Backlog") and dormant fields at their defaults; before Phase 1.2 important/urgent/plannedDate were absent.
// A retry of such a create after the upgrade must replay instead of failing as a reused mutation id.
const legacyStatuses = { "To do": ["Backlog", "Next", "In Progress", "Blocked", "Doing"], Done: ["Done"] } as const;
function legacyCreateHashes(data: Omit<z.infer<typeof createTaskSchema>, "mutationId">) {
  const { title, description, projectId, important, dueDate, dueAt, timezone, position } = data;
  return legacyStatuses[data.status].flatMap((status) => {
    const before = { title, description, projectId, status, priority: "Medium" };
    const after = { dueDate, dueAt, timezone, estimateMinutes: null, blockerReason: "", position };
    return [
      requestHash("task-create", null, { ...before, important, urgent: null, plannedDate: null, ...after }),
      ...(important === null ? [requestHash("task-create", null, { ...before, ...after })] : []),
    ];
  });
}

export function createTask(db: AppDatabase, ownerId: string, input: unknown): Task {
  const { mutationId, ...data } = createTaskSchema.parse(input);
  validateTaskDeadline(data);
  const hash = requestHash("task-create", null, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash, legacyCreateHashes(data));
    if (previous) {
      const saved = previous.result as Task;
      return { ...saved, important: saved.important ?? null, urgent: saved.urgent ?? null };
    }
    if (data.projectId) getProject(tx, ownerId, data.projectId);
    const now = new Date().toISOString();
    const recurrenceSeriesId = data.recurrenceRule
      ? (data.recurrenceSeriesId ?? crypto.randomUUID())
      : data.recurrenceSeriesId;
    const result = tx.insert(task).values({
      ...data,
      recurrenceSeriesId,
      dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
      id: crypto.randomUUID(), ownerId, completedAt: data.status === "Done" ? now : null,
      createdAt: now, updatedAt: now,
    }).returning().get();
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "create", entityType: "task", entityId: result.id,
      beforeState: [], afterState: [{ entityType: "task", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function updateTask(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown): Task {
  const { mutationId, ...data } = updateTaskSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash("task-edit", id, { expectedRevision, ...data });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Task;
    const before = getTask(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Task changed. Reload and try again.");
    const merged = { ...before, ...data };
    validateTaskDeadline(merged);
    if (merged.projectId) getProject(tx, ownerId, merged.projectId);
    const now = new Date().toISOString();
    const seriesId = merged.recurrenceRule
      ? (merged.recurrenceSeriesId ?? before.id)
      : merged.recurrenceSeriesId;
    const result = tx.update(task).set({
      ...data,
      recurrenceSeriesId: seriesId,
      dueAt: merged.dueAt ? new Date(merged.dueAt).toISOString() : null,
      completedAt: merged.status === "Done" ? before.completedAt ?? now : null,
      revision: before.revision + 1, updatedAt: now,
    }).where(and(eq(task.id, id), eq(task.ownerId, ownerId))).returning().get()!;

    const afterState: Snapshot[] = [{ entityType: "task", record: result }];

    // Completing a recurring task atomically spawns the next occurrence in the same Undoable operation.
    if (before.status !== "Done" && result.status === "Done" && result.recurrenceRule) {
      const tz = getPreferences(tx, ownerId).timezone;
      const anchor = result.executionDate ?? dateInTimezone(now, tz);
      const nextDate = nextOccurrenceDate(result.recurrenceRule, anchor);
      if (nextDate) {
        const spawned = tx.insert(task).values({
          id: crypto.randomUUID(),
          ownerId,
          projectId: result.projectId,
          title: result.title,
          description: result.description,
          status: "To do",
          taskType: result.taskType,
          durationMinutes: result.durationMinutes,
          important: result.important,
          executionDate: nextDate,
          dayOrder: result.dayOrder,
          recurrenceRule: result.recurrenceRule,
          recurrenceSeriesId: seriesId ?? result.id,
          position: result.position,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        }).returning().get();
        afterState.push({ entityType: "task", record: spawned });
      }
    }

    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "edit", entityType: "task", entityId: id,
      beforeState: [{ entityType: "task", record: before }], afterState, result,
    });
    return result;
  }, { behavior: "immediate" });
}

/**
 * Auto-advances open recurring tasks whose executionDate is before `today`
 * to the earliest matching occurrence on or after `today`.
 */
export function advanceMissedRecurringTasks(db: AppDatabase, ownerId: string, today: string): number {
  const openTasks = db.select().from(task).where(
    and(eq(task.ownerId, ownerId), isNull(task.deletedAt), isNull(task.archivedAt), eq(task.status, "To do")),
  ).all();
  const missed = openTasks.filter(
    (t) => Boolean(t.recurrenceRule && t.executionDate && t.executionDate < today),
  );
  if (missed.length === 0) return 0;
  const now = new Date().toISOString();
  let updated = 0;
  db.transaction((tx) => {
    for (const t of missed) {
      const next = nextOccurrenceOnOrAfter(t.recurrenceRule!, t.executionDate!, today);
      if (next) {
        tx.update(task).set({
          executionDate: next,
          revision: t.revision + 1,
          updatedAt: now,
        }).where(and(eq(task.id, t.id), eq(task.ownerId, ownerId))).run();
      } else {
        tx.update(task).set({
          recurrenceRule: null,
          revision: t.revision + 1,
          updatedAt: now,
        }).where(and(eq(task.id, t.id), eq(task.ownerId, ownerId))).run();
      }
      updated++;
    }
  }, { behavior: "immediate" });
  return updated;
}

export function reorderDayTasks(db: AppDatabase, ownerId: string, input: unknown): Task[] {
  const data = reorderDayTasksSchema.parse(input);
  const hash = requestHash("task-day-reorder", data.executionDate, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, data.mutationId, hash);
    if (previous) return previous.result as Task[];
    const all = listTasks(tx, ownerId);
    const affected = all.filter((t) => t.executionDate === data.executionDate && t.status !== "Done");
    const ids = new Set(data.orderedIds);
    if (
      ids.size !== data.orderedIds.length ||
      ids.size !== affected.length ||
      affected.some((t) => !ids.has(t.id)) ||
      data.expectedRevisions.length !== affected.length ||
      affected.some((t) => data.expectedRevisions.filter((r) => r.id === t.id && r.revision === t.revision).length !== 1)
    ) {
      throw new AppError(409, "Today's queue changed. Reload and try again.");
    }
    const now = new Date().toISOString();
    const result = data.orderedIds.map((id, dayOrder) => {
      const before = affected.find((t) => t.id === id)!;
      return tx.update(task).set({
        dayOrder,
        revision: before.revision + 1,
        updatedAt: now,
      }).where(and(eq(task.id, id), eq(task.ownerId, ownerId))).returning().get()!;
    });
    recordOperation(tx, {
      ownerId,
      mutationId: data.mutationId,
      requestHash: hash,
      action: "reorder",
      entityType: "task",
      entityId: data.orderedIds[0] ?? data.executionDate,
      beforeState: affected.map((record) => ({ entityType: "task", record })),
      afterState: result.map((record) => ({ entityType: "task", record })),
      result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function completeTask(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown): Task {
  const { completed, mutationId } = completeTaskSchema.parse(input);
  return updateTask(db, ownerId, id, expectedRevision, {
    status: completed ? "Done" : "To do",
    mutationId,
  });
}

export function moveTask(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown): Task {
  const { mutationId, ...changes } = moveTaskSchema.parse(input);
  return updateTask(db, ownerId, id, expectedRevision, {
    ...changes,
    mutationId,
  });
}

export function archiveTask(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown): Task {
  const data = archiveTaskSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const action = data.archived ? "archive" : "unarchive";
  const hash = requestHash(`task-${action}`, id, { expectedRevision, archived: data.archived });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, data.mutationId, hash);
    if (previous) return previous.result as Task;
    const before = getTask(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Task changed. Reload and try again.");
    const now = new Date().toISOString();
    const result = tx.update(task).set({
      archivedAt: data.archived ? now : null,
      revision: before.revision + 1,
      updatedAt: now,
    }).where(and(eq(task.id, id), eq(task.ownerId, ownerId))).returning().get()!;
    recordOperation(tx, {
      ownerId, mutationId: data.mutationId, requestHash: hash, action, entityType: "task", entityId: id,
      beforeState: [{ entityType: "task", record: before }], afterState: [{ entityType: "task", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function reorderTasks(db: AppDatabase, ownerId: string, input: unknown): Task[] {
  const data = reorderTasksSchema.parse(input);
  const hash = requestHash("task-reorder", data.id, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, data.mutationId, hash);
    if (previous) return previous.result as Task[];
    if (data.projectId) getProject(tx, ownerId, data.projectId);
    const all = listTasks(tx, ownerId, true);
    getTask(tx, ownerId, data.id);
    const affected = all.filter((t) => t.id === data.id || (t.projectId === data.projectId && t.status === data.status));
    const ids = new Set(data.orderedIds);
    if (ids.size !== data.orderedIds.length || ids.size !== affected.length ||
      affected.some((t) => !ids.has(t.id)) || data.expectedRevisions.length !== affected.length ||
      affected.some((t) => data.expectedRevisions.filter((r) => r.id === t.id && r.revision === t.revision).length !== 1)) {
      throw new AppError(409, "Task order changed. Reload and try again.");
    }
    const now = new Date().toISOString();
    const result = data.orderedIds.map((id, position) => {
      const before = affected.find((t) => t.id === id)!;
      return tx.update(task).set({
        projectId: data.projectId, status: data.status, position, revision: before.revision + 1, updatedAt: now,
        completedAt: data.status === "Done" ? before.completedAt ?? now : null,
      }).where(and(eq(task.id, id), eq(task.ownerId, ownerId))).returning().get()!;
    });
    recordOperation(tx, {
      ownerId, mutationId: data.mutationId, requestHash: hash, action: "reorder", entityType: "task", entityId: data.id,
      beforeState: affected.map((record) => ({ entityType: "task", record })),
      afterState: result.map((record) => ({ entityType: "task", record })), result,
    });
    return result;
  }, { behavior: "immediate" });
}
