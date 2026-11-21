import { describe, expect, it } from "vitest";
import type { Event, Project, Task } from "@/lib/db/schema";
import {
  NO_PROJECT_KEY,
  addMinutesInstant,
  buildEventResizeEnd,
  buildInlineEventPayload,
  buildProjectDropAction,
  buildTaskDropAction,
  defaultInlineTimedRange,
  groupUnscheduledTasks,
  isWorkingHour,
  listDatelessProjects,
  nextCalendarDate,
} from "@/lib/calendar-schedule";

const now = "2026-11-21T00:00:00.000Z";

function makeProject(overrides: Partial<Project> & { id: string; name: string }): Project {
  return {
    ownerId: "u1",
    description: "",
    status: "Active",
    position: 0,
    deadline: null,
    archivedAt: null,
    deletedAt: null,
    deletionOperationId: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Project;
}

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    ownerId: "u1",
    projectId: null,
    description: "",
    status: "To do",
    important: null,
    urgent: null,
    position: 0,
    dueDate: null,
    dueAt: null,
    timezone: null,
    completedAt: null,
    deletedAt: null,
    deletionOperationId: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Task;
}

function makeEvent(overrides: Partial<Event> & { id: string; title: string }): Event {
  return {
    ownerId: "u1",
    description: "",
    start: "2027-02-10T10:00:00.000Z",
    end: "2027-02-10T11:00:00.000Z",
    allDay: false,
    timezone: "UTC",
    projectId: null,
    taskId: null,
    location: "",
    deletedAt: null,
    deletionOperationId: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Event;
}

describe("calendar-schedule", () => {
  it("groups open unscheduled tasks with No project first and excludes done/scheduled tasks", () => {
    const p1 = makeProject({ id: "p1", name: "Alpha" });
    const p2 = makeProject({ id: "p2", name: "Beta" });
    const tasks = [
      makeTask({ id: "t1", title: "Loose task", projectId: null }),
      makeTask({ id: "t2", title: "Alpha task", projectId: "p1" }),
      makeTask({ id: "t3", title: "Done task", projectId: "p1", status: "Done" }),
      makeTask({ id: "t4", title: "Scheduled task", projectId: "p2" }),
      makeTask({ id: "t5", title: "Beta open", projectId: "p2" }),
    ];
    const events = [makeEvent({ id: "e1", title: "Session", taskId: "t4" })];

    const groups = groupUnscheduledTasks(tasks, [p1, p2], events);
    expect(groups.map((g) => ({ key: g.key, name: g.name, ids: g.tasks.map((t) => t.id) }))).toEqual([
      { key: NO_PROJECT_KEY, name: "No project", ids: ["t1"] },
      { key: "p1", name: "Alpha", ids: ["t2"] },
      { key: "p2", name: "Beta", ids: ["t5"] },
    ]);

    // Highlighted or Shift-kept tasks stay visible even when already scheduled
    const withKept = groupUnscheduledTasks(tasks, [p1, p2], events, {
      includeTaskIds: new Set(["t4"]),
    });
    expect(withKept.find((g) => g.key === "p2")?.tasks.map((t) => t.id)).toEqual(["t4", "t5"]);

    // Search filters by title or project name
    const filtered = groupUnscheduledTasks(tasks, [p1, p2], events, { query: "alpha" });
    expect(filtered.map((g) => g.key)).toEqual(["p1"]);
  });

  it("lists only non-archived, non-Done projects with null deadline", () => {
    const projects = [
      makeProject({ id: "p1", name: "Needs date", status: "Active", deadline: null }),
      makeProject({ id: "p2", name: "Has date", status: "Active", deadline: "2027-03-01" }),
      makeProject({ id: "p3", name: "Finished", status: "Done", deadline: null }),
      makeProject({ id: "p4", name: "Archived", status: "Active", deadline: null, archivedAt: now }),
      makeProject({ id: "p5", name: "Planned", status: "Planned", deadline: null }),
    ];
    expect(listDatelessProjects(projects).map((p) => p.id)).toEqual(["p1", "p5"]);
    expect(listDatelessProjects(projects, "plan").map((p) => p.id)).toEqual(["p5"]);
  });

  it("builds DST-safe 1-hour timed event drop payload for tasks", () => {
    const task = makeTask({ id: "t1", title: "Focus block", revision: 3 });
    // Spring-forward in America/Los_Angeles: 2027-03-14 01:30 PST (09:30Z) + 60m = 03:30 PDT (10:30Z)
    const action = buildTaskDropAction(
      task,
      { kind: "time", startInstant: "2027-03-14T09:30:00Z" },
      "America/Los_Angeles",
    );
    expect(action).toEqual({
      endpoint: "/api/events",
      method: "POST",
      entityKey: "task:t1",
      payload: {
        title: "Focus block",
        start: "2027-03-14T09:30:00Z",
        end: "2027-03-14T10:30:00Z",
        allDay: false,
        timezone: "America/Los_Angeles",
        taskId: "t1",
        projectId: null,
      },
    });
    expect(defaultInlineTimedRange("2027-03-14T09:30:00Z", "America/Los_Angeles")).toEqual({
      start: "2027-03-14T01:30",
      end: "2027-03-14T03:30",
    });
  });

  it("builds task-to-day drop payload clearing dueAt and timezone", () => {
    const task = makeTask({
      id: "t2",
      title: "Submit report",
      dueAt: "2027-03-10T15:00:00.000Z",
      timezone: "America/Los_Angeles",
      revision: 4,
    });
    const action = buildTaskDropAction(task, { kind: "day", date: "2027-03-12" }, "America/Los_Angeles");
    expect(action).toEqual({
      endpoint: "/api/tasks/t2",
      method: "PATCH",
      entityKey: "task:t2",
      payload: {
        dueDate: "2027-03-12",
        dueAt: null,
        timezone: null,
        expectedRevision: 4,
      },
    });
  });

  it("builds project-to-day drop payload and rejects project-to-time drop", () => {
    const project = makeProject({ id: "p1", name: "Launch", revision: 2 });
    expect(buildProjectDropAction(project, { kind: "time", startInstant: "2027-03-12T10:00:00Z" })).toBeNull();
    expect(buildProjectDropAction(project, { kind: "day", date: "2027-03-20" })).toEqual({
      endpoint: "/api/projects/p1",
      method: "PATCH",
      entityKey: "project:p1",
      payload: {
        deadline: "2027-03-20",
        expectedRevision: 2,
      },
    });
  });

  it("computes resize end for timed and all-day events and rejects invalid ends", () => {
    expect(
      buildEventResizeEnd(
        { allDay: false, start: "2027-02-10T10:00:00.000Z" },
        { endStr: "2027-02-10T12:00:00.000Z", endDate: new Date("2027-02-10T12:00:00.000Z") },
      ),
    ).toBe("2027-02-10T12:00:00.000Z");

    expect(
      buildEventResizeEnd(
        { allDay: false, start: "2027-02-10T10:00:00.000Z" },
        { endStr: "2027-02-10T09:00:00.000Z", endDate: new Date("2027-02-10T09:00:00.000Z") },
      ),
    ).toBeNull();

    expect(
      buildEventResizeEnd(
        { allDay: true, start: "2027-02-10" },
        { endStr: "2027-02-13", endDate: new Date("2027-02-13T00:00:00.000Z") },
      ),
    ).toBe("2027-02-13");

    expect(
      buildEventResizeEnd(
        { allDay: true, start: "2027-02-10" },
        { endStr: "2027-02-10", endDate: new Date("2027-02-10T00:00:00.000Z") },
      ),
    ).toBeNull();
  });

  it("builds inline event payloads and working hours helpers", () => {
    expect(nextCalendarDate("2027-02-28")).toBe("2027-03-01");
    expect(addMinutesInstant("2027-02-10T10:00:00Z", 60)).toBe("2027-02-10T11:00:00Z");
    expect(
      buildInlineEventPayload({
        title: "Offsite",
        allDay: true,
        start: "2027-02-10",
        end: "",
        timezone: "UTC",
      }),
    ).toEqual({
      title: "Offsite",
      start: "2027-02-10",
      end: "2027-02-11",
      allDay: true,
      timezone: "UTC",
      projectId: null,
      taskId: null,
    });
    expect(isWorkingHour(8)).toBe(false);
    expect(isWorkingHour(9)).toBe(true);
    expect(isWorkingHour(17)).toBe(true);
    expect(isWorkingHour(18)).toBe(false);
  });
});
