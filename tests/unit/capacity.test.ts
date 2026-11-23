import { describe, expect, it } from "vitest";
import {
  computeDayCapacity,
  DEFAULT_TASK_TYPE_MINUTES,
  DEFAULT_WORKING_HOURS,
  formatMinutes,
  resolveDayWorkingWindow,
  taskMinutes,
} from "@/lib/capacity";
import type { Event, Task } from "@/lib/db/schema";

function makeEvent(partial: Partial<Event>): Event {
  return {
    id: crypto.randomUUID(),
    ownerId: "u1",
    projectId: null,
    taskId: null,
    title: "Meeting",
    description: "",
    start: "2026-11-23T03:00:00.000Z", // 10:00 Asia/Jakarta
    end: "2026-11-23T04:00:00.000Z",   // 11:00 Asia/Jakarta
    allDay: false,
    timezone: "Asia/Jakarta",
    location: "",
    revision: 1,
    archivedAt: null,
    deletedAt: null,
    deletionOperationId: null,
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    ...partial,
  };
}

function makeTask(partial: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    ownerId: "u1",
    projectId: null,
    title: "Work",
    description: "",
    status: "To do",
    taskType: "Medium",
    durationMinutes: null,
    priority: "Medium",
    important: null,
    urgent: null,
    plannedDate: null,
    executionDate: "2026-11-23",
    dayOrder: 0,
    recurrenceRule: null,
    recurrenceSeriesId: null,
    dueDate: null,
    dueAt: null,
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: null,
    estimateMinutes: null,
    blockerReason: "",
    completedAt: null,
    position: 0,
    revision: 1,
    archivedAt: null,
    deletedAt: null,
    deletionOperationId: null,
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    ...partial,
  };
}

describe("capacity math", () => {
  it("subtracts overlapping timed events and ignores events outside working hours", () => {
    // 2026-11-23 is a Monday -> default 09:00-17:00 = 480m
    const window = resolveDayWorkingWindow("2026-11-23", DEFAULT_WORKING_HOURS);
    expect(window.enabled).toBe(true);

    const events = [
      // 10:00-11:00 Jakarta (60m inside window)
      makeEvent({ start: "2026-11-23T03:00:00.000Z", end: "2026-11-23T04:00:00.000Z" }),
      // 10:30-11:30 Jakarta (overlaps previous -> total 90m, not 120m!)
      makeEvent({ start: "2026-11-23T03:30:00.000Z", end: "2026-11-23T04:30:00.000Z" }),
      // 19:00-21:00 Jakarta (outside 09:00-17:00 -> 0m subtracted)
      makeEvent({ start: "2026-11-23T12:00:00.000Z", end: "2026-11-23T14:00:00.000Z" }),
      // All-day event -> 0m subtracted
      makeEvent({ allDay: true, start: "2026-11-23", end: "2026-11-24" }),
    ];

    const tasks = [
      makeTask({ taskType: "Instant", status: "Done" }), // 15m
      makeTask({ taskType: "Medium", status: "To do" }), // 45m
      makeTask({ taskType: "Deep", status: "To do" }),   // 90m
    ];

    const cap = computeDayCapacity({
      date: "2026-11-23",
      timezone: "Asia/Jakarta",
      window,
      events,
      tasks,
      taskTypeMinutes: DEFAULT_TASK_TYPE_MINUTES,
    });

    expect(cap.workingMinutes).toBe(480);
    expect(cap.eventMinutes).toBe(90);
    expect(cap.usableMinutes).toBe(390);
    expect(cap.plannedMinutes).toBe(150);
    expect(cap.completedMinutes).toBe(15);
    expect(cap.remainingMinutes).toBe(135);
    expect(cap.overbookedMinutes).toBe(0);
  });

  it("supports per-date overrides and custom taskType weights", () => {
    const window = resolveDayWorkingWindow("2026-11-22", DEFAULT_WORKING_HOURS, {
      enabled: true,
      start: "10:00",
      end: "12:00",
    });
    expect(window.isOverride).toBe(true);

    const cap = computeDayCapacity({
      date: "2026-11-22",
      timezone: "Asia/Jakarta",
      window,
      events: [],
      tasks: [
        makeTask({ executionDate: "2026-11-22", taskType: "Deep" }),
        makeTask({ executionDate: "2026-11-22", taskType: "Medium" }),
      ],
      taskTypeMinutes: { Instant: 10, Medium: 50, Deep: 100 },
    });

    expect(cap.usableMinutes).toBe(120);
    expect(cap.plannedMinutes).toBe(150);
    expect(cap.overbookedMinutes).toBe(30);
    expect(formatMinutes(cap.plannedMinutes)).toBe("2h 30m");
  });

  it("uses a task's own duration over the type default, and falls back when cleared", () => {
    expect(taskMinutes({ taskType: "Medium", durationMinutes: 20 })).toBe(20);
    expect(taskMinutes({ taskType: "Medium", durationMinutes: null })).toBe(DEFAULT_TASK_TYPE_MINUTES.Medium);

    const window = resolveDayWorkingHoursFor("2026-11-22");
    const cap = computeDayCapacity({
      date: "2026-11-22",
      timezone: "Asia/Jakarta",
      window,
      events: [],
      tasks: [
        makeTask({ executionDate: "2026-11-22", taskType: "Deep", durationMinutes: 30 }),
        makeTask({ executionDate: "2026-11-22", taskType: "Medium" }),
      ],
    });
    expect(cap.plannedMinutes).toBe(30 + DEFAULT_TASK_TYPE_MINUTES.Medium);
  });
});

function resolveDayWorkingHoursFor(date: string) {
  return resolveDayWorkingWindow(date, DEFAULT_WORKING_HOURS, undefined);
}
