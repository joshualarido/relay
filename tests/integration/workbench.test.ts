import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createProject, archiveProject } from "../../src/lib/projects";
import { createTask } from "../../src/lib/tasks";
import { createEvent } from "../../src/lib/events";
import * as legacy from "../support/legacy-records";
import * as workbench from "../../src/lib/workbench";
import { previewDeletion, confirmDeletion } from "../../src/lib/lifecycle";
import { testWorkspace } from "../support/auth";

describe("manual workbench", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const project = () => createProject(w.db, w.alice.id, { name: "Workbench project", status: "Active", deadline: "2027-03-15", mutationId: crypto.randomUUID() });
  const task = (input = {}) => createTask(w.db, w.alice.id, { title: "Workbench task", ...input, mutationId: crypto.randomUUID() });
  const link = (taskId: string, prerequisiteId: string) => legacy.addDependency(w.db, w.alice.id, { taskId, prerequisiteId, mutationId: crypto.randomUUID() });
  it("cascades pre-v3 check-ins and reference edges, never the independent prerequisite/dependent task", () => {
    const p = project(), a = task({ projectId: p.id }), b = task();
    const edge = link(b.id, a.id);
    const c = legacy.createCheckIn(w.db, w.alice.id, { taskId: a.id, content: "Save this", mutationId: crypto.randomUUID() });
    const preview = previewDeletion(w.db, w.alice.id, "project", p.id);
    expect(preview.records.map((r) => r.id)).toEqual(expect.arrayContaining([p.id, a.id, edge.id, c.id]));
    expect(preview.records.map((r) => r.id)).not.toContain(b.id);
    confirmDeletion(w.db, w.alice.id, { ...preview, mutationId: crypto.randomUUID() });
    expect(legacy.listDependencies(w.db, w.alice.id, b.id)).toEqual([]);
    expect(legacy.listCheckIns(w.db, w.alice.id, { taskId: a.id })).toEqual([]);
  });
  it("searches/filter only active owned work and computes overdue by user-zone day boundaries", () => {
    const p = project();
    const a = task({ title: "Needle", projectId: p.id, dueDate: "2027-03-14" });
    const b = task({ title: "Needle later", dueAt: "2027-03-15T03:00:00Z", timezone: "Asia/Jakarta" });
    const results = workbench.searchWorkspace(w.db, w.alice.id, { q: "Needle", projectId: p.id, date: "2027-03-14" });
    expect(results.items.map((v) => v.id)).toEqual([a.id]);
    expect(workbench.searchWorkspace(w.db, w.bob.id, { q: "Needle" }).items).toEqual([]);
    const before = workbench.homeData(w.db, w.alice.id, "Asia/Jakarta", "2027-03-14T16:59:00Z");
    expect(before.overdue.map((t) => t.id)).not.toContain(a.id);
    const after = workbench.homeData(w.db, w.alice.id, "Asia/Jakarta", "2027-03-14T17:01:00Z");
    expect(after.overdue.map((t) => t.id)).toContain(a.id);
    expect(after.overdue.map((t) => t.id)).not.toContain(b.id);
    archiveProject(w.db, w.alice.id, p.id, 1, { archived: true, mutationId: crypto.randomUUID() });
    expect(workbench.searchWorkspace(w.db, w.alice.id, { q: "Needle" }).items.map((v) => v.id)).not.toContain(a.id);
  });
  it("does not mark an exactly-equal timed deadline overdue because of ISO formatting", () => {
    const t = task({ title: "Exact instant", dueAt: "2027-03-15T03:00:00+00:00", timezone: "UTC" });
    const home = workbench.homeData(w.db, w.alice.id, "UTC", "2027-03-15T03:00:00Z");
    expect(home.overdue.map((v) => v.id)).not.toContain(t.id);
  });

  const plan = (taskId: string, start: string, end: string, allDay = true) => createEvent(w.db, w.alice.id, { title: "Plan", taskId, start, end, allDay, timezone: "UTC", mutationId: crypto.randomUUID() });
  it("derives a deduplicated Today set from linked events and deadlines", () => {
    const before = workbench.homeData(w.db, w.alice.id, "UTC", "2027-03-15T12:00:00Z");
    const planned = task({ title: "Planned today", dueDate: "2027-03-20" });
    plan(planned.id, "2027-03-15", "2027-03-16");
    const due = task({ title: "Due today", dueDate: "2027-03-15" });
    const done = task({ title: "Done today", status: "Done" });
    plan(done.id, "2027-03-15T09:00:00Z", "2027-03-15T10:00:00Z", false);
    const tomorrow = task({ title: "Planned tomorrow" });
    plan(tomorrow.id, "2027-03-16", "2027-03-17");
    const overdue = task({ title: "Overdue", dueDate: "2027-03-14" });
    const home = workbench.homeData(w.db, w.alice.id, "UTC", "2027-03-15T12:00:00Z");
    const todayIds = home.todayTasks.map((v) => v.id);
    expect(todayIds).toEqual(expect.arrayContaining([planned.id, due.id, done.id, overdue.id]));
    expect(todayIds).not.toContain(tomorrow.id);
    expect(home.plannedToday.map((v) => v.id)).toEqual(expect.arrayContaining([planned.id, done.id]));
    expect(home.plannedToday.map((v) => v.id)).not.toContain(tomorrow.id);
    expect(new Set(todayIds).size).toBe(todayIds.length);
    expect(home.todayProgress.done - before.todayProgress.done).toBe(1);
    expect(home.todayProgress.total - before.todayProgress.total).toBe(3);
  });
});
