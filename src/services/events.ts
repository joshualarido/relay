import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { Temporal } from "temporal-polyfill";
import type { AppDatabase } from "../lib/db";
import { event, type Event } from "../lib/db/schema";
import { dateInTimezone, dateOnlySchema } from "../lib/dates";
import { getPreferences, timezoneSchema } from "../lib/preferences";
import {
  eventAnchorDate,
  occurrenceRangeForDate,
  recurrenceRuleSchema,
  shiftEventSeriesRange,
} from "../lib/recurrence";
import { getProject, listProjects } from "./projects";
import { getTask, listTasks, taskTypeDurationMinutes } from "./tasks";
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
  recurrenceRule: recurrenceRuleSchema.nullable(),
  recurrenceSeriesId: z.string().min(1).nullable(),
  recurrenceExceptions: z.array(dateOnlySchema).max(1000).nullable(),
  recurrenceOccurrenceDate: dateOnlySchema.nullable(),
};

export const createEventSchema = z.object({
  ...eventFields,
  description: eventFields.description.default(""),
  allDay: eventFields.allDay.default(false),
  projectId: eventFields.projectId.default(null),
  taskId: eventFields.taskId.default(null),
  location: eventFields.location.default(""),
  recurrenceRule: eventFields.recurrenceRule.default(null),
  recurrenceSeriesId: eventFields.recurrenceSeriesId.default(null),
  recurrenceExceptions: eventFields.recurrenceExceptions.default(null),
  recurrenceOccurrenceDate: eventFields.recurrenceOccurrenceDate.default(null),
  mutationId: mutationIdSchema,
}).strict();

export const updateEventSchema = z.object(eventFields)
  .partial()
  .extend({ occurrenceDate: dateOnlySchema.optional(), mutationId: mutationIdSchema })
  .strict();

export const archiveEventSchema = z.object({
  archived: z.boolean(),
  mutationId: mutationIdSchema,
}).strict();

export const moveEventSchema = z.object({
  start: eventFields.start,
  occurrenceDate: dateOnlySchema.optional(),
  mutationId: mutationIdSchema,
}).strict();

export const editEventOccurrenceSchema = z.object({
  title: eventFields.title,
  description: eventFields.description,
  start: eventFields.start,
  end: eventFields.end,
  allDay: eventFields.allDay,
  timezone: eventFields.timezone,
  projectId: eventFields.projectId,
  taskId: eventFields.taskId,
  location: eventFields.location,
})
  .partial()
  .extend({
    occurrenceDate: dateOnlySchema,
    reschedule: z.boolean().optional(),
    mutationId: mutationIdSchema,
  })
  .strict();

