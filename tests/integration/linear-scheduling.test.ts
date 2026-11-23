import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testWorkspace } from "../support/auth";
import { listActivity } from "../../src/lib/activity";
import { createEvent } from "../../src/lib/events";
import * as recovery from "../../src/lib/lifecycle";
import {
  clearWorkingHoursOverride,
  getPreferences,
  savePreferences,
  setWorkingHoursOverride,
} from "../../src/lib/preferences";
import { createProject } from "../../src/lib/projects";
import {
  advanceMissedRecurringTasks,
  completeTask,
  createTask,
  listTasks,
  reorderDayTasks,
  updateTask,
} from "../../src/lib/tasks";
import { todayTimeline } from "../../src/lib/today";

describe("v3.3 linear scheduling, capacity, recurrence & deadlines in Today", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeEach(async () => {
    w = await testWorkspace();
  });
  afterEach(() => w.close());
  const mut = () => ({ mutationId: crypto.randomUUID() });

  it("defaults taskType weights to 15/45/90 and persists custom settings & per-date overrides", () => {
    const initial = getPreferences(w.db, w.alice.id);
    expect(initial.taskTypeMinutes).toEqual({ Instant: 15, Medium: 45, Deep: 90 });

    const saved = savePreferences(w.db, w.alice.id, {
      timezone: "Asia/Jakarta",
      weekStart: 1,
      taskTypeMinutes: { Instant: 10, Medium: 40, Deep: 100 },
      expectedRevision: initial.revision,
    });
    expect(saved.taskTypeMinutes).toEqual({ Instant: 10, Medium: 40, Deep: 100 });

    const override = setWorkingHoursOverride(w.db, w.alice.id, "2026-11-23", {
      enabled: true,
      start: "10:00",
      end: "14:00",
    });
    expect(override).toMatchObject({ date: "2026-11-23", enabled: true, start: "10:00", end: "14:00" });

    const cleared = clearWorkingHoursOverride(w.db, w.alice.id, "2026-11-23");
    expect(cleared.cleared).toBe(true);
  });

  it("completing a recurring task spawns the next occurrence and one Undo reverts both", () => {
    const created = createTask(w.db, w.alice.id, {
      title: "Daily standup prep",
      taskType: "Instant",
      executionDate: "2026-11-23",
      recurrenceRule: { frequency: "daily", interval: 1 },
      ...mut(),
    });
    expect(created.recurrenceSeriesId).toBeTruthy();

    const completeMut = mut();
    const completed = completeTask(w.db, w.alice.id, created.id, created.revision, {
      completed: true,
      ...completeMut,
    });
    expect(completed.status).toBe("Done");

    const afterComplete = listTasks(w.db, w.alice.id);
    expect(afterComplete).toHaveLength(2);
    const nextOcc = afterComplete.find((t) => t.id !== created.id)!;
    expect(nextOcc.status).toBe("To do");
    expect(nextOcc.executionDate).toBe("2026-11-24");
    expect(nextOcc.recurrenceSeriesId).toBe(created.recurrenceSeriesId);

    // One Undo reverts completion AND removes spawned next occurrence
    const op = listActivity(w.db, w.alice.id).find((a) => a.mutationId === completeMut.mutationId)!;
    recovery.undoOperation(w.db, w.alice.id, op.id, mut());

    const afterUndo = listTasks(w.db, w.alice.id);
    expect(afterUndo).toHaveLength(1);
    expect(afterUndo[0].id).toBe(created.id);
    expect(afterUndo[0].status).toBe("To do");
  });

  it("lets a task override its type duration, clears it back to the default, and carries it to the next recurrence", () => {
    const created = createTask(w.db, w.alice.id, {
      title: "Weekly report",
      taskType: "Medium",
      durationMinutes: 20,
      executionDate: "2026-11-23",
      recurrenceRule: { frequency: "daily", interval: 1 },
      ...mut(),
    });
    expect(created.durationMinutes).toBe(20);
    expect(() => updateTask(w.db, w.alice.id, created.id, created.revision, { durationMinutes: 0, ...mut() })).toThrow();

    const completed = completeTask(w.db, w.alice.id, created.id, created.revision, { completed: true, ...mut() });
    const next = listTasks(w.db, w.alice.id).find((t) => t.id !== completed.id)!;
    expect(next.durationMinutes).toBe(20);

    const cleared = updateTask(w.db, w.alice.id, next.id, next.revision, { durationMinutes: null, ...mut() });
    expect(cleared.durationMinutes).toBeNull();
  });

  it("auto-advances missed recurring tasks without leaving them overdue", () => {
    const t = createTask(w.db, w.alice.id, {
      title: "Morning review",
      executionDate: "2026-11-18",
      recurrenceRule: { frequency: "daily", interval: 1 },
      ...mut(),
    });

    const advanced = advanceMissedRecurringTasks(w.db, w.alice.id, "2026-11-23");
    expect(advanced).toBe(1);

    const day = todayTimeline(w.db, w.alice.id, "Asia/Jakarta", "2026-11-23T02:00:00.000Z");
    expect(day.overdue).toHaveLength(0);
    expect(day.tasks.map((x) => x.id)).toContain(t.id);
  });

  it("surfaces timed project deadlines in Today, computes usable time, and reorders linear queue", () => {
    const proj = createProject(w.db, w.alice.id, {
      name: "Ship Relay v3.3",
      status: "Active",
      deadlineAt: "2026-11-23T10:00:00+07:00",
      deadlineTimezone: "Asia/Jakarta",
      ...mut(),
    });

    // Event 10:00-11:30 Jakarta (90m inside default Mon 09:00-17:00 = 480m -> 390m usable)
    createEvent(w.db, w.alice.id, {
      title: "Design sync",
      start: "2026-11-23T03:00:00.000Z",
      end: "2026-11-23T04:30:00.000Z",
      allDay: false,
      timezone: "Asia/Jakarta",
      ...mut(),
    });

    const t1 = createTask(w.db, w.alice.id, {
      title: "First task",
      taskType: "Deep",
      executionDate: "2026-11-23",
      dayOrder: 0,
      ...mut(),
    });
    const t2 = createTask(w.db, w.alice.id, {
      title: "Second task",
      taskType: "Medium",
      executionDate: "2026-11-23",
      dayOrder: 1,
      ...mut(),
    });

    // Reorder linear queue: t2 before t1
    reorderDayTasks(w.db, w.alice.id, {
      executionDate: "2026-11-23",
      orderedIds: [t2.id, t1.id],
      expectedRevisions: [
        { id: t1.id, revision: t1.revision },
        { id: t2.id, revision: t2.revision },
      ],
      ...mut(),
    });

    const day = todayTimeline(w.db, w.alice.id, "Asia/Jakarta", "2026-11-23T01:00:00.000Z");
    expect(day.capacity.workingMinutes).toBe(480);
    expect(day.capacity.eventMinutes).toBe(90);
    expect(day.capacity.usableMinutes).toBe(390);
    expect(day.capacity.plannedMinutes).toBe(135); // 90m + 45m
    expect(day.schedule.some((i) => i.kind === "project-deadline" && i.projectId === proj.id)).toBe(true);
    expect(day.tasks.map((t) => t.id)).toEqual([t2.id, t1.id]);
  });
});
