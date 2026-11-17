import type { AppDatabase } from "./db";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { project, task, event, checkIn, dependency, activity, type Snapshot } from "./db/schema";
import { normalizeSnapshot } from "./legacy";
import { AppError } from "./errors";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "./activity";
import { assertNoCycle } from "./dependencies";

const deletionSchema = z.object({
  entityType: z.enum(["project", "task", "event"]),
  id: z.string().min(1),
  records: z.array(z.object({
    entityType: z.enum(["project", "task", "event", "check-in", "dependency"]), id: z.string(), revision: z.number().int().positive(), label: z.string(),
  }).strict()),
}).strict();

export type DeletionPreview = z.infer<typeof deletionSchema>;

export function previewDeletion(db: Pick<AppDatabase, "select">, ownerId: string, entityType: DeletionPreview["entityType"], id: string): DeletionPreview {
  if (entityType === "event") {
    const e = db.select().from(event).where(and(eq(event.id, id), eq(event.ownerId, ownerId), isNull(event.deletedAt))).get();
    if (!e) throw new AppError(404, "Event not found.");
    return { entityType, id, records: [{ entityType, id, revision: e.revision, label: e.title }] };
  }
  let records: DeletionPreview["records"];
  if (entityType === "task") {
    const t = db.select().from(task).where(and(eq(task.id, id), eq(task.ownerId, ownerId), isNull(task.deletedAt))).get();
    if (!t) throw new AppError(404, "Task not found.");
    records = [{ entityType, id, revision: t.revision, label: t.title }];
  } else {
  const p = db.select().from(project).where(and(eq(project.id, id), eq(project.ownerId, ownerId), isNull(project.deletedAt))).get();
  if (!p) throw new AppError(404, "Project not found.");
  const children = db.select().from(task).where(and(eq(task.projectId, id), eq(task.ownerId, ownerId), isNull(task.deletedAt))).all();
  records = [
    { entityType: "project", id, revision: p.revision, label: p.name },
    ...children.sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({ entityType: "task" as const, id: t.id, revision: t.revision, label: t.title })),
  ];
  }
  const taskIds = new Set(records.filter((r) => r.entityType === "task").map((r) => r.id));
  const children = db.select().from(event).where(and(eq(event.ownerId, ownerId), isNull(event.deletedAt))).all()
    .filter((e) => (entityType === "project" && e.projectId === id) || (e.taskId && taskIds.has(e.taskId)));
  records.push(...children.sort((a, b) => a.id.localeCompare(b.id)).map((e) => ({ entityType: "event" as const, id: e.id, revision: e.revision, label: e.title })));
  const checkins = db.select().from(checkIn).where(and(eq(checkIn.ownerId, ownerId), isNull(checkIn.deletedAt))).all()
    .filter((c) => (entityType === "project" && c.projectId === id) || (c.taskId && taskIds.has(c.taskId)));
  records.push(...checkins.sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ entityType: "check-in" as const, id: c.id, revision: c.revision, label: c.content })));
  const edges = db.select().from(dependency).where(and(eq(dependency.ownerId, ownerId), isNull(dependency.deletedAt))).all()
    .filter((d) => taskIds.has(d.taskId) || taskIds.has(d.prerequisiteId));
  records.push(...edges.sort((a, b) => a.id.localeCompare(b.id)).map((d) => ({ entityType: "dependency" as const, id: d.id, revision: d.revision, label: "Task dependency reference" })));
  return { entityType, id, records };
}