export const deleteEventOccurrenceSchema = z.object({
  occurrenceDate: dateOnlySchema,
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
  durationMinutes: z.number().int().min(15).max(720).optional(),
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
  const rows = db.select().from(event).where(and(eq(event.ownerId, ownerId), isNull(event.deletedAt))).orderBy(asc(event.start)).all();
  if (includeArchived) return rows;
  const projects = new Set(listProjects(db, ownerId).map((p) => p.id));
  const tasks = new Set(listTasks(db, ownerId).map((t) => t.id));
  return rows.filter((e) => !e.archivedAt && (e.taskId ? tasks.has(e.taskId) : !e.projectId || projects.has(e.projectId)));
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
    const recurrenceSeriesId = data.recurrenceRule
      ? (data.recurrenceSeriesId ?? crypto.randomUUID())
      : data.recurrenceSeriesId;
    const result = tx.insert(event).values({
      ...data, projectId, recurrenceSeriesId,
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

function addExceptionDate(existing: string[] | null | undefined, date: string): string[] {
  return [...new Set([...(existing ?? []), date])].sort();
}

function saveEvent(db: AppDatabase, ownerId: string, id: string, expectedRevision: number, input: unknown, reschedule: boolean): Event {
  const { mutationId, occurrenceDate, ...data } = (reschedule ? moveEventSchema : updateEventSchema).parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash(reschedule ? "event-reschedule" : "event-edit", id, { expectedRevision, occurrenceDate, ...data });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Event;
    const before = getEvent(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Event changed. Reload and try again.");
    const merged = { ...before, ...data };
    if (reschedule) {
      if (occurrenceDate && before.recurrenceRule) {
        const tz = before.timezone || "UTC";
        const anchor = eventAnchorDate(before, tz);
        if (before.allDay) {
          dateOnlySchema.parse(merged.start);
          const shiftDays = Temporal.PlainDate.from(occurrenceDate).until(Temporal.PlainDate.from(merged.start)).days;
          const spanDays = Temporal.PlainDate.from(before.start).until(Temporal.PlainDate.from(before.end)).days;
          merged.start = Temporal.PlainDate.from(before.start).add({ days: shiftDays }).toString();
          merged.end = Temporal.PlainDate.from(merged.start).add({ days: spanDays }).toString();
        } else {
          z.iso.datetime({ offset: true }).parse(merged.start);
          const targetDate = dateInTimezone(merged.start, tz);
          const shiftDays = Temporal.PlainDate.from(occurrenceDate).until(Temporal.PlainDate.from(targetDate)).days;
          const nextZdt = Temporal.Instant.from(new Date(merged.start).toISOString()).toZonedDateTimeISO(tz);
          merged.start = Temporal.PlainDate.from(anchor)
            .add({ days: shiftDays })
            .toZonedDateTime({ timeZone: tz, plainTime: nextZdt.toPlainTime() })
            .toInstant()
            .toString();
          merged.end = new Date(Date.parse(merged.start) + Date.parse(before.end) - Date.parse(before.start)).toISOString();
        }
      } else if (before.allDay) {
        dateOnlySchema.parse(merged.start);
        const days = Temporal.PlainDate.from(before.start).until(Temporal.PlainDate.from(before.end)).days;
        merged.end = Temporal.PlainDate.from(merged.start).add({ days }).toString();
      } else {
        z.iso.datetime({ offset: true }).parse(merged.start);
        merged.end = new Date(Date.parse(merged.start) + Date.parse(before.end) - Date.parse(before.start)).toISOString();
      }
    } else if (
      occurrenceDate &&
      before.recurrenceRule &&
      before.start &&
      before.end &&
      ("start" in data || "end" in data || "allDay" in data)
    ) {
      const tz = merged.timezone || before.timezone || "UTC";
      const orig = occurrenceRangeForDate(before, occurrenceDate, tz);
      const nextStart = "start" in data ? merged.start : orig.start;
      const nextEnd = "end" in data ? merged.end : orig.end;
      if (nextStart && nextEnd) {
        const shifted = shiftEventSeriesRange(before, occurrenceDate, {
          start: nextStart,
          end: nextEnd,
          allDay: merged.allDay,
          timezone: tz,
        });
        merged.start = shifted.start;
        merged.end = shifted.end;
      }
    }
    eventDatesSchema.parse(merged);
    const projectId = validateEventLinks(tx, ownerId, merged);
    const recurrenceSeriesId = merged.recurrenceRule
      ? (merged.recurrenceSeriesId ?? before.id)
      : merged.recurrenceSeriesId;
    const recurrenceExceptions =
      "recurrenceRule" in data && !data.recurrenceRule && !("recurrenceExceptions" in data)
        ? null
        : merged.recurrenceExceptions;
    const result = tx.update(event).set({
      ...merged, projectId, recurrenceSeriesId, recurrenceExceptions,
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

export function editEventOccurrence(
  db: AppDatabase,
  ownerId: string,
  id: string,
  expectedRevision: number,
  input: unknown,
): { event: Event; series: Event } {
  const { mutationId, occurrenceDate, reschedule, ...data } = editEventOccurrenceSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash("event-edit-occurrence", id, { expectedRevision, occurrenceDate, reschedule, ...data });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as { event: Event; series: Event };
    const before = getEvent(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Event changed. Reload and try again.");
    if (!before.recurrenceRule || !before.start || !before.end) {
      throw new AppError(400, "This event does not have a recurrence series.");
    }
    const tz = data.timezone ?? before.timezone;
    const orig = occurrenceRangeForDate(before, occurrenceDate, tz);
    const merged = {
      title: data.title ?? before.title,
      description: data.description ?? before.description,
      allDay: data.allDay ?? before.allDay,
      timezone: tz,
      projectId: data.projectId !== undefined ? data.projectId : before.projectId,
      taskId: data.taskId !== undefined ? data.taskId : before.taskId,
      location: data.location ?? before.location,
      start: data.start !== undefined ? data.start : orig.start,
      end: data.end !== undefined ? data.end : orig.end,
    };
    if (reschedule && data.start !== undefined && data.end === undefined) {
      if (merged.allDay) {
        dateOnlySchema.parse(merged.start);
        const days = Temporal.PlainDate.from(orig.start).until(Temporal.PlainDate.from(orig.end)).days;
        merged.end = Temporal.PlainDate.from(merged.start).add({ days }).toString();
      } else {
        z.iso.datetime({ offset: true }).parse(merged.start);
        merged.end = new Date(Date.parse(merged.start) + Date.parse(orig.end) - Date.parse(orig.start)).toISOString();
      }
    }
    eventDatesSchema.parse(merged);
    const projectId = validateEventLinks(tx, ownerId, merged);
    const now = new Date().toISOString();
    const seriesId = before.recurrenceSeriesId ?? before.id;
    const updatedSeries = tx.update(event).set({
      recurrenceSeriesId: seriesId,
      recurrenceExceptions: addExceptionDate(before.recurrenceExceptions, occurrenceDate),
      revision: before.revision + 1,
      updatedAt: now,
    }).where(and(eq(event.id, id), eq(event.ownerId, ownerId))).returning().get()!;
    const createdOverride = tx.insert(event).values({
      ...merged,
      projectId,
      start: !merged.start ? "" : merged.allDay ? merged.start : new Date(merged.start).toISOString(),
      end: !merged.end ? "" : merged.allDay ? merged.end : new Date(merged.end).toISOString(),
      recurrenceRule: null,
      recurrenceSeriesId: seriesId,
      recurrenceExceptions: null,
      recurrenceOccurrenceDate: occurrenceDate,
      id: crypto.randomUUID(),
      ownerId,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
    const result = { event: createdOverride, series: updatedSeries };
    recordOperation(tx, {
      ownerId,
      mutationId,
      requestHash: hash,
      action: "edit-occurrence",
      entityType: "event",
      entityId: id,
      beforeState: [{ entityType: "event", record: before }],
      afterState: [
        { entityType: "event", record: updatedSeries },
        { entityType: "event", record: createdOverride },
      ],
      result,
    });
    return result;
  }, { behavior: "immediate" });
}

export function deleteEventOccurrence(
  db: AppDatabase,
  ownerId: string,
  id: string,
  expectedRevision: number,
  input: unknown,
): Event {
  const { mutationId, occurrenceDate } = deleteEventOccurrenceSchema.parse(input);
  z.number().int().positive().parse(expectedRevision);
  const hash = requestHash("event-delete-occurrence", id, { expectedRevision, occurrenceDate });
  return db.transaction((tx) => {
    const previous = replayMutation(tx, ownerId, mutationId, hash);
    if (previous) return previous.result as Event;
    const before = getEvent(tx, ownerId, id);
    if (before.revision !== expectedRevision) throw new AppError(409, "Event changed. Reload and try again.");
    if (!before.recurrenceRule) {
      throw new AppError(400, "This event does not have a recurrence series.");
    }
    const now = new Date().toISOString();
    const result = tx.update(event).set({
      recurrenceSeriesId: before.recurrenceSeriesId ?? before.id,
      recurrenceExceptions: addExceptionDate(before.recurrenceExceptions, occurrenceDate),
      revision: before.revision + 1,
      updatedAt: now,
    }).where(and(eq(event.id, id), eq(event.ownerId, ownerId))).returning().get()!;
    recordOperation(tx, {
      ownerId,
      mutationId,
      requestHash: hash,
      action: "delete-occurrence",
      entityType: "event",
      entityId: id,
      beforeState: [{ entityType: "event", record: before }],
      afterState: [{ entityType: "event", record: result }],
      result,
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
      const minutes = data.durationMinutes ?? linkedTask.durationMinutes ?? taskTypeDurationMinutes(linkedTask.taskType);
      end = Temporal.Instant.from(new Date(data.start).toISOString()).add({ minutes }).toString();
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
