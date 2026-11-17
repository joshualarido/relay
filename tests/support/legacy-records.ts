// Pre-v3 check-in and dependency services, kept only to seed the dormant `check_in` / `dependency` tables
// (with their activity records) so tests prove that old data still cascades, undoes and restores correctly.
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../../src/lib/db";
import { checkIn, dependency, task, type CheckIn, type Dependency } from "../../src/lib/db/schema";
import { getTask, listTasks } from "../../src/lib/tasks";
import { getProject } from "../../src/lib/projects";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "../../src/lib/activity";
import { AppError } from "../../src/lib/errors";
import { assertNoCycle } from "../../src/lib/dependencies";

const associationSchema = z.object({ projectId: z.string().min(1).nullable().default(null), taskId: z.string().min(1).nullable().default(null) })
  .refine((v) => Boolean(v.projectId) !== Boolean(v.taskId), { path: ["taskId"], message: "Select one task or project." });
const createSchema = z.object({
  content: z.string().max(20_000).refine((v) => v.trim().length > 0, "Enter a check-in."),
  projectId: z.string().min(1).nullable().default(null), taskId: z.string().min(1).nullable().default(null),
  mutationId: mutationIdSchema,
}).strict();

export function listCheckIns(db: Pick<AppDatabase, "select">, ownerId: string, input: unknown) {
  const association = associationSchema.parse(input);
  const taskIds = association.projectId ? new Set(db.select({ id: task.id }).from(task)
    .where(and(eq(task.ownerId, ownerId), eq(task.projectId, association.projectId), isNull(task.deletedAt))).all().map((t) => t.id)) : new Set<string>();
  return db.select().from(checkIn).where(and(eq(checkIn.ownerId, ownerId), isNull(checkIn.deletedAt))).orderBy(desc(checkIn.createdAt)).all()
    .filter((c) => association.taskId ? c.taskId === association.taskId : c.projectId === association.projectId || (c.taskId && taskIds.has(c.taskId)));
}

export function createCheckIn(db: AppDatabase, ownerId: string, input: unknown): CheckIn {
  const { mutationId, ...data } = createSchema.parse(input);
  associationSchema.parse(data);
  const hash = requestHash("check-in-create", null, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as CheckIn;
    if (data.taskId) getTask(tx, ownerId, data.taskId);
    if (data.projectId) getProject(tx, ownerId, data.projectId);
    const now = new Date().toISOString();
    const result = tx.insert(checkIn).values({ ...data, ownerId, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning().get();
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "create", entityType: "check-in", entityId: result.id,
      beforeState: [], afterState: [{ entityType: "check-in", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function listDependencies(db: Pick<AppDatabase, "select">, ownerId: string, taskId?: string) {
  return db.select().from(dependency).where(and(eq(dependency.ownerId, ownerId), isNull(dependency.deletedAt))).all()
    .filter((d) => !taskId || d.taskId === taskId);
}

export function dependencyWarnings(db: Pick<AppDatabase, "select">, ownerId: string, taskId: string) {
  const tasks = listTasks(db, ownerId, true);
  return listDependencies(db, ownerId, taskId).flatMap((edge) => {
    const prerequisite = tasks.find((t) => t.id === edge.prerequisiteId);
    return prerequisite && prerequisite.status !== "Done" ? [`Waiting on "${prerequisite.title}" (${prerequisite.status}). Status changes are still allowed.`] : [];
  });
}

export function addDependency(db: AppDatabase, ownerId: string, input: unknown): Dependency {
  const { mutationId, ...data } = z.object({ taskId: z.string().min(1), prerequisiteId: z.string().min(1), mutationId: mutationIdSchema }).strict().parse(input);
  const hash = requestHash("dependency-create", null, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Dependency;
    getTask(tx, ownerId, data.taskId); getTask(tx, ownerId, data.prerequisiteId);
    if (data.taskId === data.prerequisiteId) throw new AppError(400, "A task cannot depend on itself.");
    const edges = listDependencies(tx, ownerId);
    if (edges.some((d) => d.taskId === data.taskId && d.prerequisiteId === data.prerequisiteId)) throw new AppError(409, "This dependency already exists.");
    assertNoCycle([...edges, data]);
    const now = new Date().toISOString();
    const result = tx.insert(dependency).values({ ...data, ownerId, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning().get();
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "create", entityType: "dependency", entityId: result.id,
      beforeState: [], afterState: [{ entityType: "dependency", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function removeDependency(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown) {
  const { mutationId } = z.object({ mutationId: mutationIdSchema }).strict().parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash("dependency-remove", id, { expectedRevision });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Dependency;
    const before = tx.select().from(dependency).where(and(eq(dependency.id, id), eq(dependency.ownerId, ownerId), isNull(dependency.deletedAt))).get();
    if (!before) throw new AppError(404, "Dependency not found.");
    if (before.revision !== expectedRevision) throw new AppError(409, "Dependency changed. Reload and try again.");
    const now = new Date().toISOString(), operationId = crypto.randomUUID();
    const result = tx.update(dependency).set({ deletedAt: now, updatedAt: now, deletionOperationId: operationId, revision: before.revision + 1 })
      .where(and(eq(dependency.id, id), eq(dependency.ownerId, ownerId))).returning().get()!;
    recordOperation(tx, {
      id: operationId, ownerId, mutationId, requestHash: hash, action: "remove", entityType: "dependency", entityId: id,
      beforeState: [{ entityType: "dependency", record: before }], afterState: [{ entityType: "dependency", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}
