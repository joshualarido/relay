import { z } from "zod";
import { mutationIdSchema } from "../lib/activity";
import { dateOnlySchema } from "../lib/dates";
import { AppError } from "../lib/errors";
import { getPreferences, timezoneSchema } from "../lib/preferences";
import {
  archiveProject,
  batchApply,
  batchOperationSchema,
  completeTask,
  completionPreviewSchema,
  confirmDeletion,
  createEvent,
  createProject,
  createTask,
  deletionPreviewSchema,
  eventFields,
  findFreeSlots,
  getEvent,
  getNeglectedState,
  getProject,
  getTask,
  getTodayContext,
  listEventsWithOptions,
  listProjectsWithOptions,
  listTasksWithOptions,
  moveTask,
  previewDeletion,
  previewProjectCompletion,
  projectFields,
  projectStatuses,
  scheduleTask,
  searchAll,
  taskFields,
  taskStatuses,
  taskTypes,
  undoLastAction,
  updateEvent,
  updateProject,
  updateTask,
} from "../services";
import type { McpContext } from "./context";

// --- Input Schemas (Zod v4 objects shared by MCP registration and direct handler calls) ---

export const getTodayInputSchema = z.object({
  now: z.iso.datetime({ offset: true }).optional().describe("Override current ISO timestamp with offset (defaults to now)."),
  timezone: timezoneSchema.optional().describe("Override IANA timezone (defaults to user preference)."),
}).strict();

export const listProjectsInputSchema = z.object({
  status: z.enum(projectStatuses).optional().describe("Filter by project status: Planned, Active, Paused, or Done."),
  includeArchived: z.boolean().optional().describe("Include archived projects alongside active ones."),
  archivedOnly: z.boolean().optional().describe("Return only archived projects."),
  includeProgress: z.boolean().optional().describe("Include task progress counts (done, total, percent)."),
}).strict();

export const listTasksInputSchema = z.object({
  projectId: z.string().min(1).nullable().optional().describe("Filter by projectId, or pass null / 'none' for loose tasks without a project."),
  status: z.enum(taskStatuses).optional().describe("Filter by status: 'To do' or 'Done'."),
  taskType: z.enum(taskTypes).optional().describe("Filter by task type: 'Instant' (15m), 'Medium' (30m), or 'Deep' (60m)."),
  important: z.union([z.boolean(), z.literal("unset")]).optional().describe("Filter by important flag (true, false, or 'unset')."),
  dueBefore: dateOnlySchema.optional().describe("Filter tasks due on or before YYYY-MM-DD."),
  dueAfter: dateOnlySchema.optional().describe("Filter tasks due on or after YYYY-MM-DD."),
  unscheduledOnly: z.boolean().optional().describe("Return only tasks without a linked calendar event or time block."),
  includeArchived: z.boolean().optional().describe("Include archived tasks."),
  timezone: timezoneSchema.optional().describe("Override IANA timezone for date comparisons."),
}).strict();

export const listEventsInputSchema = z.object({
  from: z.union([dateOnlySchema, z.iso.datetime({ offset: true })]).optional().describe("Start of date/time window (YYYY-MM-DD or ISO datetime with offset)."),
  to: z.union([dateOnlySchema, z.iso.datetime({ offset: true })]).optional().describe("End of date/time window (YYYY-MM-DD or ISO datetime with offset)."),
  projectId: z.string().min(1).optional().describe("Filter events linked to this project (directly or via a linked task)."),
  taskId: z.string().min(1).optional().describe("Filter events linked to this task."),
  includeArchived: z.boolean().optional().describe("Include archived events."),
  timezone: timezoneSchema.optional().describe("Override IANA timezone."),
}).strict();

export const searchInputSchema = z.object({
  query: z.string().max(500).default("").describe("Case-insensitive search text across titles, names, descriptions, and locations."),
  types: z.array(z.enum(["project", "task", "event"])).min(1).optional().describe("Restrict search to specific entity types."),
  status: z.enum([...projectStatuses, ...taskStatuses]).optional().describe("Filter by project or task status."),
  projectId: z.string().min(1).optional().describe("Filter by projectId (or 'none' for loose tasks)."),
  date: dateOnlySchema.optional().describe("Filter items matching a calendar date (YYYY-MM-DD)."),
  important: z.union([z.boolean(), z.literal("unset")]).optional().describe("Filter tasks by important flag."),
  includeArchived: z.boolean().optional().describe("Include archived items."),
  limit: z.number().int().min(1).max(200).optional().describe("Maximum results to return (default 50)."),
  timezone: timezoneSchema.optional().describe("Override IANA timezone."),
}).strict();

