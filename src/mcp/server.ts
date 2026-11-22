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
  getTodayInputSchema,
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
      description: "Return today's timeline, summary sentence, due-unscheduled tasks, overdue tasks, day state, and active projects with progress.",
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
      description: "List tasks filtered by project, status, importance, due date window, or unscheduled status.",
      inputSchema: listTasksInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.list_tasks(args)),
  );

  server.registerTool(
    "list_events",
    {
      title: "List Events",
      description: "List calendar events and scheduled task blocks, optionally filtered by date/time range, project, or task.",
      inputSchema: listEventsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.list_events(args)),
  );

  server.registerTool(
    "search",
    {
      title: "Search Workspace",
      description: "Search across projects, tasks, and events by text and optional status, project, date, or importance filters.",
      inputSchema: searchInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.search(args)),
  );

  server.registerTool(
    "find_free_slots",
    {
      title: "Find Free Slots",
      description: "Find open calendar windows within working hours around existing timed events and task blocks.",
      inputSchema: findFreeSlotsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.find_free_slots(args)),
  );

  server.registerTool(
    "get_neglected_state",
    {
      title: "Get Neglected State",
      description: "Diagnose drift: days since last activity, overdue tasks, unscheduled due-soon tasks, and stalled Active projects.",
      inputSchema: getNeglectedStateInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => handlers.get_neglected_state(args)),
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
      description: "Create a task with its literal title, optionally linked to a project and deadline.",
      inputSchema: createTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.create_task(args)),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update Task",
      description: "Update a task's title, description, project, status, importance, or due date.",
      inputSchema: updateTaskInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(() => handlers.update_task(args)),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a task Done (completed=true) or reopen it to To do (completed=false) without creating follow-up tasks.",
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
      description: "Schedule a task onto the calendar by creating a linked event (time block or all-day).",
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
      description: "Apply an approved multi-step plan atomically in one transaction with a single undoable activity entry.",
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
      description: "Live JSON snapshot of today's timeline, summary, due-unscheduled tasks, overdue tasks, and active projects.",
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
      description: "Live JSON snapshot of idle days, overdue tasks, unscheduled due-soon tasks, and stalled Active projects.",
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
