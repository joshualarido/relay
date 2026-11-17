import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "./db";
import { task, type Task } from "./db/schema";
import { dateOnlySchema } from "./dates";
import { timezoneSchema } from "./preferences";
import { getProject, listProjects } from "./projects";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "./activity";
import { AppError } from "./errors";

export const taskStatuses = ["To do", "Doing", "Done"] as const;
export const priorities = ["Low", "Medium", "High"] as const;
const fields = {
  title: z.string().min(1).max(500).refine((v) => v.trim().length > 0, "Enter a task title."),
  description: z.string().max(20_000),
  projectId: z.string().min(1).nullable(),
  status: z.enum(taskStatuses),
  priority: z.enum(priorities),
  important: z.boolean().nullable(),
  urgent: z.boolean().nullable(),
  dueDate: dateOnlySchema.nullable(),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  timezone: timezoneSchema.nullable(),
  estimateMinutes: z.number().int().positive().max(1_000_000).nullable(),
  blockerReason: z.string().max(5_000),
  position: z.number().int().min(0).max(1_000_000),
};
const createSchema = z.object({
  ...fields, description: fields.description.default(""), projectId: fields.projectId.default(null),
  status: fields.status.default("To do"), priority: fields.priority.default("Medium"),
  important: fields.important.default(null), urgent: fields.urgent.default(null),
  dueDate: fields.dueDate.default(null), dueAt: fields.dueAt.default(null), timezone: fields.timezone.default(null),
  estimateMinutes: fields.estimateMinutes.default(null), blockerReason: fields.blockerReason.default(""),
  position: fields.position.default(0), mutationId: mutationIdSchema,
}).strict();
const updateSchema = z.object(fields).partial().extend({ mutationId: mutationIdSchema }).strict();

function validateDeadline(data: { dueDate: string | null; dueAt: string | null; timezone: string | null }) {
  z.object({ dueDate: fields.dueDate, dueAt: fields.dueAt, timezone: fields.timezone }).superRefine((value, ctx) => {
    if (value.dueDate && value.dueAt) ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Choose a date-only or timed deadline, not both." });
    if (Boolean(value.dueAt) !== Boolean(value.timezone)) ctx.addIssue({ code: "custom", path: ["timezone"], message: "A timed deadline needs an IANA timezone." });
  }).parse(data);
}

export function listTasks(db: Pick<AppDatabase, "select">, ownerId: string, includeArchived = false) {
  const visibleProjects = new Set(listProjects(db, ownerId).map((p) => p.id));
  return db.select().from(task).where(and(eq(task.ownerId, ownerId), isNull(task.deletedAt)))
    .orderBy(asc(task.position), asc(task.createdAt)).all()
    .filter((t) => includeArchived || !t.projectId || visibleProjects.has(t.projectId));
}

export function getTask(db: Pick<AppDatabase, "select">, ownerId: string, id: string): Task {
  const result = db.select().from(task).where(and(eq(task.id, id), eq(task.ownerId, ownerId), isNull(task.deletedAt))).get();
  if (!result) throw new AppError(404, "Task not found.");
  if (result.projectId) getProject(db, ownerId, result.projectId);
  return result;
}

export function createTask(db: AppDatabase, ownerId: string, input: unknown): Task {
  const { mutationId, ...data } = createSchema.parse(input);
  validateDeadline(data);
  const hash = requestHash("task-create", null, data);
  return db.transaction((tx) => {
    const { important, urgent, ...legacy } = data;
    const previous = replayMutation(tx, ownerId, mutationId, hash,
      important === null && urgent === null ? requestHash("task-create", null, legacy) : undefined);
    if (previous) {
      const saved = previous.result as Task;
      return { ...saved, important: saved.important ?? null, urgent: saved.urgent ?? null };
    }
    if (data.projectId) getProject(tx, ownerId, data.projectId);
    const now = new Date().toISOString();
    const result = tx.insert(task).values({
      ...data, dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
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
  const { mutationId, ...data } = updateSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash("task-edit", id, { expectedRevision, ...data });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Task;
    const before = getTask(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Task changed. Reload and try again.");
    const merged = { ...before, ...data };
    validateDeadline(merged);
    if (merged.projectId) getProject(tx, ownerId, merged.projectId);
    const now = new Date().toISOString();
    const result = tx.update(task).set({
      ...data, dueAt: merged.dueAt ? new Date(merged.dueAt).toISOString() : null,
      completedAt: merged.status === "Done" ? before.completedAt ?? now : null,
      revision: before.revision + 1, updatedAt: now,
    }).where(and(eq(task.id, id), eq(task.ownerId, ownerId))).returning().get()!;
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "edit", entityType: "task", entityId: id,
      beforeState: [{ entityType: "task", record: before }], afterState: [{ entityType: "task", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function reorderTasks(db: AppDatabase, ownerId: string, input: unknown): Task[] {
  const data = z.object({
    id: z.string(), projectId: z.string().nullable(), status: z.enum(taskStatuses),
    orderedIds: z.array(z.string()).max(2000),
    expectedRevisions: z.array(z.object({ id: z.string(), revision: z.number().int().positive() }).strict()),
    mutationId: mutationIdSchema,
  }).strict().parse(input);
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
