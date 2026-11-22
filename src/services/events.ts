import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { Temporal } from "temporal-polyfill";
import type { AppDatabase } from "../lib/db";
import { event, type Event } from "../lib/db/schema";
import { dateOnlySchema } from "../lib/dates";
import { getPreferences, timezoneSchema } from "../lib/preferences";
import { getProject, listProjects } from "./projects";
import { getTask, listTasks } from "./tasks";
import { mutationIdSchema, recordOperation, replayMutation, requestHash } from "../lib/activity";
import { AppError } from "../lib/errors";

export const eventFields = {
  title: z.string().max(500).refine((v) => v.trim().length > 0, "Enter an event title."),
  description: z.string().max(20_000),
  start: z.string().max(100),
  end: z.string().max(100),
  allDay: z.boolean(),
  timezone: timezoneSchema,
  projectId: z.string().min(1).nullable(),
  taskId: z.string().min(1).nullable(),
  location: z.string().max(2000).refine(
    (v) => !/^[a-z][a-z\d+.-]*:/i.test(v) || /^https?:\/\//i.test(v),
    "Use a location or an HTTP(S) meeting URL.",
  ),
};

export const createEventSchema = z.object({
  ...eventFields,
  description: eventFields.description.default(""),
  allDay: eventFields.allDay.default(false),
  projectId: eventFields.projectId.default(null),
  taskId: eventFields.taskId.default(null),
  location: eventFields.location.default(""),
  mutationId: mutationIdSchema,
}).strict();

export const updateEventSchema = z.object(eventFields)
  .partial()
  .extend({ mutationId: mutationIdSchema })
  .strict();

export const archiveEventSchema = z.object({
  archived: z.boolean(),
  mutationId: mutationIdSchema,
}).strict();

export const moveEventSchema = z.object({
  start: eventFields.start,
  mutationId: mutationIdSchema,
}).strict();

export const eventDatesSchema = z.object({
  start: eventFields.start,
  end: eventFields.end,
  allDay: eventFields.allDay,
}).superRefine((data, ctx) => {
  // Unscheduled event: both start and end are empty strings.
  if (!data.start && !data.end) return;
  const format = data.allDay ? dateOnlySchema : z.iso.datetime({ offset: true });
  for (const key of ["start", "end"] as const) {
    if (!format.safeParse(data[key]).success) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: data.allDay ? "Choose a valid date (YYYY-MM-DD)." : "Include a valid time and UTC offset.",
      });
    }
  }
  if (format.safeParse(data.start).success && format.safeParse(data.end).success &&
    (data.allDay ? data.end <= data.start : Date.parse(data.end) <= Date.parse(data.start))) {
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: data.allDay ? "All-day end is exclusive and must follow the start date." : "End must be after start.",
    });
  }
});

export const listEventsOptionsSchema = z.object({
  from: z.union([dateOnlySchema, z.iso.datetime({ offset: true })]).optional(),
  to: z.union([dateOnlySchema, z.iso.datetime({ offset: true })]).optional(),
  projectId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  includeArchived: z.boolean().default(false),
  timezone: timezoneSchema.optional(),
}).strict();

export const scheduleTaskSchema = z.object({
  taskId: z.string().min(1),
  start: z.string().min(1).max(100),
  end: z.string().min(1).max(100).optional(),
  durationMinutes: z.number().int().min(15).max(720).default(60),
  allDay: z.boolean().default(false),
  timezone: timezoneSchema.optional(),
  title: z.string().max(500).refine((v) => v.trim().length > 0, "Enter an event title.").optional(),
  description: z.string().max(20_000).optional(),
  location: eventFields.location.optional(),
  mutationId: mutationIdSchema,
}).strict();

export function validateEventLinks(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  data: { projectId: string | null; taskId: string | null },
) {
  if (data.projectId) getProject(db, ownerId, data.projectId);
  if (data.taskId) {
    const linkedTask = getTask(db, ownerId, data.taskId);
    if (data.projectId && data.projectId !== linkedTask.projectId) {
      throw new AppError(400, "The event's project and task do not match.");
    }
    return null;
  }
  return data.projectId;
}

export function listEvents(db: Pick<AppDatabase, "select">, ownerId: string, includeArchived = false) {
  const projects = new Set(listProjects(db, ownerId).map((p) => p.id));
  const tasks = new Set(listTasks(db, ownerId).map((t) => t.id));
  return db.select().from(event).where(and(eq(event.ownerId, ownerId), isNull(event.deletedAt))).orderBy(asc(event.start)).all()
    .filter((e) => includeArchived || (!e.archivedAt && (e.taskId ? tasks.has(e.taskId) : !e.projectId || projects.has(e.projectId))));
}

function boundaryToMs(value: string, bound: "start" | "end", timezone: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const startOfDay = Temporal.PlainDate.from(value).toZonedDateTime({ timeZone: timezone });
    return bound === "start" ? startOfDay.epochMilliseconds : startOfDay.add({ days: 1 }).epochMilliseconds;
  }
  return Date.parse(value);
}

function boundaryToDate(value: string, timezone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return Temporal.Instant.from(new Date(value).toISOString()).toZonedDateTimeISO(timezone).toPlainDate().toString();
}

