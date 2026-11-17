import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as projects from "../../src/lib/projects";
import { createTask, getTask, updateTask } from "../../src/lib/tasks";
import { activity } from "../../src/lib/db/schema";
import { confirmDeletion, previewDeletion, undoOperation } from "../../src/lib/lifecycle";
import { homeData, searchWorkspace } from "../../src/lib/workbench";
import { addDependency } from "../../src/lib/dependencies";
import { createEvent, getEvent } from "../../src/lib/events";
import { quadrants, priorityLabel } from "../../src/lib/priority";
import { testWorkspace } from "../support/auth";

describe("Phase 1.2 manual classification and cascading completion", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const project = () => projects.createProject(w.db, w.alice.id, { name: "Cascade", mutationId: crypto.randomUUID() });
  const task = (projectId: string | null, data = {}) => createTask(w.db, w.alice.id, { title: "Child", projectId, ...data, mutationId: crypto.randomUUID() });
  const complete = (id: string, preview = projects.previewProjectCompletion(w.db, w.alice.id, id), mutationId = crypto.randomUUID()) =>
    projects.updateProject(w.db, w.alice.id, id, 1, { status: "Done", completionPreview: preview, mutationId });

  it("stores explicit independent importance/urgency, defaults to unclassified, and filters false values", () => {
    const plain = task(null);
    expect(plain).toMatchObject({ important: null, urgent: null });
    const classified = task(null, { important: true, urgent: false, dueDate: "2020-01-01" });
    expect(classified).toMatchObject({ important: true, urgent: false });
    const moved = updateTask(w.db, w.alice.id, classified.id, 1, { dueDate: "2030-01-01", mutationId: crypto.randomUUID() });
    expect(moved).toMatchObject({ important: true, urgent: false });
    expect(searchWorkspace(w.db, w.alice.id, { important: "true", urgent: "false" }).items.map((r) => r.id)).toContain(classified.id);
    expect(searchWorkspace(w.db, w.alice.id, { important: "false" }).items.map((r) => r.id)).not.toContain(classified.id);
    expect(() => task(null, { important: "yes" })).toThrow();
  });

  it("atomically completes unfinished children, preserves Done/deleted/unrelated records, and replays one operation", () => {
    const p = project(), child = task(p.id), done = task(p.id, { status: "Done" });
    const removed = task(p.id), independent = task(null);
    confirmDeletion(w.db, w.alice.id, { ...previewDeletion(w.db, w.alice.id, "task", removed.id), mutationId: crypto.randomUUID() });
    const preview = projects.previewProjectCompletion(w.db, w.alice.id, p.id);
    const mutationId = crypto.randomUUID();
    complete(p.id, preview, mutationId);
    const completed = getTask(w.db, w.alice.id, child.id);
    expect(completed).toMatchObject({ status: "Done", revision: 2 });
    expect(completed.completedAt).toBeTruthy();
    expect(getTask(w.db, w.alice.id, done.id)).toEqual(done);
    expect(getTask(w.db, w.alice.id, independent.id)).toEqual(independent);
    expect(() => getTask(w.db, w.alice.id, removed.id)).toThrow(/not found/i);
    complete(p.id, preview, mutationId);
    const logs = w.db.select().from(activity).where(eq(activity.mutationId, mutationId)).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].afterState).toHaveLength(2);
    undoOperation(w.db, w.alice.id, logs[0].id, { mutationId: crypto.randomUUID() });
    expect(getTask(w.db, w.alice.id, child.id)).toMatchObject({ status: "To do", completedAt: null, revision: 3 });
    expect(projects.getProject(w.db, w.alice.id, p.id).status).toBe("Planned");
  });

  it("rejects added, edited, moved and removed children after preview without changing project", () => {
    for (const change of ["added", "edited", "moved", "removed"]) {
      const p = project(), child = task(p.id), preview = projects.previewProjectCompletion(w.db, w.alice.id, p.id);
      if (change === "added") task(p.id);
      if (change === "edited") updateTask(w.db, w.alice.id, child.id, 1, { title: "Newer", mutationId: crypto.randomUUID() });
      if (change === "moved") updateTask(w.db, w.alice.id, child.id, 1, { projectId: null, mutationId: crypto.randomUUID() });
      if (change === "removed") confirmDeletion(w.db, w.alice.id, { ...previewDeletion(w.db, w.alice.id, "task", child.id), mutationId: crypto.randomUUID() });
      const count = w.db.select().from(activity).all().length;
      expect(() => complete(p.id, preview)).toThrow(/changed/i);
      expect(projects.getProject(w.db, w.alice.id, p.id).status).toBe("Planned");
      expect(w.db.select().from(activity).all()).toHaveLength(count);
    }
  });

  it("refuses missing/foreign previews and rolls back a failed cascade audit", () => {
    const p = project(), child = task(p.id);
    expect(() => projects.updateProject(w.db, w.alice.id, p.id, 1, { status: "Done", mutationId: crypto.randomUUID() })).toThrow(/preview|unfinished/i);
    expect(() => projects.previewProjectCompletion(w.db, w.bob.id, p.id)).toThrow(/not found/i);
    const preview = projects.previewProjectCompletion(w.db, w.alice.id, p.id);
    w.db.$client.exec("CREATE TRIGGER fail_cascade BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT, 'cascade audit failure'); END");
    try { expect(() => complete(p.id, preview)).toThrow(/cascade audit failure/); }
    finally { w.db.$client.exec("DROP TRIGGER fail_cascade"); }
    expect(getTask(w.db, w.alice.id, child.id)).toEqual(child);
    expect(projects.getProject(w.db, w.alice.id, p.id).status).toBe("Planned");
  });

  it("stale cascade Undo changes nothing, and reopen/pause/archive do not rewrite children", () => {
    const p = project(), child = task(p.id);
    const completed = complete(p.id);
    const operation = w.db.select().from(activity).all().at(-1)!;
    const newer = updateTask(w.db, w.alice.id, child.id, 2, { title: "Later work", mutationId: crypto.randomUUID() });
    expect(() => undoOperation(w.db, w.alice.id, operation.id, { mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    expect(projects.getProject(w.db, w.alice.id, p.id).status).toBe("Done");
    const reopened = projects.updateProject(w.db, w.alice.id, p.id, completed.revision, { status: "Active", mutationId: crypto.randomUUID() });
    const paused = projects.updateProject(w.db, w.alice.id, p.id, reopened.revision, { status: "Paused", mutationId: crypto.randomUUID() });
    projects.archiveProject(w.db, w.alice.id, p.id, paused.revision, { archived: true, mutationId: crypto.randomUUID() });
    expect(getTask(w.db, w.alice.id, child.id)).toEqual(newer);
  });

  it("board completion uses the same child preview and records one reversible cascade", () => {
    const p = project(), child = task(p.id);
    const all = projects.listProjects(w.db, w.alice.id).filter((r) => r.status === "Done" || r.id === p.id);
    const result = projects.reorderProjects(w.db, w.alice.id, {
      id: p.id, status: "Done", orderedIds: all.map((r) => r.id),
      expectedRevisions: all.map(({ id, revision }) => ({ id, revision })),
      completionPreview: projects.previewProjectCompletion(w.db, w.alice.id, p.id), mutationId: crypto.randomUUID(),
    });
    expect(result.find((r) => r.id === p.id)?.status).toBe("Done");
    expect(getTask(w.db, w.alice.id, child.id).status).toBe("Done");
  });

  it("Home counts local today/overdue separately and does not change urgency", () => {
    const late = task(null, { title: "Late", dueDate: "2027-03-14" });
    const today = task(null, { title: "Today", dueAt: "2027-03-14T18:00:00Z", timezone: "UTC", urgent: false });
    const data = homeData(w.db, w.alice.id, "Asia/Jakarta", "2027-03-14T19:00:00Z");
    expect(data.dueToday.map((t) => t.id)).toContain(today.id);
    expect(data.overdue.map((t) => t.id)).toEqual(expect.arrayContaining([late.id, today.id]));
    expect(getTask(w.db, w.alice.id, today.id).urgent).toBe(false);
  });

  it("completion preserves linked/independent events and outside prerequisites while previewing blocker warnings", () => {
    const p = project(), outsideProject = project(), child = task(p.id, { status: "Doing", blockerReason: "Awaiting review" }), prerequisite = task(outsideProject.id);
    addDependency(w.db, w.alice.id, { taskId: child.id, prerequisiteId: prerequisite.id, mutationId: crypto.randomUUID() });
    const event = (taskId: string | null) => createEvent(w.db, w.alice.id, { title: "Keep event", taskId, start: "2027-04-01", end: "2027-04-02", allDay: true, timezone: "UTC", mutationId: crypto.randomUUID() });
    const linked = event(child.id), independent = event(null);
    const preview = projects.previewProjectCompletion(w.db, w.alice.id, p.id);
    expect(preview.tasks[0].warnings).toContain("Awaiting review");
    expect(preview.tasks[0].warnings.some((s) => s.includes("Waiting on"))).toBe(true);
    complete(p.id, preview);
    expect(getTask(w.db, w.alice.id, child.id).status).toBe("Done");
    expect(getTask(w.db, w.alice.id, prerequisite.id)).toEqual(prerequisite);
    expect(getEvent(w.db, w.alice.id, linked.id)).toEqual(linked);
    expect(getEvent(w.db, w.alice.id, independent.id)).toEqual(independent);
  });

  it("all four quadrants and partial classification have distinct labels", () => {
    const choices = [{ important: true, urgent: true }, { important: true, urgent: false },
      { important: false, urgent: true }, { important: false, urgent: false }, { important: null, urgent: true }];
    expect(choices.map(priorityLabel)).toEqual([...quadrants]);
  });
});