export const findFreeSlotsInputSchema = z.object({
  date: dateOnlySchema.optional().describe("Single date (YYYY-MM-DD) to find free slots on. Defaults to today."),
  startDate: dateOnlySchema.optional().describe("Start date (YYYY-MM-DD) for a multi-day search (max 14 days)."),
  endDate: dateOnlySchema.optional().describe("End date (YYYY-MM-DD) for a multi-day search (max 14 days)."),
  durationMinutes: z.number().int().min(15).max(720).optional().describe("Minimum slot duration in minutes (default 60)."),
  workdayStartHour: z.number().int().min(0).max(23).optional().describe("Working-day start hour in local time (0-23, default 9)."),
  workdayEndHour: z.number().int().min(1).max(24).optional().describe("Working-day end hour in local time (1-24, default 18)."),
  bufferMinutes: z.number().int().min(0).max(120).optional().describe("Buffer minutes required before/after existing events (default 0)."),
  excludePast: z.boolean().optional().describe("Clip slots earlier than `now` (default true)."),
  timezone: timezoneSchema.optional().describe("Override IANA timezone."),
  now: z.iso.datetime({ offset: true }).optional().describe("Override current ISO timestamp with offset."),
}).strict();

export const getNeglectedStateInputSchema = z.object({
  now: z.iso.datetime({ offset: true }).optional().describe("Override current ISO timestamp with offset."),
  timezone: timezoneSchema.optional().describe("Override IANA timezone."),
  dueSoonDays: z.number().int().min(1).max(30).optional().describe("Lookahead window in days for unscheduled due-soon tasks (default 3)."),
  stalledProjectDays: z.number().int().min(1).max(90).optional().describe("Idle days threshold for Active projects to be flagged stalled (default 7)."),
}).strict();

export const createProjectInputSchema = z.object({
  name: projectFields.name.describe("Project name."),
  description: projectFields.description.optional().describe("Optional project description."),
  status: projectFields.status.optional().describe("Initial status: Planned (default), Active, Paused, or Done."),
  deadline: projectFields.deadline.optional().describe("Optional date-only deadline (YYYY-MM-DD) or null."),
  position: projectFields.position.optional().describe("Optional integer sort position."),
  mutationId: mutationIdSchema.optional().describe("Optional UUID for idempotent retries."),
}).strict();