export function confirmDeletion(db: AppDatabase, ownerId: string, input: unknown) {
  const { mutationId, ...preview } = deletionSchema.extend({ mutationId: mutationIdSchema }).parse(input);
  const hash = requestHash("soft-delete", preview.id, preview);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as { operationId: string };
    const current = previewDeletion(tx, ownerId, preview.entityType, preview.id);
    if (JSON.stringify(current) !== JSON.stringify(preview)) throw new AppError(409, "Affected records changed. Review a new deletion preview.");
    const operationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const beforeState: Snapshot[] = [];
    const afterState: Snapshot[] = [];
    for (const record of current.records) {
      const data = { deletedAt: now, deletionOperationId: operationId, revision: record.revision + 1, updatedAt: now };
      if (record.entityType === "project") {
        const before = tx.select().from(project).where(and(eq(project.id, record.id), eq(project.ownerId, ownerId))).get()!;
        beforeState.push({ entityType: "project", record: before });
        afterState.push({ entityType: "project", record: tx.update(project).set(data).where(eq(project.id, record.id)).returning().get()! });
      } else if (record.entityType === "task") {
        const before = tx.select().from(task).where(and(eq(task.id, record.id), eq(task.ownerId, ownerId))).get()!;
        beforeState.push({ entityType: "task", record: before });
        afterState.push({ entityType: "task", record: tx.update(task).set(data).where(eq(task.id, record.id)).returning().get()! });
      } else if (record.entityType === "event") {
        const before = tx.select().from(event).where(and(eq(event.id, record.id), eq(event.ownerId, ownerId))).get()!;
        beforeState.push({ entityType: "event", record: before });
        afterState.push({ entityType: "event", record: tx.update(event).set(data).where(eq(event.id, record.id)).returning().get()! });
      } else if (record.entityType === "check-in") {
        const before = tx.select().from(checkIn).where(and(eq(checkIn.id, record.id), eq(checkIn.ownerId, ownerId))).get()!;
        beforeState.push({ entityType: "check-in", record: before });
        afterState.push({ entityType: "check-in", record: tx.update(checkIn).set(data).where(eq(checkIn.id, record.id)).returning().get()! });
      } else {
        const before = tx.select().from(dependency).where(and(eq(dependency.id, record.id), eq(dependency.ownerId, ownerId))).get()!;
        beforeState.push({ entityType: "dependency", record: before });
        afterState.push({ entityType: "dependency", record: tx.update(dependency).set(data).where(eq(dependency.id, record.id)).returning().get()! });
      }
    }
    const result = { operationId };
    recordOperation(tx, {
      id: operationId, ownerId, mutationId, requestHash: hash, action: "soft-delete", entityType: preview.entityType, entityId: preview.id,
      beforeState, afterState, result,
    });
    return result;
  }, { behavior: "immediate" });
}

const tables = { project, task, event, "check-in": checkIn, dependency };
const snapshotKey = (s: Snapshot) => `${s.entityType}:${s.record.id}`;

