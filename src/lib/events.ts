import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { Temporal } from "temporal-polyfill";
import type { AppDatabase } from "./db";
import { event, type Event } from "./db/schema";
import { dateOnlySchema } from "./dates";
import { timezoneSchema } from "./preferences";
import { getProject, listProjects } from "./projects";
import { getTask, listTasks } from "./tasks";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "./activity";
import { AppError } from "./errors";

const fields = {
  title: z.string().max(500).refine((v) => v.trim().length > 0, "Enter an event title."),
  description: z.string().max(20_000),
  start: z.string().max(100), end: z.string().max(100),
  allDay: z.boolean(), timezone: timezoneSchema,
  projectId: z.string().min(1).nullable(), taskId: z.string().min(1).nullable(),
  location: z.string().max(2000).refine((v) => !/^[a-z][a-z\d+.-]*:/i.test(v) || /^https?:\/\//i.test(v), "Use a location or an HTTP(S) meeting URL."),
};
const createSchema = z.object({
  ...fields, description: fields.description.default(""), allDay: fields.allDay.default(false),
  projectId: fields.projectId.default(null), taskId: fields.taskId.default(null), location: fields.location.default(""),
  mutationId: mutationIdSchema,
}).strict();
const updateSchema = z.object(fields).partial().extend({ mutationId: mutationIdSchema }).strict();
const moveSchema = z.object({ start: fields.start, mutationId: mutationIdSchema }).strict();
const datesSchema = z.object({ start: fields.start, end: fields.end, allDay: fields.allDay }).superRefine((data, ctx) => {
  const format = data.allDay ? dateOnlySchema : z.iso.datetime({ offset: true });
  for (const key of ["start", "end"] as const) {
    if (!format.safeParse(data[key]).success) ctx.addIssue({ code: "custom", path: [key], message: data.allDay ? "Choose a valid date (YYYY-MM-DD)." : "Include a valid time and UTC offset." });
  }
  if (format.safeParse(data.start).success && format.safeParse(data.end).success &&
    (data.allDay ? data.end <= data.start : Date.parse(data.end) <= Date.parse(data.start))) {
    ctx.addIssue({ code: "custom", path: ["end"], message: data.allDay ? "All-day end is exclusive and must follow the start date." : "End must be after start." });
  }
});

function validateLinks(db: Pick<AppDatabase, "select">, ownerId: string, data: { projectId: string | null; taskId: string | null }) {
  if (data.projectId) getProject(db, ownerId, data.projectId);
  if (data.taskId) {
    const task = getTask(db, ownerId, data.taskId);
    if (data.projectId && data.projectId !== task.projectId) throw new AppError(400, "The event's project and task do not match.");
    return null;
  }
  return data.projectId;
}

export function listEvents(db: Pick<AppDatabase, "select">, ownerId: string, includeArchived = false) {
  const projects = new Set(listProjects(db, ownerId).map((p) => p.id));
  const tasks = new Set(listTasks(db, ownerId).map((t) => t.id));
  return db.select().from(event).where(and(eq(event.ownerId, ownerId), isNull(event.deletedAt))).orderBy(asc(event.start)).all()
    .filter((e) => includeArchived || (e.taskId ? tasks.has(e.taskId) : !e.projectId || projects.has(e.projectId)));
}

export function getEvent(db: Pick<AppDatabase, "select">, ownerId: string, id: string): Event {
  const result = db.select().from(event).where(and(eq(event.id, id), eq(event.ownerId, ownerId), isNull(event.deletedAt))).get();
  if (!result) throw new AppError(404, "Event not found.");
  validateLinks(db, ownerId, result);
  return result;
}

export function createEvent(db: AppDatabase, ownerId: string, input: unknown): Event {
  const { mutationId, ...data } = createSchema.parse(input);
  datesSchema.parse(data);
  const hash = requestHash("event-create", null, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Event;
    const projectId = validateLinks(tx, ownerId, data);
    const now = new Date().toISOString();
    const result = tx.insert(event).values({
      ...data, projectId, start: data.allDay ? data.start : new Date(data.start).toISOString(),
      end: data.allDay ? data.end : new Date(data.end).toISOString(),
      id: crypto.randomUUID(), ownerId, createdAt: now, updatedAt: now,
    }).returning().get();
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: "create", entityType: "event", entityId: result.id,
      beforeState: [], afterState: [{ entityType: "event", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

function saveEvent(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown, reschedule: boolean): Event {
  const { mutationId, ...data } = (reschedule ? moveSchema : updateSchema).parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash(reschedule ? "event-reschedule" : "event-edit", id, { expectedRevision, ...data });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Event;
    const before = getEvent(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Event changed. Reload and try again.");
    const merged = { ...before, ...data };
    if (reschedule) {
      if (before.allDay) {
        dateOnlySchema.parse(merged.start);
        const days = Temporal.PlainDate.from(before.start).until(Temporal.PlainDate.from(before.end)).days;
        merged.end = Temporal.PlainDate.from(merged.start).add({ days }).toString();
      } else {
        z.iso.datetime({ offset: true }).parse(merged.start);
        merged.end = new Date(Date.parse(merged.start) + Date.parse(before.end) - Date.parse(before.start)).toISOString();
      }
    }
    datesSchema.parse(merged);
    const projectId = validateLinks(tx, ownerId, merged);
    const result = tx.update(event).set({
      ...merged, projectId, start: merged.allDay ? merged.start : new Date(merged.start).toISOString(),
      end: merged.allDay ? merged.end : new Date(merged.end).toISOString(),
      revision: before.revision + 1, updatedAt: new Date().toISOString(),
    }).where(and(eq(event.id, id), eq(event.ownerId, ownerId))).returning().get()!;
    recordOperation(tx, {
      ownerId, mutationId, requestHash: hash, action: reschedule ? "reschedule" : "edit", entityType: "event", entityId: id,
      beforeState: [{ entityType: "event", record: before }], afterState: [{ entityType: "event", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function updateEvent(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown) {
  return saveEvent(db, ownerId, id, expectedRevision, input, false);
}
export function rescheduleEvent(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown) {
  return saveEvent(db, ownerId, id, expectedRevision, input, true);
}
