import { describe, expect, it } from "vitest";
import type { Event, Project, Task } from "../../src/lib/db/schema";
import { groupProjects, planProjectMove, planTaskMove, summarize, tasksByProject, upcomingEvents } from "../../src/lib/project-board";

const t = (id: string, over: Partial<Task> = {}): Task => ({
  id, ownerId: "u", projectId: "p1", title: id, description: "", status: "To do", important: null, urgent: null,
  dueDate: null, dueAt: null, timezone: null, position: 0, revision: 1, completedAt: null,
  createdAt: `2026-01-01T00:00:0${id.length % 10}Z`, updatedAt: "", ...over,
} as Task);
const p = (id: string, over: Partial<Project> = {}): Project => ({
  id, ownerId: "u", name: id, description: "", status: "Planned", deadline: null, position: 0, revision: 1,
  archivedAt: null, deletedAt: null, deletionOperationId: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "", ...over,
} as Project);
const e = (id: string, over: Partial<Event>): Event => ({
  id, ownerId: "u", title: id, description: "", start: "", end: "", allDay: false, timezone: "UTC", projectId: null, taskId: null,
  location: "", revision: 1, createdAt: "", updatedAt: "", ...over,
} as Event);

describe("summarize", () => {
  it("counts done / total and picks the earliest open deadline, overdue included", () => {
    const s = summarize(p("p1", { deadline: "2026-12-20" }), [
      t("a", { status: "Done", dueDate: "2026-11-01" }), t("b", { dueDate: "2026-12-05" }), t("c", { dueDate: "2026-11-10" }), t("d"),
    ]);
    expect(s).toEqual({ done: 1, total: 4, next: { date: "2026-11-10", kind: "task" } });
  });
  it("uses the project deadline when it is first, and timed deadlines in their own zone", () => {
    expect(summarize(p("p1", { deadline: "2026-12-01" }), [t("a", { dueAt: "2026-12-01T20:00:00.000Z", timezone: "Asia/Jakarta" })]).next)
      .toEqual({ date: "2026-12-01", kind: "project" });
    expect(summarize(null, [t("a", { dueAt: "2026-11-30T20:00:00.000Z", timezone: "Asia/Jakarta" })]).next)
      .toEqual({ date: "2026-12-01", kind: "task" });
  });
  it("has no next deadline for a Done project or an empty one", () => {
    expect(summarize(p("p1", { status: "Done", deadline: "2026-12-01" }), [t("a", { dueDate: "2026-11-01" })]).next).toBeNull();
    expect(summarize(null, [])).toEqual({ done: 0, total: 0, next: null });
  });
});

describe("grouping", () => {
  it("puts loose tasks under 'none' in board order", () => {
    const groups = tasksByProject([t("b", { projectId: null, position: 1 }), t("a", { projectId: null, position: 0 }), t("c")]);
    expect(groups.get("none")!.map((x) => x.id)).toEqual(["a", "b"]);
    expect(groups.get("p1")!.map((x) => x.id)).toEqual(["c"]);
  });
  it("groups projects by status, archived apart, ordered by position", () => {
    const g = groupProjects([p("x", { status: "Active", position: 2 }), p("y", { status: "Active", position: 1 }), p("z", { archivedAt: "2026-01-01" })]);
    expect(g.Active.map((x) => x.id)).toEqual(["y", "x"]);
    expect(g.Planned).toEqual([]);
    expect(g.archived.map((x) => x.id)).toEqual(["z"]);
  });
});

describe("move plans", () => {
  const tasks = [t("a", { position: 0 }), t("b", { position: 1 }), t("c", { status: "Doing", position: 0 }), t("d", { projectId: "p2", position: 0, revision: 4 })];

  it("moves a task between columns at an index and stamps completion", () => {
    const plan = planTaskMove(tasks, "a", { projectId: "p1", status: "Done" }, "2026-11-19T00:00:00Z")!;
    expect(plan.orderedIds).toEqual(["a"]);
    expect(plan.next.find((x) => x.id === "a")).toMatchObject({ status: "Done", position: 0, completedAt: "2026-11-19T00:00:00Z" });
    const doing = planTaskMove(tasks, "b", { projectId: "p1", status: "Doing", index: 0 })!;
    expect(doing.orderedIds).toEqual(["b", "c"]);
    expect(doing.expectedRevisions).toEqual([{ id: "b", revision: 1 }, { id: "c", revision: 1 }]);
  });
  it("reorders within a column", () => {
    expect(planTaskMove(tasks, "b", { projectId: "p1", status: "To do", index: 0 })!.orderedIds).toEqual(["b", "a"]);
  });
  it("moves a task to another project (or to no project) at the end of the same status", () => {
    const plan = planTaskMove(tasks, "a", { projectId: "p2", status: "To do" })!;
    expect(plan.orderedIds).toEqual(["d", "a"]);
    expect(plan.expectedRevisions).toEqual([{ id: "a", revision: 1 }, { id: "d", revision: 4 }]);
    expect(planTaskMove(tasks, "a", { projectId: null, status: "To do" })!.next.find((x) => x.id === "a")!.projectId).toBeNull();
  });
  it("moves a project between status groups, ignoring archived ones", () => {
    const projects = [p("x", { status: "Planned" }), p("y", { status: "Active" }), p("z", { status: "Active", archivedAt: "2026-01-01" })];
    const plan = planProjectMove(projects, "x", { status: "Active", index: 0 })!;
    expect(plan.orderedIds).toEqual(["x", "y"]);
    expect(plan.next.find((x) => x.id === "x")!.status).toBe("Active");
    expect(planProjectMove(projects, "missing", { status: "Active" })).toBeNull();
  });
});

describe("upcomingEvents", () => {
  const tasks = [t("a"), t("loose", { projectId: null })];
  const now = "2026-11-19T10:00:00.000Z";
  it("keeps future and running events linked directly or through a task", () => {
    const events = [
      e("past", { projectId: "p1", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" }),
      e("running", { taskId: "a", start: "2026-11-19T09:30:00Z", end: "2026-11-19T10:30:00Z" }),
      e("later", { projectId: "p1", start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" }),
      e("other", { projectId: "p2", start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" }),
    ];
    expect(upcomingEvents(events, tasks, "p1", now, "UTC").map((x) => x.id)).toEqual(["running", "later"]);
  });
  it("puts standalone events and loose-task events under 'none', all-day today included", () => {
    const events = [
      e("standalone", { allDay: true, start: "2026-11-19", end: "2026-11-20" }),
      e("loose-block", { taskId: "loose", start: "2026-11-21T09:00:00Z", end: "2026-11-21T10:00:00Z" }),
      e("yesterday", { allDay: true, start: "2026-11-18", end: "2026-11-19" }),
    ];
    expect(upcomingEvents(events, tasks, "none", now, "UTC").map((x) => x.id)).toEqual(["standalone", "loose-block"]);
  });
});