function recoverOperation(db: AppDatabase, ownerId: string, operationId: string, input: unknown, restore: boolean) {
  const { mutationId } = z.object({ mutationId: mutationIdSchema }).strict().parse(input);
  z.string().min(1).parse(operationId);
  const action = restore ? "restore" : "undo", hash = requestHash(action, operationId, {});
  return db.transaction((tx) => {
    const replay = replayMutation(tx, ownerId, mutationId, hash);
    if (replay) return replay.result as { operationId: string };
    const stored = tx.select().from(activity).where(and(eq(activity.id, operationId), eq(activity.ownerId, ownerId))).get();
    // Pre-v3 snapshots may hold legacy statuses; normalize once so comparisons and re-applied states use v3 values.
    const original = stored && { ...stored, beforeState: stored.beforeState.map(normalizeSnapshot), afterState: stored.afterState.map(normalizeSnapshot) };
    if (!original) throw new AppError(404, "Operation not found.");
    if (original.undoneAt) throw new AppError(409, "This operation was already undone or restored.");
    const deletion = original.beforeState.length > 0 && original.beforeState.every((s) => !s.record.deletedAt) &&
      original.afterState.every((s) => Boolean(s.record.deletedAt));
    if (restore ? !deletion : ["undo", "restore"].includes(original.action)) {
      throw new AppError(409, "This recovery operation is not supported. Use a deletion's Restore action where available.");
    }
    for (const expected of original.afterState) {
      const table = tables[expected.entityType];
      const current = tx.select().from(table).where(and(eq(table.id, expected.record.id), eq(table.ownerId, ownerId))).get();
      if (!current || Object.entries(expected.record).some(([key, value]) => current[key as keyof typeof current] !== value)) {
        throw new AppError(409, "Affected records changed. Recovery would overwrite later work; nothing was changed.");
      }
    }
    const now = new Date().toISOString(), id = crypto.randomUUID();
    const creating = original.beforeState.length === 0;
    if (creating) {
      for (const s of original.afterState) {
        const related = s.entityType === "project"
          ? [task, event, checkIn].some((table) => tx.select().from(table).where(and(eq(table.ownerId, ownerId), eq(table.projectId, s.record.id))).get())
          : s.entityType === "task" && (
            [event, checkIn].some((table) => tx.select().from(table).where(and(eq(table.ownerId, ownerId), eq(table.taskId, s.record.id))).get()) ||
            tx.select().from(dependency).where(eq(dependency.ownerId, ownerId)).all().some((d) => d.taskId === s.record.id || d.prerequisiteId === s.record.id)
          );
        if (related) throw new AppError(409, "Later dependent records exist, including recoverable children. Use the normal previewed deletion instead.");
      }
    }
    const afterState = (creating ? original.afterState : original.beforeState).map((s): Snapshot => {
      const current = original.afterState.find((a) => snapshotKey(a) === snapshotKey(s))!;
      return { ...s, record: {
        ...s.record, revision: current.record.revision + 1, updatedAt: now,
        ...(creating ? { deletedAt: now, deletionOperationId: id } : {}),
      } } as Snapshot;
    });
    // Validate the resulting graph before writing, including parents restored in this operation.
    const proposed = new Map(afterState.map((s) => [snapshotKey(s), s.record]));
    function parent(kind: "project" | "task", parentId: string) {
      const table = tables[kind], value = proposed.get(`${kind}:${parentId}`) ??
        tx.select().from(table).where(and(eq(table.id, parentId), eq(table.ownerId, ownerId))).get();
      if (!value || value.ownerId !== ownerId || value.deletedAt) throw new AppError(409, "A required parent is no longer available. Restore its deletion first.");
    }
    for (const s of afterState) {
      if (s.record.deletedAt) continue;
      if ("projectId" in s.record && s.record.projectId) parent("project", s.record.projectId);
      if ("taskId" in s.record && s.record.taskId) parent("task", s.record.taskId);
      if (s.entityType === "dependency") parent("task", s.record.prerequisiteId);
    }
    if (afterState.some((s) => s.entityType === "dependency")) {
      const edges = tx.select().from(dependency).where(eq(dependency.ownerId, ownerId)).all()
        .filter((d) => !proposed.has(`dependency:${d.id}`));
      edges.push(...afterState.flatMap((s) => s.entityType === "dependency" ? [s.record] : []));
      const live = edges.filter((d) => !d.deletedAt), pairs = new Set<string>();
      for (const d of live) {
        const pair = JSON.stringify([d.taskId, d.prerequisiteId]);
        if (pairs.has(pair)) throw new AppError(409, "A matching dependency exists. Recovery would duplicate it.");
        pairs.add(pair);
      }
      assertNoCycle(live);
    }
    for (const s of afterState) {
      const table = tables[s.entityType];
      tx.update(table).set(s.record).where(and(eq(table.id, s.record.id), eq(table.ownerId, ownerId))).run();
    }
    tx.update(activity).set({ undoneAt: now }).where(and(eq(activity.id, operationId), eq(activity.ownerId, ownerId))).run();
    const result = { operationId: id };
    recordOperation(tx, {
      id, ownerId, mutationId, requestHash: hash, action, entityType: original.entityType, entityId: original.entityId,
      beforeState: original.afterState, afterState, result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function undoOperation(db: AppDatabase, ownerId: string, operationId: string, input: unknown) {
  return recoverOperation(db, ownerId, operationId, input, false);
}

export function restoreDeletion(db: AppDatabase, ownerId: string, operationId: string, input: unknown) {
  return recoverOperation(db, ownerId, operationId, input, true);
}