export function listEventsWithOptions(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  input: unknown = {},
): Event[] {
  const options = listEventsOptionsSchema.parse(input);
  const timezone = options.timezone ?? getPreferences(db, ownerId).timezone;
  const rows = listEvents(db, ownerId, options.includeArchived);
  const taskProjectMap = options.projectId
    ? new Map(listTasks(db, ownerId, options.includeArchived).map((t) => [t.id, t.projectId]))
    : null;
  const fromMs = options.from ? boundaryToMs(options.from, "start", timezone) : null;
  const toMs = options.to ? boundaryToMs(options.to, "end", timezone) : null;
  const fromDate = options.from ? boundaryToDate(options.from, timezone) : null;
  const toDate = options.to ? boundaryToDate(options.to, timezone) : null;

  return rows.filter((e) => {
    if (options.taskId && e.taskId !== options.taskId) return false;
    if (options.projectId) {
      const effectiveProjectId = e.taskId ? (taskProjectMap?.get(e.taskId) ?? null) : e.projectId;
      if (effectiveProjectId !== options.projectId) return false;
    }
    if (fromMs !== null || toMs !== null) {
      if (!e.start || !e.end) return false;
      if (e.allDay) {
        if (fromDate && e.end <= fromDate) return false;
        if (toDate && e.start > toDate) return false;
      } else {
        const startMs = Date.parse(e.start);
        const endMs = Date.parse(e.end);
        if (fromMs !== null && endMs <= fromMs) return false;
        if (toMs !== null && startMs >= toMs) return false;
      }
    }
    return true;
  });
}

export function listArchivedEvents(db: Pick<AppDatabase, "select">, ownerId: string) {
  return db.select().from(event)
    .where(and(eq(event.ownerId, ownerId), isNull(event.deletedAt), isNotNull(event.archivedAt)))
    .orderBy(desc(event.archivedAt), asc(event.createdAt)).all();
}

export function getEvent(db: Pick<AppDatabase, "select">, ownerId: string, id: string): Event {
  const result = db.select().from(event).where(and(eq(event.id, id), eq(event.ownerId, ownerId), isNull(event.deletedAt))).get();
  if (!result) throw new AppError(404, "Event not found.");
  validateEventLinks(db, ownerId, result);
  return result;
}

export function createEvent(db: AppDatabase, ownerId: string, input: unknown): Event {
  const { mutationId, ...data } = createEventSchema.parse(input);
  eventDatesSchema.parse(data);
  const hash = requestHash("event-create", null, data);
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Event;
    const projectId = validateEventLinks(tx, ownerId, data);
    const now = new Date().toISOString();
    const result = tx.insert(event).values({
      ...data, projectId,
      start: !data.start ? "" : data.allDay ? data.start : new Date(data.start).toISOString(),
      end: !data.end ? "" : data.allDay ? data.end : new Date(data.end).toISOString(),
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
  const { mutationId, ...data } = (reschedule ? moveEventSchema : updateEventSchema).parse(input);
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
    eventDatesSchema.parse(merged);
    const projectId = validateEventLinks(tx, ownerId, merged);
    const result = tx.update(event).set({
      ...merged, projectId,
      start: !merged.start ? "" : merged.allDay ? merged.start : new Date(merged.start).toISOString(),
      end: !merged.end ? "" : merged.allDay ? merged.end : new Date(merged.end).toISOString(),
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

export function archiveEvent(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown): Event {
  const data = archiveEventSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const action = data.archived ? "archive" : "unarchive";
  const hash = requestHash(`event-${action}`, id, { expectedRevision, archived: data.archived });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, data.mutationId, hash);
    if (previous) return previous.result as Event;
    const before = getEvent(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Event changed. Reload and try again.");
    const now = new Date().toISOString();
    const result = tx.update(event).set({
      archivedAt: data.archived ? now : null,
      revision: before.revision + 1,
      updatedAt: now,
    }).where(and(eq(event.id, id), eq(event.ownerId, ownerId))).returning().get()!;
    recordOperation(tx, {
      ownerId, mutationId: data.mutationId, requestHash: hash, action, entityType: "event", entityId: id,
      beforeState: [{ entityType: "event", record: before }], afterState: [{ entityType: "event", record: result }], result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function resolveScheduleTaskEventPayload(
  db: Pick<AppDatabase, "select">,
  ownerId: string,
  input: unknown,
) {
  const data = scheduleTaskSchema.parse(input);
  const linkedTask = getTask(db, ownerId, data.taskId);
  const timezone = data.timezone ?? getPreferences(db, ownerId).timezone;
  let end = data.end;
  if (!end) {
    if (data.allDay) {
      dateOnlySchema.parse(data.start);
      end = Temporal.PlainDate.from(data.start).add({ days: 1 }).toString();
    } else {
      z.iso.datetime({ offset: true }).parse(data.start);
      end = Temporal.Instant.from(new Date(data.start).toISOString()).add({ minutes: data.durationMinutes }).toString();
    }
  }
  return {
    title: data.title ?? linkedTask.title,
    description: data.description ?? "",
    start: data.start,
    end,
    allDay: data.allDay,
    timezone,
    projectId: null,
    taskId: linkedTask.id,
    location: data.location ?? "",
    mutationId: data.mutationId,
  };
}

export function scheduleTask(db: AppDatabase, ownerId: string, input: unknown): Event {
  const payload = resolveScheduleTaskEventPayload(db, ownerId, input);
  return createEvent(db, ownerId, payload);
}
