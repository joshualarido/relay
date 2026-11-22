import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { activity, event, project, task } from "../../src/lib/db/schema";
import { undoOperation } from "../../src/services/lifecycle";
import { resolveDefaultOwnerId } from "../../src/mcp/context";
import { createMcpHandlers } from "../../src/mcp/handlers";
import { createRelayMcpServer } from "../../src/mcp/server";
import { testWorkspace } from "../support/auth";

function parseToolText(result: unknown) {
  const content = (result as { content?: unknown }).content;
  const items = Array.isArray(content) ? content : [];
  const first = items[0] as { type: string; text: string } | undefined;
  if (!first || first.type !== "text") throw new Error("Expected text content from MCP tool.");
  return JSON.parse(first.text);
}

describe("Relay Phase 5 — shared services and MCP layer", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  let aliceHandlers: ReturnType<typeof createMcpHandlers>;
  let bobHandlers: ReturnType<typeof createMcpHandlers>;

  beforeAll(async () => {
    w = await testWorkspace();
    aliceHandlers = createMcpHandlers({
      db: w.db,
      resolveOwnerId: () => w.alice.id,
    });
    bobHandlers = createMcpHandlers({
      db: w.db,
      resolveOwnerId: () => w.bob.id,
    });
  });

  afterAll(() => {
    w?.close();
  });

  describe("Project, task, and event CRUD via MCP handlers", () => {
    it("performs full project CRUD with activity logging, progress, archive, dry-run delete, and UI undo", () => {
      const created = aliceHandlers.create_project({
        name: "Launch v3",
        description: "Ship the MCP layer",
        status: "Active",
        deadline: "2026-12-15",
      });
      expect(created).toMatchObject({
        name: "Launch v3",
        status: "Active",
        deadline: "2026-12-15",
        revision: 1,
      });

      const listed = aliceHandlers.list_projects({ status: "Active", includeProgress: true });
      expect(listed.some((p) => p.id === created.id && p.progress?.total === 0)).toBe(true);

      // Ownership isolation: Bob cannot see or mutate Alice's project
      expect(bobHandlers.list_projects({}).some((p) => p.id === created.id)).toBe(false);
      expect(() => bobHandlers.update_project({ id: created.id, name: "Hijack" })).toThrow(/not found/i);

      const updated = aliceHandlers.update_project({
        id: created.id,
        expectedRevision: 1,
        description: "Updated plan",
      });
      expect(updated.revision).toBe(2);
      expect(updated.description).toBe("Updated plan");

      // Stale revision rejected
      expect(() => aliceHandlers.update_project({ id: created.id, expectedRevision: 1, name: "Stale" })).toThrow(/changed/i);

      const archived = aliceHandlers.archive_project({ id: created.id, archived: true });
      expect(archived.archivedAt).toBeTruthy();
      expect(aliceHandlers.list_projects({}).some((p) => p.id === created.id)).toBe(false);
      expect(aliceHandlers.list_projects({ archivedOnly: true }).some((p) => p.id === created.id)).toBe(true);

      const unarchived = aliceHandlers.archive_project({ id: created.id, archived: false });
      expect(unarchived.archivedAt).toBeNull();

      // Add a child task and verify dryRun preview lists both project and task
      const childTask = aliceHandlers.create_task({
        title: "Write MCP tests",
        projectId: created.id,
      });
      const dryRun = aliceHandlers.delete_project({ id: created.id, dryRun: true });
      expect("dryRun" in dryRun && dryRun.dryRun).toBe(true);
      if ("preview" in dryRun && dryRun.preview) {
        expect(dryRun.preview.records.map((r) => r.id).sort()).toEqual([created.id, childTask.id].sort());
      }

      const deleted = aliceHandlers.delete_project({ id: created.id });
      expect("operationId" in deleted && deleted.deleted).toHaveLength(2);
      expect(aliceHandlers.list_projects({}).some((p) => p.id === created.id)).toBe(false);

      // Relay UI Undo (undoOperation) restores both the project and its child task
      if ("operationId" in deleted && deleted.operationId) {
        undoOperation(w.db, w.alice.id, deleted.operationId, { mutationId: crypto.randomUUID() });
      }
      expect(aliceHandlers.list_projects({}).some((p) => p.id === created.id)).toBe(true);
      expect(aliceHandlers.list_tasks({ projectId: created.id }).some((t) => t.id === childTask.id)).toBe(true);

      // Clean up
      aliceHandlers.delete_project({ id: created.id });
    });

    it("performs full task CRUD, literal titles, complete, move, filters, and delete", () => {
      const p1 = aliceHandlers.create_project({ name: "Proj One", status: "Active" });
      const p2 = aliceHandlers.create_project({ name: "Proj Two", status: "Planned" });

      const t = aliceHandlers.create_task({
        title: "  Draft release notes & check links  ",
        projectId: p1.id,
        important: true,
        dueDate: "2026-11-25",
      });
      // Literal title preserved
      expect(t.title).toBe("  Draft release notes & check links  ");
      expect(t.projectId).toBe(p1.id);
      expect(t.important).toBe(true);

      // Filtering
      expect(aliceHandlers.list_tasks({ projectId: p1.id, important: true, dueBefore: "2026-11-26" }).some((x) => x.id === t.id)).toBe(true);
      expect(aliceHandlers.list_tasks({ projectId: "none" }).some((x) => x.id === t.id)).toBe(false);

      // Move to p2
      const moved = aliceHandlers.move_task({ id: t.id, projectId: p2.id, position: 3 });
      expect(moved.projectId).toBe(p2.id);
      expect(moved.position).toBe(3);

      // Move to loose ("No project")
      const loose = aliceHandlers.move_task({ id: t.id, projectId: null });
      expect(loose.projectId).toBeNull();
      expect(aliceHandlers.list_tasks({ projectId: null }).some((x) => x.id === t.id)).toBe(true);

      // Complete and reopen without spawning extra tasks
      const beforeCount = aliceHandlers.list_tasks({}).length;
      const done = aliceHandlers.complete_task({ id: t.id, completed: true });
      expect(done.status).toBe("Done");
      expect(done.completedAt).toBeTruthy();
      expect(aliceHandlers.list_tasks({}).length).toBe(beforeCount);

      const reopened = aliceHandlers.complete_task({ id: t.id, completed: false });
      expect(reopened.status).toBe("To do");
      expect(reopened.completedAt).toBeNull();

      // Update & delete
      const edited = aliceHandlers.update_task({ id: t.id, description: "Added notes" });
      expect(edited.description).toBe("Added notes");

      const deleted = aliceHandlers.delete_task({ id: t.id });
      expect("operationId" in deleted && deleted.operationId).toBeTruthy();
      expect(aliceHandlers.list_tasks({}).some((x) => x.id === t.id)).toBe(false);

      // Activity log contains all task mutations
      const entries = w.db.select().from(activity).where(eq(activity.entityId, t.id)).all();
      expect(entries.length).toBeGreaterThanOrEqual(6);

      aliceHandlers.delete_project({ id: p1.id });
      aliceHandlers.delete_project({ id: p2.id });
    });

    it("performs full event CRUD, schedule_task, range filtering, search, and get_today", () => {
      const proj = aliceHandlers.create_project({ name: "Calendar Ops", status: "Active" });
      const taskItem = aliceHandlers.create_task({
        title: "Deep work block",
        projectId: proj.id,
        dueDate: "2026-11-22",
      });

      // Standalone event
      const standup = aliceHandlers.create_event({
        title: "Team sync",
        start: "2026-11-22T09:00:00+07:00",
        end: "2026-11-22T09:30:00+07:00",
        timezone: "Asia/Jakarta",
        location: "https://meet.example.com/sync",
      });
      expect(standup.title).toBe("Team sync");
      expect(standup.start).toBe("2026-11-22T02:00:00.000Z");

      // Schedule task -> creates linked event inheriting task title & 90m duration
      const scheduled = aliceHandlers.schedule_task({
        taskId: taskItem.id,
        start: "2026-11-22T10:00:00+07:00",
        durationMinutes: 90,
        timezone: "Asia/Jakarta",
      });
      expect(scheduled.taskId).toBe(taskItem.id);
      expect(scheduled.title).toBe("Deep work block");
      expect(scheduled.start).toBe("2026-11-22T03:00:00.000Z");
      expect(scheduled.end).toBe("2026-11-22T04:30:00.000Z");

      // Default scheduling durations by taskType: Instant=15m, Medium=30m, Deep=60m
      const instantTask = aliceHandlers.create_task({ title: "Quick reply", taskType: "Instant" });
      const mediumTask = aliceHandlers.create_task({ title: "Review PR", taskType: "Medium" });
      const deepTask = aliceHandlers.create_task({ title: "Design architecture", taskType: "Deep" });
      const evInstant = aliceHandlers.schedule_task({ taskId: instantTask.id, start: "2026-11-23T09:00:00+07:00", timezone: "Asia/Jakarta" });
      const evMedium = aliceHandlers.schedule_task({ taskId: mediumTask.id, start: "2026-11-23T10:00:00+07:00", timezone: "Asia/Jakarta" });
      const evDeep = aliceHandlers.schedule_task({ taskId: deepTask.id, start: "2026-11-23T11:00:00+07:00", timezone: "Asia/Jakarta" });
      expect(Date.parse(evInstant.end) - Date.parse(evInstant.start)).toBe(15 * 60_000);
      expect(Date.parse(evMedium.end) - Date.parse(evMedium.start)).toBe(30 * 60_000);
      expect(Date.parse(evDeep.end) - Date.parse(evDeep.start)).toBe(60 * 60_000);
      aliceHandlers.delete_task({ id: instantTask.id });
      aliceHandlers.delete_task({ id: mediumTask.id });
      aliceHandlers.delete_task({ id: deepTask.id });

      // Task is no longer unscheduled
      expect(aliceHandlers.list_tasks({ unscheduledOnly: true }).some((t) => t.id === taskItem.id)).toBe(false);

      // Update event
      const updatedEvent = aliceHandlers.update_event({
        id: scheduled.id,
        title: "Deep work: MCP",
      });
      expect(updatedEvent.title).toBe("Deep work: MCP");

      // Filter events by range and projectId (even though linked through taskId)
      const rangeEvents = aliceHandlers.list_events({
        from: "2026-11-22",
        to: "2026-11-22",
        timezone: "Asia/Jakarta",
      });
      expect(rangeEvents.map((e) => e.id)).toEqual(expect.arrayContaining([standup.id, scheduled.id]));

      const projEvents = aliceHandlers.list_events({ projectId: proj.id });
      expect(projEvents.map((e) => e.id)).toEqual([scheduled.id]);

      // Search finds project, task, and event
      const searchRes = aliceHandlers.search({ query: "Deep work" });
      expect(searchRes.items.some((i) => i.kind === "task" && i.id === taskItem.id)).toBe(true);
      expect(searchRes.items.some((i) => i.kind === "event" && i.id === scheduled.id)).toBe(true);

      // get_today reflects timeline and summary
      const todayRes = aliceHandlers.get_today({
        now: "2026-11-22T08:00:00+07:00",
        timezone: "Asia/Jakarta",
      });
      expect(todayRes.today).toBe("2026-11-22");
      expect(todayRes.items.map((i) => i.id)).toEqual(expect.arrayContaining([standup.id, scheduled.id]));
      expect(todayRes.summary.total).toBeGreaterThanOrEqual(2);
      expect(todayRes.summarySentence).toContain("Team sync");

      // Delete events and project
      aliceHandlers.delete_event({ id: standup.id });
      aliceHandlers.delete_event({ id: scheduled.id });
      aliceHandlers.delete_project({ id: proj.id });
    });
  });

  describe("find_free_slots", () => {
    it("computes open windows around existing events, respects buffers, min duration, and excludePast", () => {
      const e1 = aliceHandlers.create_event({
        title: "Morning standup",
        start: "2026-12-01T09:30:00+07:00",
        end: "2026-12-01T10:30:00+07:00",
        timezone: "Asia/Jakarta",
      });
      const e2 = aliceHandlers.create_event({
        title: "Design review",
        start: "2026-12-01T13:00:00+07:00",
        end: "2026-12-01T14:30:00+07:00",
        timezone: "Asia/Jakarta",
      });
      // Overlapping with e2
      const e3 = aliceHandlers.create_event({
        title: "Overlap call",
        start: "2026-12-01T14:00:00+07:00",
        end: "2026-12-01T15:00:00+07:00",
        timezone: "Asia/Jakarta",
      });
      // All-day event should not block timed slots
      const allDay = aliceHandlers.create_event({
        title: "Release day",
        start: "2026-12-01",
        end: "2026-12-02",
        allDay: true,
        timezone: "Asia/Jakarta",
      });

      const slots60 = aliceHandlers.find_free_slots({
        date: "2026-12-01",
        durationMinutes: 60,
        workdayStartHour: 9,
        workdayEndHour: 18,
        timezone: "Asia/Jakarta",
        excludePast: false,
      });
      // 09:00-09:30 is only 30m -> excluded. Expect 10:30-13:00 (150m) and 15:00-18:00 (180m).
      expect(slots60.slots.map((s) => [s.localStart, s.localEnd, s.durationMinutes])).toEqual([
        ["2026-12-01T10:30", "2026-12-01T13:00", 150],
        ["2026-12-01T15:00", "2026-12-01T18:00", 180],
      ]);

      // With 15-minute buffer around busy blocks
      const buffered = aliceHandlers.find_free_slots({
        date: "2026-12-01",
        durationMinutes: 60,
        workdayStartHour: 9,
        workdayEndHour: 18,
        bufferMinutes: 15,
        timezone: "Asia/Jakarta",
        excludePast: false,
      });
      expect(buffered.slots.map((s) => [s.localStart, s.localEnd, s.durationMinutes])).toEqual([
        ["2026-12-01T10:45", "2026-12-01T12:45", 120],
        ["2026-12-01T15:15", "2026-12-01T18:00", 165],
      ]);

      // With excludePast=true at 12:00 local -> first slot shrinks to 12:00-13:00 (60m)
      const fromNoon = aliceHandlers.find_free_slots({
        date: "2026-12-01",
        durationMinutes: 60,
        workdayStartHour: 9,
        workdayEndHour: 18,
        timezone: "Asia/Jakarta",
        excludePast: true,
        now: "2026-12-01T12:00:00+07:00",
      });
      expect(fromNoon.slots.map((s) => [s.localStart, s.localEnd])).toEqual([
        ["2026-12-01T12:00", "2026-12-01T13:00"],
        ["2026-12-01T15:00", "2026-12-01T18:00"],
      ]);

      // Clean up
      aliceHandlers.delete_event({ id: e1.id });
      aliceHandlers.delete_event({ id: e2.id });
      aliceHandlers.delete_event({ id: e3.id });
      aliceHandlers.delete_event({ id: allDay.id });
    });
  });

  describe("get_neglected_state", () => {
    it("accurately reports idle days, overdue tasks, unscheduled due-soon tasks, and stalled Active projects", async () => {
      // Use a dedicated isolated DB so activity timestamps are exact and deterministic
      const isolated = await testWorkspace();
      try {
        const handlers = createMcpHandlers({
          db: isolated.db,
          resolveOwnerId: () => isolated.alice.id,
        });

        const stalledProj = handlers.create_project({ name: "Stalled Project", status: "Active", deadline: "2026-12-30" });
        const healthyProj = handlers.create_project({ name: "Healthy Project", status: "Active" });
        const pausedProj = handlers.create_project({ name: "Paused Project", status: "Paused" });

        const overdueTask = handlers.create_task({
          title: "Pay invoice",
          projectId: stalledProj.id,
          dueDate: "2026-11-15",
          important: true,
        });
        const dueSoonUnscheduled = handlers.create_task({
          title: "Prepare demo deck",
          projectId: healthyProj.id,
          dueDate: "2026-11-23",
        });
        const dueSoonScheduled = handlers.create_task({
          title: "Record walkthrough",
          projectId: healthyProj.id,
          dueDate: "2026-11-22",
        });
        const scheduledEvent = handlers.schedule_task({
          taskId: dueSoonScheduled.id,
          start: "2026-11-22T10:00:00+07:00",
          timezone: "Asia/Jakarta",
        });
        const doneOldTask = handlers.create_task({
          title: "Already finished",
          projectId: stalledProj.id,
          dueDate: "2026-11-10",
          status: "Done",
        });

        // Age all activity to 5 days before 2026-11-21T12:00:00+07:00 -> 2026-11-16T05:00:00.000Z
        const fiveDaysAgo = "2026-11-16T05:00:00.000Z";
        const tenDaysAgo = "2026-11-11T05:00:00.000Z";
        const twoDaysAgo = "2026-11-19T05:00:00.000Z";

        isolated.db.update(activity).set({ createdAt: fiveDaysAgo }).run();
        // Make stalledProj + its tasks + pausedProj 10 days stale
        isolated.db.update(project).set({ updatedAt: tenDaysAgo }).where(eq(project.id, stalledProj.id)).run();
        isolated.db.update(project).set({ updatedAt: tenDaysAgo }).where(eq(project.id, pausedProj.id)).run();
        isolated.db.update(task).set({ updatedAt: tenDaysAgo }).where(eq(task.id, overdueTask.id)).run();
        isolated.db.update(task).set({ updatedAt: tenDaysAgo, completedAt: tenDaysAgo }).where(eq(task.id, doneOldTask.id)).run();
        // Make healthyProj recently active (2 days ago)
        isolated.db.update(project).set({ updatedAt: twoDaysAgo }).where(eq(project.id, healthyProj.id)).run();
        isolated.db.update(task).set({ updatedAt: twoDaysAgo }).where(eq(task.id, dueSoonUnscheduled.id)).run();
        isolated.db.update(event).set({ updatedAt: twoDaysAgo }).where(eq(event.id, scheduledEvent.id)).run();

        const state = handlers.get_neglected_state({
          now: "2026-11-21T12:00:00+07:00",
          timezone: "Asia/Jakarta",
          dueSoonDays: 3,
          stalledProjectDays: 7,
        });

        expect(state.daysSinceLastActivity).toBe(5);
        expect(state.isIdle).toBe(true);
        expect(state.needsRecovery).toBe(true);

        // Overdue: only open overdueTask (doneOldTask excluded)
        expect(state.overdueTasks.map((t) => ({ id: t.id, daysOverdue: t.daysOverdue }))).toEqual([
          { id: overdueTask.id, daysOverdue: 6 },
        ]);

        // Unscheduled due soon: only dueSoonUnscheduled (dueSoonScheduled has linked event)
        expect(state.unscheduledDueSoonTasks.map((t) => ({ id: t.id, daysUntilDue: t.daysUntilDue }))).toEqual([
          { id: dueSoonUnscheduled.id, daysUntilDue: 2 },
        ]);

        // Stalled Active projects: only stalledProj (healthyProj moved 2d ago, pausedProj is Paused)
        expect(state.stalledActiveProjects.map((p) => ({
          id: p.id,
          daysSinceMovement: p.daysSinceMovement,
          openTaskCount: p.openTaskCount,
          doneTaskCount: p.doneTaskCount,
        }))).toEqual([
          { id: stalledProj.id, daysSinceMovement: 10, openTaskCount: 1, doneTaskCount: 1 },
        ]);
      } finally {
        isolated.close();
      }
    });
  });

  describe("batch_apply and undo_last_action", () => {
    it("applies mixed mutations atomically and reverses the entire batch in one undo_last_action", () => {
      const existingProj = aliceHandlers.create_project({ name: "Existing Batch Proj", status: "Active" });
      const existingTask = aliceHandlers.create_task({
        title: "Reschedule me",
        projectId: existingProj.id,
        dueDate: "2026-11-20",
      });
      const toDeleteTask = aliceHandlers.create_task({
        title: "Drop obsolete item",
        projectId: existingProj.id,
      });

      const mutationId = crypto.randomUUID();
      const batchRes = aliceHandlers.batch_apply({
        mutationId,
        operations: [
          { op: "update_task", id: existingTask.id, dueDate: "2026-11-28", important: true },
          { op: "schedule_task", taskId: existingTask.id, start: "2026-11-28T10:00:00+07:00", durationMinutes: 60, timezone: "Asia/Jakarta" },
          { op: "create_task", title: "Brand new follow-up", projectId: existingProj.id },
          { op: "delete_task", id: toDeleteTask.id },
        ],
      });

      expect(batchRes.appliedCount).toBe(4);
      const createdEventId = batchRes.results[1]!.entityId;
      const createdTaskId = batchRes.results[2]!.entityId;

      // Idempotent replay with same mutationId returns identical result without duplicating rows
      const replayed = aliceHandlers.batch_apply({
        mutationId,
        operations: [
          { op: "update_task", id: existingTask.id, dueDate: "2026-11-28", important: true },
          { op: "schedule_task", taskId: existingTask.id, start: "2026-11-28T10:00:00+07:00", durationMinutes: 60, timezone: "Asia/Jakarta" },
          { op: "create_task", title: "Brand new follow-up", projectId: existingProj.id },
          { op: "delete_task", id: toDeleteTask.id },
        ],
      });
      expect(replayed).toEqual(batchRes);

      // Verify post-batch state
      expect(aliceHandlers.list_tasks({ projectId: existingProj.id }).find((t) => t.id === existingTask.id)?.dueDate).toBe("2026-11-28");
      expect(aliceHandlers.list_tasks({ projectId: existingProj.id }).some((t) => t.id === createdTaskId)).toBe(true);
      expect(aliceHandlers.list_tasks({ projectId: existingProj.id }).some((t) => t.id === toDeleteTask.id)).toBe(false);
      expect(aliceHandlers.list_events({ taskId: existingTask.id }).some((e) => e.id === createdEventId)).toBe(true);

      // Single undo_last_action reverts ALL 4 operations atomically
      const undone = aliceHandlers.undo_last_action({});
      expect(undone.undoneOperationId).toBe(batchRes.operationId);
      expect(undone.undoneAction).toBe("batch");

      // Verify everything reverted cleanly
      const restoredExisting = aliceHandlers.list_tasks({ projectId: existingProj.id }).find((t) => t.id === existingTask.id);
      expect(restoredExisting?.dueDate).toBe("2026-11-20");
      expect(restoredExisting?.important).toBeNull();
      expect(aliceHandlers.list_tasks({ projectId: existingProj.id }).some((t) => t.id === createdTaskId)).toBe(false);
      expect(aliceHandlers.list_tasks({ projectId: existingProj.id }).some((t) => t.id === toDeleteTask.id)).toBe(true);
      expect(aliceHandlers.list_events({ taskId: existingTask.id }).some((e) => e.id === createdEventId)).toBe(false);

      aliceHandlers.delete_project({ id: existingProj.id });
    });

    it("rolls back all earlier steps if a later step in batch_apply fails", () => {
      const beforeTasks = aliceHandlers.list_tasks({}).length;
      expect(() =>
        aliceHandlers.batch_apply({
          operations: [
            { op: "create_task", title: "Should roll back on failure" },
            { op: "update_task", id: "nonexistent-task-id", title: "Boom" },
          ],
        }),
      ).toThrow(/not found/i);

      expect(aliceHandlers.list_tasks({}).length).toBe(beforeTasks);
      expect(aliceHandlers.list_tasks({}).some((t) => t.title === "Should roll back on failure")).toBe(false);
    });

    it("refuses undo_last_action on an earlier operation if later edits modified the same record", () => {
      const t = aliceHandlers.create_task({ title: "Original" });
      aliceHandlers.update_task({ id: t.id, title: "Second" });
      const firstEditActivity = w.db.select().from(activity)
        .where(eq(activity.entityId, t.id)).all()
        .find((a) => a.action === "edit")!;
      aliceHandlers.update_task({ id: t.id, title: "Third" });

      expect(() => aliceHandlers.undo_last_action({ operationId: firstEditActivity.id })).toThrow(/overwrite later work/i);

      // Undoing the newest edit ("Third" -> "Second") succeeds
      const undoLatest = aliceHandlers.undo_last_action({});
      expect(undoLatest.undoneAction).toBe("edit");
      expect(aliceHandlers.list_tasks({}).find((x) => x.id === t.id)?.title).toBe("Second");

      aliceHandlers.delete_task({ id: t.id });
    });
  });

  describe("MCP protocol server (tools/list, resources/list, tool calls, resources/read)", () => {
    it("exposes all 22 tools and 3 resources over MCP transport and handles valid & invalid calls cleanly", async () => {
      const server = createRelayMcpServer({
        db: w.db,
        resolveOwnerId: () => w.alice.id,
        now: () => "2026-11-21T10:00:00+07:00",
      });
      const client = new Client({ name: "relay-test-client", version: "0.1.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      try {
        const toolsList = await client.listTools();
        const toolNames = toolsList.tools.map((t) => t.name).sort();
        expect(toolNames).toEqual([
          "archive_project",
          "batch_apply",
          "complete_task",
          "create_event",
          "create_project",
          "create_task",
          "delete_event",
          "delete_project",
          "delete_task",
          "find_free_slots",
          "get_neglected_state",
          "get_today",
          "list_events",
          "list_projects",
          "list_tasks",
          "move_task",
          "schedule_task",
          "search",
          "undo_last_action",
          "update_event",
          "update_project",
          "update_task",
        ]);

        const resourcesList = await client.listResources();
        expect(resourcesList.resources.map((r) => r.uri).sort()).toEqual([
          "relay://neglected",
          "relay://projects",
          "relay://today",
        ]);

        // Call tool end-to-end
        const createdRes = await client.callTool({
          name: "create_project",
          arguments: { name: "MCP Wire Project", status: "Active" },
        });
        expect(createdRes.isError).toBeFalsy();
        const createdProj = parseToolText(createdRes);
        expect(createdProj.name).toBe("MCP Wire Project");

        // Read all 3 live resources
        const projectsSnap = await client.readResource({ uri: "relay://projects" });
        const projectsData = JSON.parse((projectsSnap.contents[0] as { text: string }).text);
        expect(projectsData.some((p: { id: string }) => p.id === createdProj.id)).toBe(true);

        const todaySnap = await client.readResource({ uri: "relay://today" });
        const todayData = JSON.parse((todaySnap.contents[0] as { text: string }).text);
        expect(todayData.today).toBe("2026-11-21");

        const neglectedSnap = await client.readResource({ uri: "relay://neglected" });
        const neglectedData = JSON.parse((neglectedSnap.contents[0] as { text: string }).text);
        expect(neglectedData.today).toBe("2026-11-21");

        // Undo via MCP tool
        const undoRes = await client.callTool({ name: "undo_last_action", arguments: {} });
        expect(undoRes.isError).toBeFalsy();

        // Error handling returns isError: true without crashing server
        const badRes = await client.callTool({
          name: "update_task",
          arguments: { id: "missing-id", title: "Nope" },
        });
        expect(badRes.isError).toBe(true);
        expect(parseToolText(badRes).error).toMatch(/not found/i);
      } finally {
        await client.close();
        await server.close();
      }
    });

    it("resolves default owner cleanly for single-user DB and rejects ambiguous multi-user DB without env", () => {
      const prevId = process.env.RELAY_MCP_USER_ID;
      const prevEmail = process.env.RELAY_MCP_USER_EMAIL;
      try {
        delete process.env.RELAY_MCP_USER_ID;
        delete process.env.RELAY_MCP_USER_EMAIL;
        // testWorkspace creates both Alice and Bob -> must ask for explicit env selector
        expect(() => resolveDefaultOwnerId(w.db)).toThrow(/Multiple users/i);

        process.env.RELAY_MCP_USER_EMAIL = w.alice.email;
        expect(resolveDefaultOwnerId(w.db)).toBe(w.alice.id);

        delete process.env.RELAY_MCP_USER_EMAIL;
        process.env.RELAY_MCP_USER_ID = w.bob.id;
        expect(resolveDefaultOwnerId(w.db)).toBe(w.bob.id);
      } finally {
        if (prevId === undefined) delete process.env.RELAY_MCP_USER_ID;
        else process.env.RELAY_MCP_USER_ID = prevId;
        if (prevEmail === undefined) delete process.env.RELAY_MCP_USER_EMAIL;
        else process.env.RELAY_MCP_USER_EMAIL = prevEmail;
      }
    });
  });
});
