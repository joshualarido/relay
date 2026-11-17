import { z } from "zod";
import type { AppDatabase } from "./db";
import { project, task, type Project, type Snapshot } from "./db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { dateOnlySchema } from "./dates";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "./activity";
import { AppError } from "./errors";
import { dependencyWarnings } from "./dependencies";

export const projectStatuses = ["Planned", "Active", "Paused", "Done"] as const;

const fields = {
  name: z.string().trim().min(1, "Enter a project name.").max(200),
  description: z.string().max(20_000),
  status: z.enum(projectStatuses),
  deadline: dateOnlySchema.nullable(),
  position: z.number().int().min(0).max(1_000_000),
};
const createSchema = z.object({
  ...fields,
  description: fields.description.default(""),
  status: fields.status.default("Planned"),
  deadline: fields.deadline.default(null),
  position: fields.position.default(0),
  mutationId: mutationIdSchema,
}).strict();
const completionSchema = z.object({
  projectId: z.string(), revision: z.number().int().positive(),
  tasks: z.array(z.object({ id: z.string(), revision: z.number().int().positive(), title: z.string(),
    status: z.string(), warnings: z.array(z.string()) }).strict()),
}).strict();
export type CompletionPreview = z.infer<typeof completionSchema>;
const updateSchema = z.object({ ...fields }).partial().extend({ mutationId: mutationIdSchema, completionPreview: completionSchema.optional() }).strict();
const archiveSchema = z.object({ archived: z.boolean(), mutationId: mutationIdSchema }).strict();

export function listProjects(db: Pick<AppDatabase, "select">, ownerId: string, archived = false) {
  return db.select().from(project).where(and(eq(project.ownerId, ownerId), isNull(project.deletedAt)))
    .orderBy(asc(project.position), asc(project.createdAt)).all().filter((p) => Boolean(p.archivedAt) === archived);
}

export function getProject(db: Pick<AppDatabase, "select">, ownerId: string, id: string): Project {
  const result = db.select().from(project).where(and(eq(project.id, id), eq(project.ownerId, ownerId), isNull(project.deletedAt))).get();
  if (!result) throw new AppError(404, "Project not found.");
  return result;
}

export function getProjectProgress(db: Pick<AppDatabase, "select">, ownerId: string, id: string) {
  const p = getProject(db, ownerId, id);
  const rows = p.archivedAt ? [] : db.select({ status: task.status }).from(task)
    .where(and(eq(task.ownerId, ownerId), eq(task.projectId, id), isNull(task.deletedAt))).all();
  const done = rows.filter((t) => t.status === "Done").length;
  return { total: rows.length, done, percent: rows.length ? Math.round(done / rows.length * 100) : 0 };
}

export function previewProjectCompletion(db: Pick<AppDatabase, "select">, ownerId: string, id: string): CompletionPreview {
  const p = getProject(db, ownerId, id);
  const children = db.select().from(task).where(and(eq(task.ownerId, ownerId), eq(task.projectId, id), isNull(task.deletedAt))).all();
  return { projectId: id, revision: p.revision, tasks: children.sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({
    id: t.id, revision: t.revision, title: t.title, status: t.status,
    warnings: [...(t.blockerReason ? [t.blockerReason] : []), ...dependencyWarnings(db, ownerId, t.id)],
  })) };
}

function completeChildren(db: Pick<AppDatabase, "select" | "update">, ownerId: string, id: string, preview?: CompletionPreview) {
  const current = previewProjectCompletion(db, ownerId, id);
  if ((current.tasks.length || preview) && JSON.stringify(current) !== JSON.stringify(preview)) {
    throw new AppError(409, "Unfinished tasks or affected records changed. Review a new completion preview.");
  }
  const beforeState: Snapshot[] = [], afterState: Snapshot[] = [];
  const now = new Date().toISOString();
  for (const child of current.tasks.filter((t) => t.status !== "Done")) {
    const before = db.select().from(task).where(and(eq(task.id, child.id), eq(task.ownerId, ownerId))).get()!;
    beforeState.push({ entityType: "task", record: before });
    const result = db.update(task).set({ status: "Done", completedAt: now, updatedAt: now, revision: before.revision + 1 })
      .where(and(eq(task.id, child.id), eq(task.ownerId, ownerId))).returning().get()!;
    afterState.push({ entityType: "task", record: result });
  }
  return { beforeState, afterState };
}

