import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createProject, archiveProject } from "../../src/lib/projects";
import { createTask, updateTask } from "../../src/lib/tasks";
import { createEvent } from "../../src/lib/events";
import * as checkins from "../../src/lib/check-ins";
import * as dependencies from "../../src/lib/dependencies";
import * as workbench from "../../src/lib/workbench";
import { previewDeletion, confirmDeletion } from "../../src/lib/lifecycle";
import { testWorkspace } from "../support/auth";

describe("manual workbench", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const project = () => createProject(w.db, w.alice.id, { name: "Workbench project", status: "Active", deadline: "2027-03-15", mutationId: crypto.randomUUID() });
  const task = (input = {}) => createTask(w.db, w.alice.id, { title: "Workbench task", ...input, mutationId: crypto.randomUUID() });
  const link = (taskId: string, prerequisiteId: string) => dependencies.addDependency(w.db, w.alice.id, { taskId, prerequisiteId, mutationId: crypto.randomUUID() });
  it("saves exact manual check-ins on one selected owned association, deriving task projects", () => {
    const p = project(), t = task({ projectId: p.id });
    for (const data of [{}, { projectId: p.id, taskId: t.id }, { taskId: "missing" }]) {
      expect(() => checkins.createCheckIn(w.db, w.alice.id, { content: "Progress", ...data, mutationId: crypto.randomUUID() })).toThrow();
    }
    expect(() => checkins.createCheckIn(w.db, w.bob.id, { content: "Foreign", taskId: t.id, mutationId: crypto.randomUUID() })).toThrow(/not found/i);
    const input = { content: "  Tests work, UI needs care.  ", taskId: t.id, mutationId: crypto.randomUUID() };
    const saved = checkins.createCheckIn(w.db, w.alice.id, input);
    expect(saved).toMatchObject({ content: input.content, taskId: t.id, projectId: null });
    expect(checkins.createCheckIn(w.db, w.alice.id, input)).toEqual(saved);
    expect(checkins.listCheckIns(w.db, w.alice.id, { projectId: p.id }).map((c) => c.id)).toContain(saved.id);
    expect(checkins.listCheckIns(w.db, w.bob.id, { taskId: t.id })).toEqual([]);
  });
  it("rejects self-links, cycles, duplicate links and foreign ownership, without blocking completion", () => {
    const a = task(), b = task(), c = task();
    expect(() => link(a.id, a.id)).toThrow(/itself|self/i);
    link(a.id, b.id); link(b.id, c.id);
    expect(() => link(c.id, a.id)).toThrow(/cycle/i);
    expect(() => link(a.id, b.id)).toThrow(/already/i);
    expect(() => dependencies.addDependency(w.db, w.bob.id, { taskId: a.id, prerequisiteId: b.id, mutationId: crypto.randomUUID() })).toThrow(/not found/i);
    expect(dependencies.dependencyWarnings(w.db, w.alice.id, a.id)).toHaveLength(1);
    expect(updateTask(w.db, w.alice.id, a.id, 1, { status: "Done", mutationId: crypto.randomUUID() }).status).toBe("Done");
    const edge = dependencies.listDependencies(w.db, w.alice.id, a.id)[0];
    dependencies.removeDependency(w.db, w.alice.id, edge.id, edge.revision, { mutationId: crypto.randomUUID() });
    expect(dependencies.dependencyWarnings(w.db, w.alice.id, a.id)).toEqual([]);
  });
  it("cascades check-ins and reference edges, never the independent prerequisite/dependent task", () => {
    const p = project(), a = task({ projectId: p.id }), b = task();
    const edge = link(b.id, a.id);
    const c = checkins.createCheckIn(w.db, w.alice.id, { taskId: a.id, content: "Save this", mutationId: crypto.randomUUID() });
    const preview = previewDeletion(w.db, w.alice.id, "project", p.id);
    expect(preview.records.map((r) => r.id)).toEqual(expect.arrayContaining([p.id, a.id, edge.id, c.id]));
    expect(preview.records.map((r) => r.id)).not.toContain(b.id);
    confirmDeletion(w.db, w.alice.id, { ...preview, mutationId: crypto.randomUUID() });
    expect(dependencies.listDependencies(w.db, w.alice.id, b.id)).toEqual([]);
    expect(checkins.listCheckIns(w.db, w.alice.id, { taskId: a.id })).toEqual([]);
  });
  it("searches/filter only active owned work and computes overdue by user-zone day boundaries", () => {
    const p = project();
    const a = task({ title: "Needle", projectId: p.id, priority: "High", dueDate: "2027-03-14" });
    const b = task({ title: "Needle later", dueAt: "2027-03-15T03:00:00Z", timezone: "Asia/Jakarta" });
    const results = workbench.searchWorkspace(w.db, w.alice.id, { q: "Needle", priority: "High", projectId: p.id, date: "2027-03-14" });
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
