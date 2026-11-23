import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type McpContext, runTool } from "./context";
import {
  archiveProjectInputSchema,
  batchApplyInputSchema,
  completeTaskInputSchema,
  createEventInputSchema,
  createMcpHandlers,
  createProjectInputSchema,
  createTaskInputSchema,
  deleteEventInputSchema,
  deleteProjectInputSchema,
  deleteTaskInputSchema,
  findFreeSlotsInputSchema,
  getNeglectedStateInputSchema,
  getDayPlansInputSchema,
  getTodayInputSchema,
  reorderDayInputSchema,
  setWorkingHoursInputSchema,
  listEventsInputSchema,
  listProjectsInputSchema,
  listTasksInputSchema,
  moveTaskInputSchema,
  scheduleTaskInputSchema,
  searchInputSchema,
  undoLastActionInputSchema,
  updateEventInputSchema,
  updateProjectInputSchema,
  updateTaskInputSchema,
} from "./handlers";

export function createRelayMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: "relay", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  const handlers = createMcpHandlers(ctx);

  // --- Read / Context Tools ---

  server.registerTool(
    "get_today",
    {
      title: "Get Today",
      description: "Today in Relay's model: capacity (working window, usable vs planned minutes), the ordered task queue (tasks have no clock times), summary.nextTask (first open task = Next up), summary.next (next timed event/deadline), fixed schedule (events + project deadlines), overdue tasks, and active projects.",
      inputSchema: getTodayInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.get_today(args)),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List projects with optional status, archive, and task-progress filters.",
      inputSchema: listProjectsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.list_projects(args)),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description: "List tasks by project, status, type, importance, planned day (executionDate / plannedFrom / plannedTo) or backlog (unplannedOnly). Each task carries executionDate, dayOrder, taskType and durationMinutes.",
      inputSchema: listTasksInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.list_tasks(args)),
  );

  server.registerTool(
    "list_events",
    {
      title: "List Events",
      description: "List calendar events (the only items with clock times), optionally by date/time range, project, or task.",
      inputSchema: listEventsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.list_events(args)),
  );

  server.registerTool(
    "search",
    {
      title: "Search Workspace",
      description: "Search projects, tasks, and events by text with optional status, project, date, or importance filters. Task results include their planned day, queue position, type and duration.",
      inputSchema: searchInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.search(args)),
  );

  server.registerTool(
    "find_free_slots",
    {
      title: "Find Free Slots",
      description: "Find open clock-time windows around timed events, inside the user's working window for each day. Only for placing EVENTS (meetings, appointments). Tasks are planned by day + queue order; use get_day_plans for that.",
      inputSchema: findFreeSlotsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.find_free_slots(args)),
  );

  server.registerTool(
    "get_neglected_state",
    {
      title: "Get Neglected State",
      description: "Diagnose drift: days since last activity, overdue tasks (planned day passed; recurring excluded), upcoming project deadlines with unplanned work, backlog size, and stalled Active projects.",
      inputSchema: getNeglectedStateInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.get_neglected_state(args)),
  );

  server.registerTool(
    "get_day_plans",
    {
      title: "Get Day Plans",
      description: "For each day in a range (default: 7 days from today): working window, usable minutes (window minus timed events), planned minutes, loadPercent, overbooked minutes, the ordered task queue, and fixed items (events, project deadlines). The main tool for planning days and weeks.",
      inputSchema: getDayPlansInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.get_day_plans(args)),
  );

  // --- Write Tools: Planning ---

  server.registerTool(
    "reorder_day",
    {
      title: "Reorder Day",
      description: "Set the order of one day's task queue. Pass every open task planned that day, first = do first. Undoable.",
      inputSchema: reorderDayInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.reorder_day(args)),
  );

  server.registerTool(
    "set_working_hours",
    {
      title: "Set Working Hours",
      description: "Change one day's working window (e.g. leaving early, a day off) so usable time is right, or reset=true to go back to the weekly default. Same as 'Hours' on the Today screen.",
      inputSchema: setWorkingHoursInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.set_working_hours(args)),
  );

  // --- Write Tools: Projects ---

  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description: "Create a new project (writes to the activity log so Relay UI Undo can revert it).",
      inputSchema: createProjectInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.create_project(args)),
  );

  server.registerTool(
    "update_project",
    {
      title: "Update Project",
      description: "Update a project's name, description, status, deadline, or position.",
      inputSchema: updateProjectInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.update_project(args)),
  );

  server.registerTool(
    "archive_project",
    {
      title: "Archive Project",
      description: "Archive or unarchive a project without deleting its tasks.",
      inputSchema: archiveProjectInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.archive_project(args)),
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete Project",
      description: "Soft-delete a project and its child tasks atomically (reversible via Undo). Pass dryRun=true to preview affected records first.",
      inputSchema: deleteProjectInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.delete_project(args)),
  );

  // --- Write Tools: Tasks ---

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description: "Create a task with its literal title. Plan it by giving executionDate (+ optional dayOrder); size it with taskType and optional durationMinutes. No executionDate = backlog.",
      inputSchema: createTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.create_task(args)),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update Task",
      description: "Update a task: title, project, type, durationMinutes, importance, planned day (executionDate; null = backlog), queue position, or repeat rule.",
      inputSchema: updateTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.update_task(args)),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a task Done (completed=true) or reopen it (completed=false). Completing a recurring task creates its next occurrence in the same undoable step; nothing else is created.",
      inputSchema: completeTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.complete_task(args)),
  );

  server.registerTool(
    "move_task",
    {
      title: "Move Task",
      description: "Move a task to another project (or null for No project) and/or change its status or position.",
      inputSchema: moveTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.move_task(args)),
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete Task",
      description: "Soft-delete a task and its linked events atomically (reversible via Undo). Pass dryRun=true to preview first.",
      inputSchema: deleteTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.delete_task(args)),
  );

  // --- Write Tools: Events / Scheduling ---

  server.registerTool(
    "create_event",
    {
      title: "Create Event",
      description: "Create a calendar event (standalone or linked to a project/task).",
      inputSchema: createEventInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.create_event(args)),
  );

  server.registerTool(
    "update_event",
    {
      title: "Update Event",
      description: "Update an event's title, time bounds, timezone, links, description, or location.",
      inputSchema: updateEventInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.update_event(args)),
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete Event",
      description: "Soft-delete an event (reversible via Undo). Pass dryRun=true to preview first.",
      inputSchema: deleteEventInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.delete_event(args)),
  );

  server.registerTool(
    "schedule_task",
    {
      title: "Schedule Task",
      description: "Book a task at a fixed clock time by creating a linked calendar event. Only when the user explicitly asks for a specific time; normal planning uses executionDate + queue order.",
      inputSchema: scheduleTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.schedule_task(args)),
  );

  // --- Batch & Safety Tools ---

  server.registerTool(
    "batch_apply",
    {
      title: "Batch Apply",
      description: "Apply an approved multi-step plan atomically as one undoable step. Task steps accept executionDate, dayOrder, durationMinutes and recurrenceRule; completing a recurring task creates its next occurrence.",
      inputSchema: batchApplyInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.batch_apply(args)),
  );

  server.registerTool(
    "undo_last_action",
    {
      title: "Undo Last Action",
      description: "Undo the most recent undoable mutation (or a specific operationId) safely without overwriting later work.",
      inputSchema: undoLastActionInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.undo_last_action(args)),
  );

  // --- Read-Only Resources ---

  server.registerResource(
    "today",
    "relay://today",
    {
      title: "Relay Today Snapshot",
      description: "Live JSON snapshot of today: capacity, ordered task queue, next task, fixed schedule, overdue tasks, and active projects.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(handlers.read_resource_today(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "projects",
    "relay://projects",
    {
      title: "Relay Projects Snapshot",
      description: "Live JSON snapshot of non-archived projects with task progress counts.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(handlers.read_resource_projects(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "neglected",
    "relay://neglected",
    {
      title: "Relay Neglected State Snapshot",
      description: "Live JSON snapshot of idle days, overdue tasks, upcoming project deadlines, backlog size, and stalled Active projects.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(handlers.read_resource_neglected(), null, 2),
        },
      ],
    }),
  );

  return server;
}
