import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as tasks from "../../src/lib/tasks";
import { activity } from "../../src/lib/db/schema";
import { archiveProject, createProject, getProjectProgress, updateProject, previewProjectCompletion } from "../../src/lib/projects";
import { confirmDeletion, previewDeletion } from "../../src/lib/lifecycle";
import { testWorkspace } from "../support/auth";

describe("manual tasks", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const create = (input: Record<string, unknown> = {}) =>
    tasks.createTask(w.db, w.alice.id, { title: "  Fix login and write tests  ", ...input, mutationId: crypto.randomUUID() });
  const project = () => createProject(w.db, w.alice.id, { name: "Task project", mutationId: crypto.randomUUID() });

  it("captures exact text in Inbox, links owned projects, and rejects foreign parents", () => {
    const t = create();
    expect(t).toMatchObject({ title: "  Fix login and write tests  ", projectId: null, status: "To do", priority: "Medium" });
    expect(tasks.listTasks(w.db, w.alice.id).find((v) => v.id === t.id)).toEqual(t);
    expect(() => tasks.getTask(w.db, w.bob.id, t.id)).toThrow(/not found/i);
    const p = project();
    expect(create({ projectId: p.id }).projectId).toBe(p.id);
    expect(() => tasks.createTask(w.db, w.bob.id, { title: "No", projectId: p.id, mutationId: crypto.randomUUID() })).toThrow(/not found/i);
  });

  it("validates statuses, dates, zones, and ownership input, and rejects dormant v2 fields", () => {
    for (const input of [
      { title: " " }, { status: "Active" }, { priority: "Medium" }, { urgent: false }, { estimateMinutes: 45 },
      { blockerReason: "" }, { plannedDate: "2027-02-30" }, { dueDate: "2027-02-30" }, { dueAt: "2027-01-01T00:00:00Z" },
      { dueAt: "bad", timezone: "UTC" }, { dueAt: "2027-01-01T00:00:00Z", timezone: "Not/Zone" },
      { dueDate: "2027-01-01", dueAt: "2027-01-01T00:00:00Z", timezone: "UTC" }, { ownerId: w.bob.id },
    ]) expect(() => create(input)).toThrow();
    expect(create({ dueDate: "2027-01-01" }).dueDate).toBe("2027-01-01");
    expect(create({ dueAt: "2027-01-01T10:30:00+07:00", timezone: "Asia/Jakarta" }).dueAt).toBe("2027-01-01T03:30:00.000Z");
  });

  it("no longer accepts plannedDate; planned work is a linked event (v3)", () => {
    expect(() => create({ plannedDate: "2027-02-10" })).toThrow();
    const t = create({ dueDate: "2027-02-20" });
    expect(() => tasks.updateTask(w.db, w.alice.id, t.id, t.revision, { plannedDate: "2027-02-12", mutationId: crypto.randomUUID() })).toThrow();
  });

  it("completes/reopens without additional tasks, preserves history, and rejects stale edits", () => {
    const t = create();
    const count = tasks.listTasks(w.db, w.alice.id).length;
    const done = tasks.updateTask(w.db, w.alice.id, t.id, 1, { status: "Done", mutationId: crypto.randomUUID() });
    expect(done.completedAt).toBeTruthy();
    const reopened = tasks.updateTask(w.db, w.alice.id, t.id, 2, { status: "To do", mutationId: crypto.randomUUID() });
    expect(reopened.completedAt).toBeNull();
    const history = w.db.select().from(activity).where(eq(activity.entityId, t.id)).all();
    expect(history).toHaveLength(3);
    expect(tasks.listTasks(w.db, w.alice.id)).toHaveLength(count);
    expect(() => tasks.updateTask(w.db, w.alice.id, t.id, 2, { title: "Stale", mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    expect(tasks.getTask(w.db, w.alice.id, t.id)).toEqual(reopened);
  });

  it("moves and orders tasks, with atomic stale-membership checks and retry protection", () => {
    const p = project();
    const a = create();
    const b = create({ projectId: p.id, status: "Done" });
    const input = {
      id: a.id, projectId: p.id, status: "Done", orderedIds: [a.id, b.id],
      expectedRevisions: [{ id: a.id, revision: 1 }, { id: b.id, revision: 1 }], mutationId: crypto.randomUUID(),
    };
    const result = tasks.reorderTasks(w.db, w.alice.id, input);
    expect(result.map((t) => [t.id, t.projectId, t.position])).toEqual([[a.id, p.id, 0], [b.id, p.id, 1]]);
    expect(tasks.reorderTasks(w.db, w.alice.id, input)).toEqual(result);
    expect(() => tasks.reorderTasks(w.db, w.alice.id, { ...input, mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    expect(tasks.updateTask(w.db, w.alice.id, a.id, 2, { projectId: null, mutationId: crypto.randomUUID() }).projectId).toBeNull();
  });

  it("computes progress, requires project-completion warning, and hides archived work without changing tasks", () => {
    const p = project();
    expect(getProjectProgress(w.db, w.alice.id, p.id)).toEqual({ total: 0, done: 0, percent: 0 });
    const a = create({ projectId: p.id });
    const b = create({ projectId: p.id, status: "Done" });
    expect(getProjectProgress(w.db, w.alice.id, p.id)).toEqual({ total: 2, done: 1, percent: 50 });
    expect(() => updateProject(w.db, w.alice.id, p.id, 1, { status: "Done", mutationId: crypto.randomUUID() })).toThrow(/unfinished/i);
    const completed = updateProject(w.db, w.alice.id, p.id, 1, { status: "Done", completionPreview: previewProjectCompletion(w.db, w.alice.id, p.id), mutationId: crypto.randomUUID() });
    expect(tasks.getTask(w.db, w.alice.id, a.id).status).toBe("Done");
    archiveProject(w.db, w.alice.id, p.id, completed.revision, { archived: true, mutationId: crypto.randomUUID() });
    expect(tasks.listTasks(w.db, w.alice.id).some((t) => [a.id, b.id].includes(t.id))).toBe(false);
    expect(tasks.getTask(w.db, w.alice.id, b.id).status).toBe("Done");
    expect(getProjectProgress(w.db, w.alice.id, p.id)).toEqual({ total: 0, done: 0, percent: 0 });
  });

  it("includes children in deletion previews and invalidates changed membership", () => {
    const p = project();
    const old = previewDeletion(w.db, w.alice.id, "project", p.id);
    const t = create({ projectId: p.id });
    const independent = create();
    expect(() => confirmDeletion(w.db, w.alice.id, { ...old, mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    const current = previewDeletion(w.db, w.alice.id, "project", p.id);
    expect(current.records.some((r) => r.id === t.id)).toBe(true);
    confirmDeletion(w.db, w.alice.id, { ...current, mutationId: crypto.randomUUID() });
    expect(() => tasks.getTask(w.db, w.alice.id, t.id)).toThrow(/not found/i);
    expect(tasks.getTask(w.db, w.alice.id, independent.id)).toBeTruthy();
  });

  it("does not duplicate retry captures and rolls back if audit persistence fails", () => {
    const input = { title: "Once", mutationId: crypto.randomUUID() };
    const first = tasks.createTask(w.db, w.alice.id, input);
    expect(tasks.createTask(w.db, w.alice.id, input)).toEqual(first);
    w.db.$client.exec("CREATE TRIGGER fail_task_audit BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END");
    try { expect(() => create({ title: "Roll back task" })).toThrow(/injected/); }
    finally { w.db.$client.exec("DROP TRIGGER fail_task_audit"); }
    expect(tasks.listTasks(w.db, w.alice.id).some((t) => t.title === "Roll back task")).toBe(false);
  });
});
