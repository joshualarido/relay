import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "./db";
import { dependency, type Dependency } from "./db/schema";
import { getTask, listTasks } from "./tasks";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "./activity";
import { AppError } from "./errors";

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

export function assertNoCycle(edges: Pick<Dependency, "taskId" | "prerequisiteId">[]) {
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new AppError(409, "This dependency would create a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of edges) if (edge.taskId === id) visit(edge.prerequisiteId);
    visiting.delete(id); visited.add(id);
  }
  for (const edge of edges) visit(edge.taskId);
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