export function createProject(db: AppDatabase, ownerId: string, input: unknown): Project {
  const { mutationId, ...data } = createSchema.parse(input);
  const hash = requestHash("create", null, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Project;
    const now = new Date().toISOString();
    const result = tx.insert(project).values({
      ...data, id: crypto.randomUUID(), ownerId, createdAt: now, updatedAt: now,
    }).returning().get();
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "create", entityType: "project", entityId: result.id,
      beforeState: [], afterState: [{ entityType: "project", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function updateProject(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown): Project {
  const { mutationId, completionPreview, ...data } = updateSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash("edit", id, { expectedRevision, ...data, completionPreview });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Project;
    const before = getProject(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Project changed. Reload and try again.");
    const children = data.status === "Done" && before.status !== "Done"
      ? completeChildren(tx, ownerId, id, completionPreview) : { beforeState: [], afterState: [] };
    const result = tx.update(project).set({ ...data, revision: before.revision + 1, updatedAt: new Date().toISOString() })
      .where(and(eq(project.id, id), eq(project.ownerId, ownerId), eq(project.revision, expectedRevision))).returning().get()!;
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "edit", entityType: "project", entityId: id,
      beforeState: [{ entityType: "project", record: before }, ...children.beforeState],
      afterState: [{ entityType: "project", record: result }, ...children.afterState], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function archiveProject(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown): Project {
  const data = archiveSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash("archive", id, { expectedRevision, ...data });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, data.mutationId, hash);
    if (previous) return previous.result as Project;
    const before = getProject(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Project changed. Reload and try again.");
    const result = tx.update(project).set({
      archivedAt: data.archived ? new Date().toISOString() : null,
      revision: before.revision + 1, updatedAt: new Date().toISOString(),
    }).where(and(eq(project.id, id), eq(project.ownerId, ownerId))).returning().get()!;
    recordOperation(tx, {
      ownerId, mutationId: data.mutationId, requestHash: hash, action: data.archived ? "archive" : "unarchive",
      entityType: "project", entityId: id, beforeState: [{ entityType: "project", record: before }],
      afterState: [{ entityType: "project", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function reorderProjects(db: AppDatabase, ownerId: string, input: unknown) {
  const data = z.object({
    id: z.string(), status: z.enum(projectStatuses), orderedIds: z.array(z.string()).max(1000),
    expectedRevisions: z.array(z.object({ id: z.string(), revision: z.number().int().positive() }).strict()),
    completionPreview: completionSchema.optional(),
    mutationId: mutationIdSchema,
  }).strict().parse(input);
  const hash = requestHash("reorder", data.id, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, data.mutationId, hash);
    if (previous) return previous.result as Project[];
    const all = listProjects(tx, ownerId);
    const moving = all.find((p) => p.id === data.id);
    if (!moving) throw new AppError(404, "Project not found.");
    const affected = all.filter((p) => p.status === data.status || p.id === data.id);
    const ids = new Set(data.orderedIds);
    if (ids.size !== data.orderedIds.length || ids.size !== affected.length ||
      affected.some((p) => !ids.has(p.id)) ||
      data.expectedRevisions.length !== affected.length ||
      affected.some((p) => data.expectedRevisions.filter((r) => r.id === p.id && r.revision === p.revision).length !== 1)) {
      throw new AppError(409, "Project order changed. Reload and try again.");
    }
    const children = data.status === "Done" && moving.status !== "Done"
      ? completeChildren(tx, ownerId, moving.id, data.completionPreview) : { beforeState: [], afterState: [] };
    const results = data.orderedIds.map((id, position) => {
      const before = affected.find((p) => p.id === id)!;
      return tx.update(project).set({ status: data.status, position, revision: before.revision + 1, updatedAt: new Date().toISOString() })
        .where(and(eq(project.id, id), eq(project.ownerId, ownerId))).returning().get()!;
    });
    recordOperation(tx, {
      ownerId, mutationId: data.mutationId, requestHash: hash, action: "reorder", entityType: "project", entityId: data.id,
      beforeState: [...affected.map((record): Snapshot => ({ entityType: "project", record })), ...children.beforeState],
      afterState: [...results.map((record): Snapshot => ({ entityType: "project", record })), ...children.afterState], result: results,
    });
    return results;
  }, { behavior: "immediate" });
}