export const updateProjectInputSchema = z.object({
  id: z.string().min(1).describe("Project ID."),
  expectedRevision: z.number().int().positive().optional().describe("Optional optimistic-concurrency revision."),
  name: projectFields.name.optional(),
  description: projectFields.description.optional(),
  status: projectFields.status.optional(),
  deadline: projectFields.deadline.optional(),
  position: projectFields.position.optional(),
  completionPreview: completionPreviewSchema.optional().describe("Optional completion preview when setting status to Done."),
  completeUnfinishedTasks: z.boolean().optional().describe("When transitioning to Done without an explicit preview, complete unfinished child tasks (default true)."),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const archiveProjectInputSchema = z.object({
  id: z.string().min(1).describe("Project ID."),
  archived: z.boolean().default(true).describe("True to archive, false to unarchive."),
  expectedRevision: z.number().int().positive().optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const deleteProjectInputSchema = z.object({
  id: z.string().min(1).describe("Project ID."),
  dryRun: z.boolean().optional().describe("If true, return the deletion cascade preview without deleting."),
  preview: deletionPreviewSchema.optional().describe("Optional deletion preview returned from dryRun for strict concurrency confirmation."),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const createTaskInputSchema = z.object({
  title: taskFields.title.describe("Task title (saved literally)."),
  description: taskFields.description.optional(),
  projectId: taskFields.projectId.optional().describe("Optional owning project ID, or null for loose task."),
  status: taskFields.status.optional().describe("'To do' (default) or 'Done'."),
  taskType: taskFields.taskType.optional().describe("Task type: 'Instant' (15m default), 'Medium' (30m default), or 'Deep' (60m default)."),
  important: taskFields.important.optional().describe("Whether task is marked important (true, false, or null)."),
  dueDate: taskFields.dueDate.optional().describe("Date-only due date (YYYY-MM-DD) or null."),
  dueAt: taskFields.dueAt.optional().describe("Timed deadline ISO datetime with offset (requires timezone)."),
  startAt: taskFields.startAt.optional(),
  endAt: taskFields.endAt.optional(),
  allDay: taskFields.allDay.optional(),
  timezone: taskFields.timezone.optional(),
  position: taskFields.position.optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const updateTaskInputSchema = z.object({
  id: z.string().min(1).describe("Task ID."),
  expectedRevision: z.number().int().positive().optional(),
  title: taskFields.title.optional(),
  description: taskFields.description.optional(),
  projectId: taskFields.projectId.optional(),
  status: taskFields.status.optional(),
  taskType: taskFields.taskType.optional(),
  important: taskFields.important.optional(),
  dueDate: taskFields.dueDate.optional(),
  dueAt: taskFields.dueAt.optional(),
  startAt: taskFields.startAt.optional(),
  endAt: taskFields.endAt.optional(),
  allDay: taskFields.allDay.optional(),
  timezone: taskFields.timezone.optional(),
  position: taskFields.position.optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const completeTaskInputSchema = z.object({
  id: z.string().min(1).describe("Task ID."),
  completed: z.boolean().default(true).describe("True to mark Done, false to reopen as To do."),
  expectedRevision: z.number().int().positive().optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const moveTaskInputSchema = z.object({
  id: z.string().min(1).describe("Task ID."),
  projectId: z.string().min(1).nullable().optional().describe("Target project ID, or null to move to No project."),
  status: z.enum(taskStatuses).optional().describe("Optional new status ('To do' or 'Done')."),
  position: z.number().int().min(0).max(1_000_000).optional().describe("Optional new position."),
  expectedRevision: z.number().int().positive().optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const deleteTaskInputSchema = z.object({
  id: z.string().min(1).describe("Task ID."),
  dryRun: z.boolean().optional().describe("If true, return the deletion cascade preview without deleting."),
  preview: deletionPreviewSchema.optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const createEventInputSchema = z.object({
  title: eventFields.title.describe("Event title."),
  description: eventFields.description.optional(),
  start: eventFields.start.describe("ISO datetime with offset (timed) or YYYY-MM-DD (allDay). Empty string with empty end creates an unscheduled event."),
  end: eventFields.end.describe("ISO datetime with offset (timed) or exclusive YYYY-MM-DD (allDay)."),
  allDay: eventFields.allDay.optional().describe("True for all-day event (default false)."),
  timezone: timezoneSchema.optional().describe("IANA timezone (defaults to user preference)."),
  projectId: eventFields.projectId.optional().describe("Optional linked project ID (omit or null if taskId is set)."),
  taskId: eventFields.taskId.optional().describe("Optional linked task ID."),
  location: eventFields.location.optional().describe("Optional location or HTTP(S) meeting URL."),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const updateEventInputSchema = z.object({
  id: z.string().min(1).describe("Event ID."),
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
  mutationId: mutationIdSchema.optional(),
}).strict();

export const deleteEventInputSchema = z.object({
  id: z.string().min(1).describe("Event ID."),
  dryRun: z.boolean().optional().describe("If true, return the deletion preview without deleting."),
  preview: deletionPreviewSchema.optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const scheduleTaskInputSchema = z.object({
  taskId: z.string().min(1).describe("Task ID to schedule on the calendar."),
  start: z.string().min(1).max(100).describe("Start ISO datetime with offset (timed) or YYYY-MM-DD (if allDay=true)."),
  end: z.string().min(1).max(100).optional().describe("Optional end time; defaults to start + durationMinutes (or next day if allDay)."),
  durationMinutes: z.number().int().min(15).max(720).optional().describe("Duration in minutes when `end` is omitted (defaults to task type: Instant=15, Medium=30, Deep=60)."),
  allDay: z.boolean().optional().describe("Create an all-day linked event (default false)."),
  timezone: timezoneSchema.optional().describe("IANA timezone (defaults to user preference)."),
  title: eventFields.title.optional().describe("Optional custom event title (defaults to task title)."),
  description: eventFields.description.optional(),
  location: eventFields.location.optional(),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const batchApplyInputSchema = z.object({
  operations: z.array(batchOperationSchema).min(1).max(50).describe("Ordered list of mutations to apply atomically in one transaction and one undoable activity entry."),
  mutationId: mutationIdSchema.optional(),
}).strict();

export const undoLastActionInputSchema = z.object({
  operationId: z.string().min(1).optional().describe("Optional specific activity operation ID to undo (defaults to the most recent undoable action)."),
  mutationId: mutationIdSchema.optional(),
}).strict();

// --- Handlers ---

function currentNow(ctx: McpContext, override?: string) {
  return override ?? ctx.now?.();
}

export function createMcpHandlers(ctx: McpContext) {
  const ownerId = () => ctx.resolveOwnerId();

  return {
    // Read / Context
    get_today(rawInput: unknown = {}) {
      const input = getTodayInputSchema.parse(rawInput);
      const now = currentNow(ctx, input.now);
      return getTodayContext(ctx.db, ownerId(), {
        ...(now ? { now } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      });
    },

    list_projects(rawInput: unknown = {}) {
      const input = listProjectsInputSchema.parse(rawInput);
      return listProjectsWithOptions(ctx.db, ownerId(), input);
    },

    list_tasks(rawInput: unknown = {}) {
      const input = listTasksInputSchema.parse(rawInput);
      return listTasksWithOptions(ctx.db, ownerId(), input);
    },

    list_events(rawInput: unknown = {}) {
      const input = listEventsInputSchema.parse(rawInput);
      return listEventsWithOptions(ctx.db, ownerId(), input);
    },

    search(rawInput: unknown = {}) {
      const input = searchInputSchema.parse(rawInput);
      return searchAll(ctx.db, ownerId(), input);
    },

    find_free_slots(rawInput: unknown = {}) {
      const input = findFreeSlotsInputSchema.parse(rawInput);
      const now = currentNow(ctx, input.now);
      return findFreeSlots(ctx.db, ownerId(), {
        ...input,
        ...(now ? { now } : {}),
      });
    },

    get_neglected_state(rawInput: unknown = {}) {
      const input = getNeglectedStateInputSchema.parse(rawInput);
      const now = currentNow(ctx, input.now);
      return getNeglectedState(ctx.db, ownerId(), {
        ...input,
        ...(now ? { now } : {}),
      });
    },

    // Write: Projects
    create_project(rawInput: unknown) {
      const input = createProjectInputSchema.parse(rawInput);
      return createProject(ctx.db, ownerId(), {
        ...input,
        mutationId: input.mutationId ?? crypto.randomUUID(),
      });
    },

    update_project(rawInput: unknown) {
      const { id, expectedRevision, completeUnfinishedTasks, completionPreview, mutationId, ...changes } =
        updateProjectInputSchema.parse(rawInput);
      const uid = ownerId();
      const current = getProject(ctx.db, uid, id);
      const rev = expectedRevision ?? current.revision;
      const resolvedPreview =
        changes.status === "Done" && current.status !== "Done" && !completionPreview && completeUnfinishedTasks !== false
          ? previewProjectCompletion(ctx.db, uid, id)
          : completionPreview;

      return updateProject(ctx.db, uid, id, rev, {
        ...changes,
        ...(resolvedPreview ? { completionPreview: resolvedPreview } : {}),
        mutationId: mutationId ?? crypto.randomUUID(),
      });
    },

    archive_project(rawInput: unknown) {
      const { id, archived, expectedRevision, mutationId } = archiveProjectInputSchema.parse(rawInput);
      const uid = ownerId();
      const rev = expectedRevision ?? getProject(ctx.db, uid, id).revision;
      return archiveProject(ctx.db, uid, id, rev, {
        archived,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
    },

    delete_project(rawInput: unknown) {
      const { id, dryRun, preview, mutationId } = deleteProjectInputSchema.parse(rawInput);
      const uid = ownerId();
      if (dryRun) {
        return { dryRun: true, preview: previewDeletion(ctx.db, uid, "project", id) };
      }
      const resolvedPreview = preview ?? previewDeletion(ctx.db, uid, "project", id);
      if (resolvedPreview.entityType !== "project" || resolvedPreview.id !== id) {
        throw new AppError(400, "Deletion preview does not match this project.");
      }
      const { operationId } = confirmDeletion(ctx.db, uid, {
        ...resolvedPreview,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
      return { operationId, deleted: resolvedPreview.records };
    },

    // Write: Tasks
    create_task(rawInput: unknown) {
      const input = createTaskInputSchema.parse(rawInput);
      return createTask(ctx.db, ownerId(), {
        ...input,
        mutationId: input.mutationId ?? crypto.randomUUID(),
      });
    },

    update_task(rawInput: unknown) {
      const { id, expectedRevision, mutationId, ...changes } = updateTaskInputSchema.parse(rawInput);
      const uid = ownerId();
      const rev = expectedRevision ?? getTask(ctx.db, uid, id).revision;
      return updateTask(ctx.db, uid, id, rev, {
        ...changes,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
    },

    complete_task(rawInput: unknown) {
      const { id, completed, expectedRevision, mutationId } = completeTaskInputSchema.parse(rawInput);
      const uid = ownerId();
      const rev = expectedRevision ?? getTask(ctx.db, uid, id).revision;
      return completeTask(ctx.db, uid, id, rev, {
        completed,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
    },

    move_task(rawInput: unknown) {
      const { id, expectedRevision, mutationId, ...changes } = moveTaskInputSchema.parse(rawInput);
      const uid = ownerId();
      const rev = expectedRevision ?? getTask(ctx.db, uid, id).revision;
      return moveTask(ctx.db, uid, id, rev, {
        ...changes,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
    },

    delete_task(rawInput: unknown) {
      const { id, dryRun, preview, mutationId } = deleteTaskInputSchema.parse(rawInput);
      const uid = ownerId();
      if (dryRun) {
        return { dryRun: true, preview: previewDeletion(ctx.db, uid, "task", id) };
      }
      const resolvedPreview = preview ?? previewDeletion(ctx.db, uid, "task", id);
      if (resolvedPreview.entityType !== "task" || resolvedPreview.id !== id) {
        throw new AppError(400, "Deletion preview does not match this task.");
      }
      const { operationId } = confirmDeletion(ctx.db, uid, {
        ...resolvedPreview,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
      return { operationId, deleted: resolvedPreview.records };
    },

    // Write: Events / Scheduling
    create_event(rawInput: unknown) {
      const input = createEventInputSchema.parse(rawInput);
      const uid = ownerId();
      const timezone = input.timezone ?? getPreferences(ctx.db, uid).timezone;
      return createEvent(ctx.db, uid, {
        ...input,
        timezone,
        mutationId: input.mutationId ?? crypto.randomUUID(),
      });
    },

    update_event(rawInput: unknown) {
      const { id, expectedRevision, mutationId, ...changes } = updateEventInputSchema.parse(rawInput);
      const uid = ownerId();
      const rev = expectedRevision ?? getEvent(ctx.db, uid, id).revision;
      return updateEvent(ctx.db, uid, id, rev, {
        ...changes,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
    },

    delete_event(rawInput: unknown) {
      const { id, dryRun, preview, mutationId } = deleteEventInputSchema.parse(rawInput);
      const uid = ownerId();
      if (dryRun) {
        return { dryRun: true, preview: previewDeletion(ctx.db, uid, "event", id) };
      }
      const resolvedPreview = preview ?? previewDeletion(ctx.db, uid, "event", id);
      if (resolvedPreview.entityType !== "event" || resolvedPreview.id !== id) {
        throw new AppError(400, "Deletion preview does not match this event.");
      }
      const { operationId } = confirmDeletion(ctx.db, uid, {
        ...resolvedPreview,
        mutationId: mutationId ?? crypto.randomUUID(),
      });
      return { operationId, deleted: resolvedPreview.records };
    },

    schedule_task(rawInput: unknown) {
      const input = scheduleTaskInputSchema.parse(rawInput);
      return scheduleTask(ctx.db, ownerId(), {
        ...input,
        mutationId: input.mutationId ?? crypto.randomUUID(),
      });
    },

    // Batch & Safety
    batch_apply(rawInput: unknown) {
      const input = batchApplyInputSchema.parse(rawInput);
      return batchApply(ctx.db, ownerId(), input);
    },

    undo_last_action(rawInput: unknown = {}) {
      const input = undoLastActionInputSchema.parse(rawInput);
      return undoLastAction(ctx.db, ownerId(), input);
    },

    // Resources
    read_resource_today() {
      const now = currentNow(ctx);
      return getTodayContext(ctx.db, ownerId(), now ? { now } : {});
    },

    read_resource_projects() {
      return listProjectsWithOptions(ctx.db, ownerId(), { includeProgress: true });
    },

    read_resource_neglected() {
      const now = currentNow(ctx);
      return getNeglectedState(ctx.db, ownerId(), now ? { now } : {});
    },
  };
}
