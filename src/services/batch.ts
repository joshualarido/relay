import { and, eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { AppDatabase } from "../lib/db";
import { event, project, task, type Snapshot } from "../lib/db/schema";
import { dateOnlySchema } from "../lib/dates";
import { getPreferences, timezoneSchema } from "../lib/preferences";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "../lib/activity";
import { AppError } from "../lib/errors";
import {
  completeProjectChildrenInTx,
  completionPreviewSchema,
  getProject,
  previewProjectCompletion,
  projectFields,
} from "./projects";
import { getTask, taskFields, taskStatuses, validateTaskDeadline } from "./tasks";
import { eventDatesSchema, eventFields, getEvent, validateEventLinks } from "./events";
import { applyDeletionInTx, deletionPreviewSchema, previewDeletion } from "./lifecycle";

const batchCreateProjectOp = z.object({
  op: z.literal("create_project"),
  name: projectFields.name,
  description: projectFields.description.default(""),
  status: projectFields.status.default("Planned"),
  deadline: projectFields.deadline.default(null),
  position: projectFields.position.default(0),
}).strict();

const batchUpdateProjectOp = z.object({
  op: z.literal("update_project"),
  id: z.string().min(1),
  expectedRevision: z.number().int().positive().optional(),
  name: projectFields.name.optional(),
  description: projectFields.description.optional(),
  status: projectFields.status.optional(),
  deadline: projectFields.deadline.optional(),
  position: projectFields.position.optional(),
  completionPreview: completionPreviewSchema.optional(),
  completeUnfinishedTasks: z.boolean().default(true),
}).strict();

const batchArchiveProjectOp = z.object({
  op: z.literal("archive_project"),
  id: z.string().min(1),
  archived: z.boolean().default(true),
  expectedRevision: z.number().int().positive().optional(),
}).strict();

const batchDeleteProjectOp = z.object({
  op: z.literal("delete_project"),
  id: z.string().min(1),
  preview: deletionPreviewSchema.optional(),
}).strict();

const batchCreateTaskOp = z.object({
  op: z.literal("create_task"),
  title: taskFields.title,
  description: taskFields.description.default(""),
  projectId: taskFields.projectId.default(null),
  status: taskFields.status.default("To do"),
  important: taskFields.important.default(null),
  dueDate: taskFields.dueDate.default(null),
  dueAt: taskFields.dueAt.default(null),
  startAt: taskFields.startAt.default(null),
  endAt: taskFields.endAt.default(null),
  allDay: taskFields.allDay.default(false),
  timezone: taskFields.timezone.default(null),
  position: taskFields.position.default(0),
}).strict();

const batchUpdateTaskOp = z.object({
  op: z.literal("update_task"),
  id: z.string().min(1),
  expectedRevision: z.number().int().positive().optional(),
  title: taskFields.title.optional(),
  description: taskFields.description.optional(),
  projectId: taskFields.projectId.optional(),
  status: taskFields.status.optional(),
  important: taskFields.important.optional(),
  dueDate: taskFields.dueDate.optional(),
  dueAt: taskFields.dueAt.optional(),
  startAt: taskFields.startAt.optional(),
  endAt: taskFields.endAt.optional(),
  allDay: taskFields.allDay.optional(),
  timezone: taskFields.timezone.optional(),
  position: taskFields.position.optional(),
}).strict();

const batchCompleteTaskOp = z.object({
  op: z.literal("complete_task"),
  id: z.string().min(1),
  completed: z.boolean().default(true),
  expectedRevision: z.number().int().positive().optional(),
}).strict();

const batchMoveTaskOp = z.object({
  op: z.literal("move_task"),
  id: z.string().min(1),
  projectId: z.string().min(1).nullable().optional(),
  status: z.enum(taskStatuses).optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
  expectedRevision: z.number().int().positive().optional(),
}).strict();

const batchDeleteTaskOp = z.object({
  op: z.literal("delete_task"),
  id: z.string().min(1),
  preview: deletionPreviewSchema.optional(),
}).strict();

const batchCreateEventOp = z.object({
  op: z.literal("create_event"),
  title: eventFields.title,
  description: eventFields.description.default(""),
  start: eventFields.start,
  end: eventFields.end,
  allDay: eventFields.allDay.default(false),
  timezone: timezoneSchema.optional(),
  projectId: eventFields.projectId.default(null),
  taskId: eventFields.taskId.default(null),
  location: eventFields.location.default(""),
}).strict();

const batchUpdateEventOp = z.object({
  op: z.literal("update_event"),
  id: z.string().min(1),
  expectedRevision: z.number().int().positive().optional(),
  title: eventFields.title.optional(),
  description: eventFields.description.optional(),
  start: eventFields.start.optional(),
  end: eventFields.end.optional(),
  allDay: eventFields.allDay.optional(),
  timezone: eventFields.timezone.optional(),
  projectId: eventFields.projectId.optional(),
  taskId: eventFields.taskId.optional(),
  location: eventFields.location.optional(),
}).strict();

const batchDeleteEventOp = z.object({
  op: z.literal("delete_event"),
  id: z.string().min(1),
  preview: deletionPreviewSchema.optional(),
}).strict();

const batchScheduleTaskOp = z.object({
  op: z.literal("schedule_task"),
  taskId: z.string().min(1),
  start: z.string().min(1).max(100),
  end: z.string().min(1).max(100).optional(),
  durationMinutes: z.number().int().min(15).max(720).default(60),
  allDay: z.boolean().default(false),
  timezone: timezoneSchema.optional(),
  title: eventFields.title.optional(),
  description: eventFields.description.optional(),
  location: eventFields.location.optional(),
}).strict();

export const batchOperationSchema = z.discriminatedUnion("op", [
  batchCreateProjectOp,
  batchUpdateProjectOp,
  batchArchiveProjectOp,
  batchDeleteProjectOp,
  batchCreateTaskOp,
  batchUpdateTaskOp,
  batchCompleteTaskOp,
  batchMoveTaskOp,
  batchDeleteTaskOp,
  batchCreateEventOp,
  batchUpdateEventOp,
  batchDeleteEventOp,
  batchScheduleTaskOp,
]);

export type BatchOperation = z.infer<typeof batchOperationSchema>;

export const batchApplySchema = z.object({
  operations: z.array(batchOperationSchema).min(1, "Provide at least one operation.").max(50, "A batch may contain at most 50 operations."),
  mutationId: mutationIdSchema.optional(),
}).strict();

export type BatchStepResult = {
  index: number;
  op: BatchOperation["op"];
  entityType: "project" | "task" | "event";
  entityId: string;
  record?: unknown;
  deletedCount?: number;
};

export type BatchApplyResult = {
  operationId: string;
  appliedCount: number;
  results: BatchStepResult[];
};

const snapshotKey = (s: Snapshot) => `${s.entityType}:${s.record.id}`;

export function batchApply(db: AppDatabase, ownerId: string, input: unknown): BatchApplyResult {
  const parsed = batchApplySchema.parse(input);
  const mutationId = parsed.mutationId ?? crypto.randomUUID();
  const hash = requestHash("batch-apply", null, parsed.operations);

  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as BatchApplyResult;

    const operationId = crypto.randomUUID();
    const defaultTimezone = getPreferences(tx, ownerId).timezone;
    const createdKeys = new Set<string>();
    const beforeMap = new Map<string, Snapshot>();
    const afterMap = new Map<string, Snapshot>();

    const trackCreated = (snap: Snapshot) => {
      const key = snapshotKey(snap);
      createdKeys.add(key);
      afterMap.set(key, snap);
    };
    const trackChanged = (beforeSnap: Snapshot, afterSnap: Snapshot) => {
      const key = snapshotKey(beforeSnap);
      if (!createdKeys.has(key) && !beforeMap.has(key)) {
        beforeMap.set(key, beforeSnap);
      }
      afterMap.set(key, afterSnap);
    };

    const results: BatchStepResult[] = [];

    for (let index = 0; index < parsed.operations.length; index++) {
      const step = parsed.operations[index]!;
      const now = new Date().toISOString();

      switch (step.op) {
        case "create_project": {
          const { op: _op, ...data } = step;
          void _op;
          const record = tx.insert(project).values({
            ...data, id: crypto.randomUUID(), ownerId, createdAt: now, updatedAt: now,
          }).returning().get();
          trackCreated({ entityType: "project", record });
          results.push({ index, op: step.op, entityType: "project", entityId: record.id, record });
          break;
        }
        case "update_project": {
          const { op: _op, id, expectedRevision, completionPreview, completeUnfinishedTasks, ...data } = step;
          void _op;
          const before = getProject(tx, ownerId, id);
          if (expectedRevision !== undefined && before.revision !== expectedRevision) {
            throw new AppError(409, `Project ${id} changed. Reload and try again.`);
          }
          if (data.status === "Done" && before.status !== "Done") {
            const previewToUse = completionPreview ?? (completeUnfinishedTasks ? previewProjectCompletion(tx, ownerId, id) : undefined);
            const children = completeProjectChildrenInTx(tx, ownerId, id, previewToUse);
            for (let i = 0; i < children.beforeState.length; i++) {
              trackChanged(children.beforeState[i]!, children.afterState[i]!);
            }
          }
          const record = tx.update(project).set({
            ...data, revision: before.revision + 1, updatedAt: now,
          }).where(and(eq(project.id, id), eq(project.ownerId, ownerId))).returning().get()!;
          trackChanged({ entityType: "project", record: before }, { entityType: "project", record });
          results.push({ index, op: step.op, entityType: "project", entityId: id, record });
          break;
        }
        case "archive_project": {
          const before = getProject(tx, ownerId, step.id);
          if (step.expectedRevision !== undefined && before.revision !== step.expectedRevision) {
            throw new AppError(409, `Project ${step.id} changed. Reload and try again.`);
          }
          const record = tx.update(project).set({
            archivedAt: step.archived ? now : null,
            revision: before.revision + 1,
            updatedAt: now,
          }).where(and(eq(project.id, step.id), eq(project.ownerId, ownerId))).returning().get()!;
          trackChanged({ entityType: "project", record: before }, { entityType: "project", record });
          results.push({ index, op: step.op, entityType: "project", entityId: step.id, record });
          break;
        }
        case "delete_project": {
          const preview = step.preview ?? previewDeletion(tx, ownerId, "project", step.id);
          if (preview.entityType !== "project" || preview.id !== step.id) {
            throw new AppError(400, "Deletion preview does not match this project.");
          }
          const { beforeState, afterState } = applyDeletionInTx(tx, ownerId, preview, operationId, now);
          for (let i = 0; i < beforeState.length; i++) {
            trackChanged(beforeState[i]!, afterState[i]!);
          }
          results.push({ index, op: step.op, entityType: "project", entityId: step.id, deletedCount: preview.records.length });
          break;
        }
        case "create_task": {
          const { op: _op, ...data } = step;
          void _op;
          validateTaskDeadline(data);
          if (data.projectId) getProject(tx, ownerId, data.projectId);
          const record = tx.insert(task).values({
            ...data,
            dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
            id: crypto.randomUUID(),
            ownerId,
            completedAt: data.status === "Done" ? now : null,
            createdAt: now,
            updatedAt: now,
          }).returning().get();
          trackCreated({ entityType: "task", record });
          results.push({ index, op: step.op, entityType: "task", entityId: record.id, record });
          break;
        }
        case "update_task":
        case "complete_task":
        case "move_task": {
          const id = step.id;
          const expectedRevision = step.expectedRevision;
          const before = getTask(tx, ownerId, id);
          if (expectedRevision !== undefined && before.revision !== expectedRevision) {
            throw new AppError(409, `Task ${id} changed. Reload and try again.`);
          }
          let patch: Partial<typeof task.$inferInsert>;
          if (step.op === "complete_task") {
            patch = { status: step.completed ? "Done" : "To do" };
          } else if (step.op === "move_task") {
            patch = {
              ...(step.projectId !== undefined ? { projectId: step.projectId } : {}),
              ...(step.status !== undefined ? { status: step.status } : {}),
              ...(step.position !== undefined ? { position: step.position } : {}),
            };
          } else {
            const { op: _op, id: _id, expectedRevision: _rev, ...rest } = step;
            void _op; void _id; void _rev;
            patch = rest;
          }
          const merged = { ...before, ...patch };
          validateTaskDeadline(merged);
          if (merged.projectId) getProject(tx, ownerId, merged.projectId);
          const record = tx.update(task).set({
            ...patch,
            dueAt: merged.dueAt ? new Date(merged.dueAt).toISOString() : null,
            completedAt: merged.status === "Done" ? before.completedAt ?? now : null,
            revision: before.revision + 1,
            updatedAt: now,
          }).where(and(eq(task.id, id), eq(task.ownerId, ownerId))).returning().get()!;
          trackChanged({ entityType: "task", record: before }, { entityType: "task", record });
          results.push({ index, op: step.op, entityType: "task", entityId: id, record });
          break;
        }
        case "delete_task": {
          const preview = step.preview ?? previewDeletion(tx, ownerId, "task", step.id);
          if (preview.entityType !== "task" || preview.id !== step.id) {
            throw new AppError(400, "Deletion preview does not match this task.");
          }
          const { beforeState, afterState } = applyDeletionInTx(tx, ownerId, preview, operationId, now);
          for (let i = 0; i < beforeState.length; i++) {
            trackChanged(beforeState[i]!, afterState[i]!);
          }
          results.push({ index, op: step.op, entityType: "task", entityId: step.id, deletedCount: preview.records.length });
          break;
        }
        case "create_event": {
          const { op: _op, ...rest } = step;
          void _op;
          const data = { ...rest, timezone: rest.timezone ?? defaultTimezone };
          eventDatesSchema.parse(data);
          const projectId = validateEventLinks(tx, ownerId, data);
          const record = tx.insert(event).values({
            ...data,
            projectId,
            start: !data.start ? "" : data.allDay ? data.start : new Date(data.start).toISOString(),
            end: !data.end ? "" : data.allDay ? data.end : new Date(data.end).toISOString(),
            id: crypto.randomUUID(),
            ownerId,
            createdAt: now,
            updatedAt: now,
          }).returning().get();
          trackCreated({ entityType: "event", record });
          results.push({ index, op: step.op, entityType: "event", entityId: record.id, record });
          break;
        }
        case "update_event": {
          const { op: _op, id, expectedRevision, ...patch } = step;
          void _op;
          const before = getEvent(tx, ownerId, id);
          if (expectedRevision !== undefined && before.revision !== expectedRevision) {
            throw new AppError(409, `Event ${id} changed. Reload and try again.`);
          }
          const merged = { ...before, ...patch };
          eventDatesSchema.parse(merged);
          const projectId = validateEventLinks(tx, ownerId, merged);
          const record = tx.update(event).set({
            ...merged,
            projectId,
            start: !merged.start ? "" : merged.allDay ? merged.start : new Date(merged.start).toISOString(),
            end: !merged.end ? "" : merged.allDay ? merged.end : new Date(merged.end).toISOString(),
            revision: before.revision + 1,
            updatedAt: now,
          }).where(and(eq(event.id, id), eq(event.ownerId, ownerId))).returning().get()!;
          trackChanged({ entityType: "event", record: before }, { entityType: "event", record });
          results.push({ index, op: step.op, entityType: "event", entityId: id, record });
          break;
        }
        case "delete_event": {
          const preview = step.preview ?? previewDeletion(tx, ownerId, "event", step.id);
          if (preview.entityType !== "event" || preview.id !== step.id) {
            throw new AppError(400, "Deletion preview does not match this event.");
          }
          const { beforeState, afterState } = applyDeletionInTx(tx, ownerId, preview, operationId, now);
          for (let i = 0; i < beforeState.length; i++) {
            trackChanged(beforeState[i]!, afterState[i]!);
          }
          results.push({ index, op: step.op, entityType: "event", entityId: step.id, deletedCount: preview.records.length });
          break;
        }
        case "schedule_task": {
          const linkedTask = getTask(tx, ownerId, step.taskId);
          const timezone = step.timezone ?? defaultTimezone;
          let end = step.end;
          if (!end) {
            if (step.allDay) {
              dateOnlySchema.parse(step.start);
              end = Temporal.PlainDate.from(step.start).add({ days: 1 }).toString();
            } else {
              z.iso.datetime({ offset: true }).parse(step.start);
              end = Temporal.Instant.from(new Date(step.start).toISOString()).add({ minutes: step.durationMinutes }).toString();
            }
          }
          const data = {
            title: step.title ?? linkedTask.title,
            description: step.description ?? "",
            start: step.start,
            end,
            allDay: step.allDay,
            timezone,
            projectId: null as string | null,
            taskId: linkedTask.id,
            location: step.location ?? "",
          };
          eventDatesSchema.parse(data);
          const projectId = validateEventLinks(tx, ownerId, data);
          const record = tx.insert(event).values({
            ...data,
            projectId,
            start: data.allDay ? data.start : new Date(data.start).toISOString(),
            end: data.allDay ? data.end : new Date(data.end).toISOString(),
            id: crypto.randomUUID(),
            ownerId,
            createdAt: now,
            updatedAt: now,
          }).returning().get();
          trackCreated({ entityType: "event", record });
          results.push({ index, op: step.op, entityType: "event", entityId: record.id, record });
          break;
        }
      }
    }

    const batchResult: BatchApplyResult = {
      operationId,
      appliedCount: results.length,
      results,
    };

    recordOperation(tx, {
      id: operationId,
      ownerId,
      mutationId,
      requestHash: hash,
      action: "batch",
      entityType: "batch",
      entityId: operationId,
      beforeState: [...beforeMap.values()],
      afterState: [...afterMap.values()],
      result: batchResult,
    });

    return batchResult;
  }, { behavior: "immediate" });
}
