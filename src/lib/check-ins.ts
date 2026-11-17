import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "./db";
import { checkIn, task, type CheckIn } from "./db/schema";
import { getTask } from "./tasks";
import { getProject } from "./projects";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "./activity";

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
