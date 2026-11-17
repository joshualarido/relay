import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { testWorkspace } from "../support/auth";
import { openDatabase } from "../../src/lib/db";
import { activity, task, event, checkIn, dependency } from "../../src/lib/db/schema";
import { createProject, updateProject, archiveProject, getProject, reorderProjects } from "../../src/lib/projects";
import { createTask, updateTask, getTask, reorderTasks } from "../../src/lib/tasks";
import { createEvent, getEvent, rescheduleEvent, updateEvent } from "../../src/lib/events";
import { createCheckIn, listCheckIns } from "../../src/lib/check-ins";
import { addDependency, removeDependency, listDependencies } from "../../src/lib/dependencies";
import { listActivity } from "../../src/lib/activity";
import * as recovery from "../../src/lib/lifecycle";

describe("conflict-safe manual recovery", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeEach(async () => { w = await testWorkspace(); });
  afterEach(() => w.close());
  const mutation = () => ({ mutationId: crypto.randomUUID() });
  const project = () => createProject(w.db, w.alice.id, { name: "Recovery project", ...mutation() });
  const makeTask = (projectId: string | null = null) => createTask(w.db, w.alice.id, { title: "Recovery task", projectId, ...mutation() });
  const makeEvent = (taskId: string | null = null) => createEvent(w.db, w.alice.id, {
    title: "Recovery event", taskId, start: "2027-03-14T09:00:00Z", end: "2027-03-14T10:00:00Z", timezone: "America/Los_Angeles", ...mutation(),
  });
  const operation = (id: string) => listActivity(w.db, w.alice.id).find((a) => a.mutationId === id)!;
  const undo = (id: string, input = mutation()) => recovery.undoOperation(w.db, w.alice.id, id, input);
  const remove = (kind: "project" | "task" | "event", id: string) => recovery.confirmDeletion(w.db, w.alice.id, {
    ...recovery.previewDeletion(w.db, w.alice.id, kind, id), ...mutation(),
  }).operationId;

  it("undoes creates without permanent deletion and advances revisions", () => {
    const input = { title: "Created then undone", ...mutation() };
    const t = createTask(w.db, w.alice.id, input);
    undo(operation(input.mutationId).id);
    expect(() => getTask(w.db, w.alice.id, t.id)).toThrow(/not found/i);
    expect(w.db.select().from(task).where(eq(task.id, t.id)).get()).toMatchObject({ revision: 2, title: input.title });
    expect(w.db.select().from(task).where(eq(task.id, t.id)).get()!.deletedAt).not.toBeNull();
  });

  it("undoes project/event creation and restores an undone creation through its deletion history", () => {
    const input = { name: "Undo project creation", ...mutation() }, p = createProject(w.db, w.alice.id, input);
    const result = undo(operation(input.mutationId).id);
    expect(() => getProject(w.db, w.alice.id, p.id)).toThrow(/not found/i);
    recovery.restoreDeletion(w.db, w.alice.id, result.operationId, mutation());
    expect(getProject(w.db, w.alice.id, p.id)).toMatchObject({ name: input.name, revision: 3 });
    const e = makeEvent(), creation = listActivity(w.db, w.alice.id).find((a) => a.entityId === e.id)!;
    undo(creation.id);
    expect(() => getEvent(w.db, w.alice.id, e.id)).toThrow(/not found/i);
  });

  it("undoes edit, move, reorder, reschedule and archive without touching unrelated work", () => {
    const p = project(), q = project(), t = makeTask(p.id), other = makeTask();
    const edit = mutation();
    updateTask(w.db, w.alice.id, t.id, 1, { title: "Edited", status: "Done", projectId: q.id, ...edit });
    undo(operation(edit.mutationId).id);
    expect(getTask(w.db, w.alice.id, t.id)).toMatchObject({ title: t.title, projectId: p.id, completedAt: null, revision: 3 });
    expect(getTask(w.db, w.alice.id, other.id)).toEqual(other);
    const order = mutation();
    reorderTasks(w.db, w.alice.id, { id: t.id, projectId: q.id, status: "Doing", orderedIds: [t.id], expectedRevisions: [{ id: t.id, revision: 3 }], ...order });
    undo(operation(order.mutationId).id);
    expect(getTask(w.db, w.alice.id, t.id)).toMatchObject({ projectId: p.id, status: "To do", revision: 5 });
    const e = makeEvent(), move = mutation();
    rescheduleEvent(w.db, w.alice.id, e.id, 1, { start: "2027-03-15T09:00:00Z", ...move });
    undo(operation(move.mutationId).id);
    expect(getEvent(w.db, w.alice.id, e.id)).toMatchObject({ start: e.start, end: e.end, revision: 3 });
    const archive = mutation();
    archiveProject(w.db, w.alice.id, p.id, 1, { archived: true, ...archive });
    undo(operation(archive.mutationId).id);
    expect(getProject(w.db, w.alice.id, p.id)).toMatchObject({ archivedAt: null, revision: 3 });
    const reorder = mutation();
    reorderProjects(w.db, w.alice.id, { id: p.id, status: "Paused", orderedIds: [p.id], expectedRevisions: [{ id: p.id, revision: 3 }], ...reorder });
    undo(operation(reorder.mutationId).id);
    expect(getProject(w.db, w.alice.id, p.id)).toMatchObject({ status: "Planned", revision: 5 });
    const projectEdit = mutation();
    updateProject(w.db, w.alice.id, p.id, 5, { name: "Changed", deadline: "2027-01-01", ...projectEdit });
    undo(operation(projectEdit.mutationId).id);
    expect(getProject(w.db, w.alice.id, p.id)).toMatchObject({ name: p.name, deadline: null, revision: 7 });
    archiveProject(w.db, w.alice.id, p.id, 7, { archived: true, ...mutation() });
    const unarchive = mutation();
    archiveProject(w.db, w.alice.id, p.id, 8, { archived: false, ...unarchive });
    undo(operation(unarchive.mutationId).id);
    expect(getProject(w.db, w.alice.id, p.id).archivedAt).not.toBeNull();
    const eventEdit = mutation();
    updateEvent(w.db, w.alice.id, e.id, 3, { title: "Edited event", ...eventEdit });
    undo(operation(eventEdit.mutationId).id);
    expect(getEvent(w.db, w.alice.id, e.id)).toMatchObject({ title: e.title, revision: 5 });
  });

  it("rejects stale undo atomically, including revision ABA and foreign operations", () => {
    const p = project(), first = mutation(), second = mutation();
    updateProject(w.db, w.alice.id, p.id, 1, { name: "First edit", ...first });
    updateProject(w.db, w.alice.id, p.id, 2, { name: p.name, ...second });
    const before = listActivity(w.db, w.alice.id);
    expect(() => undo(operation(first.mutationId).id)).toThrow(/changed|conflict/i);
    expect(listActivity(w.db, w.alice.id)).toEqual(before);
    expect(getProject(w.db, w.alice.id, p.id).revision).toBe(3);
    expect(() => recovery.undoOperation(w.db, w.bob.id, operation(second.mutationId).id, mutation())).toThrow(/not found/i);
  });

  it("refuses create-undo when later children or reference edges exist, even independently deleted children", () => {
    const input = { name: "New parent", ...mutation() };
    const p = createProject(w.db, w.alice.id, input), t = makeTask(p.id);
    remove("task", t.id);
    expect(() => undo(operation(input.mutationId).id)).toThrow(/dependent|children|later/i);
    expect(getProject(w.db, w.alice.id, p.id)).toEqual(p);
    const a = { title: "Referenced task", ...mutation() }, prerequisite = createTask(w.db, w.alice.id, a), dependent = makeTask();
    addDependency(w.db, w.alice.id, { taskId: dependent.id, prerequisiteId: prerequisite.id, ...mutation() });
    expect(() => undo(operation(a.mutationId).id)).toThrow(/dependent|children|later/i);
  });

  it("restores only the selected cascade, preserving independent and independently deleted records", () => {
    const p = project(), t = makeTask(p.id), independent = makeTask(), e = makeEvent(t.id), unrelated = makeEvent();
    const older = makeEvent(t.id);
    remove("event", older.id);
    const c = createCheckIn(w.db, w.alice.id, { taskId: t.id, content: "Progress", ...mutation() });
    const d = addDependency(w.db, w.alice.id, { taskId: independent.id, prerequisiteId: t.id, ...mutation() });
    const id = remove("project", p.id);
    recovery.restoreDeletion(w.db, w.alice.id, id, mutation());
    expect(getProject(w.db, w.alice.id, p.id).revision).toBe(3);
    expect(getTask(w.db, w.alice.id, t.id).revision).toBe(3);
    expect(getTask(w.db, w.alice.id, independent.id)).toEqual(independent);
    expect(getEvent(w.db, w.alice.id, e.id).revision).toBe(3);
    expect(getEvent(w.db, w.alice.id, unrelated.id)).toEqual(unrelated);
    expect(() => getEvent(w.db, w.alice.id, older.id)).toThrow(/not found/i);
    expect(listCheckIns(w.db, w.alice.id, { taskId: t.id })[0]).toMatchObject({ id: c.id, revision: 3 });
    expect(listDependencies(w.db, w.alice.id)[0]).toMatchObject({ id: d.id, revision: 3 });
  });

  it("refuses restore when its parent is independently deleted or dependency restoration creates a cycle", () => {
    const t = makeTask(), e = makeEvent(t.id), id = remove("event", e.id);
    remove("task", t.id);
    expect(() => recovery.restoreDeletion(w.db, w.alice.id, id, mutation())).toThrow(/parent|available|deleted/i);
    expect(w.db.select().from(event).where(eq(event.id, e.id)).get()!.deletedAt).not.toBeNull();
    const a = makeTask(), b = makeTask();
    const edge = addDependency(w.db, w.alice.id, { taskId: a.id, prerequisiteId: b.id, ...mutation() }), input = mutation();
    removeDependency(w.db, w.alice.id, edge.id, 1, input);
    addDependency(w.db, w.alice.id, { taskId: b.id, prerequisiteId: a.id, ...mutation() });
    expect(() => undo(operation(input.mutationId).id)).toThrow(/cycle/i);
    expect(listDependencies(w.db, w.alice.id)).toHaveLength(1);
  });

  it("validates the full affected set before writes and rolls back undo when history fails", () => {
    const p = project(), t = makeTask(p.id), c = createCheckIn(w.db, w.alice.id, { taskId: t.id, content: "Keep", ...mutation() });
    const preview = recovery.previewDeletion(w.db, w.alice.id, "project", p.id);
    makeEvent(t.id);
    expect(() => recovery.confirmDeletion(w.db, w.alice.id, { ...preview, ...mutation() })).toThrow(/changed/i);
    const id = remove("project", p.id);
    w.db.$client.exec("CREATE TRIGGER fail_recovery BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT, 'injected recovery audit failure'); END");
    try { expect(() => undo(id)).toThrow(/injected/); }
    finally { w.db.$client.exec("DROP TRIGGER fail_recovery"); }
    expect(w.db.select().from(activity).where(eq(activity.id, id)).get()!.undoneAt).toBeNull();
    expect(w.db.select().from(checkIn).where(eq(checkIn.id, c.id)).get()!.deletedAt).not.toBeNull();
    expect(w.db.select().from(task).where(eq(task.id, t.id)).get()!.revision).toBe(2);
  });

  it("keeps idempotent recovery/history after a fresh connection and refuses repeated reversals", () => {
    const p = project(), id = remove("project", p.id), input = mutation();
    const result = undo(id, input);
    expect(undo(id, input)).toEqual(result);
    expect(() => undo(id)).toThrow(/already|undone/i);
    const reopened = openDatabase(w.path);
    try {
      expect(getProject(reopened, w.alice.id, p.id).revision).toBe(3);
      expect(listActivity(reopened, w.alice.id).filter((a) => a.mutationId === input.mutationId)).toHaveLength(1);
      expect(() => recovery.undoOperation(reopened, w.alice.id, result.operationId, mutation())).toThrow(/recovery|reverse|supported/i);
    } finally { reopened.$client.close(); }
  });

  it("undoes check-in and dependency creation", () => {
    const t = makeTask(), b = makeTask(), cInput = mutation(), dInput = mutation();
    createCheckIn(w.db, w.alice.id, { taskId: t.id, content: "Undo note", ...cInput });
    addDependency(w.db, w.alice.id, { taskId: t.id, prerequisiteId: b.id, ...dInput });
    undo(operation(cInput.mutationId).id); undo(operation(dInput.mutationId).id);
    expect(listCheckIns(w.db, w.alice.id, { taskId: t.id })).toEqual([]);
    expect(listDependencies(w.db, w.alice.id)).toEqual([]);
    expect(w.db.select().from(dependency).all()).toHaveLength(1);
  });

  it("refuses to restore a removed dependency when a newer matching reference exists", () => {
    const a = makeTask(), b = makeTask(), input = mutation();
    const edge = addDependency(w.db, w.alice.id, { taskId: a.id, prerequisiteId: b.id, ...mutation() });
    removeDependency(w.db, w.alice.id, edge.id, 1, input);
    const newer = addDependency(w.db, w.alice.id, { taskId: a.id, prerequisiteId: b.id, ...mutation() });
    expect(() => undo(operation(input.mutationId).id)).toThrow(/duplicate|matching/i);
    expect(listDependencies(w.db, w.alice.id)).toEqual([newer]);
  });

  it("rejects stale multi-record undo and restore without touching any sibling or history", () => {
    const p = project(), a = makeTask(p.id), b = makeTask(p.id), order = mutation();
    reorderTasks(w.db, w.alice.id, {
      id: b.id, projectId: p.id, status: "To do", orderedIds: [b.id, a.id],
      expectedRevisions: [{ id: a.id, revision: 1 }, { id: b.id, revision: 1 }], ...order,
    });
    updateTask(w.db, w.alice.id, a.id, 2, { title: "Later edit", ...mutation() });
    const before = getTask(w.db, w.alice.id, b.id), history = listActivity(w.db, w.alice.id);
    expect(() => undo(operation(order.mutationId).id)).toThrow(/changed|conflict/i);
    expect(getTask(w.db, w.alice.id, b.id)).toEqual(before);
    expect(listActivity(w.db, w.alice.id)).toEqual(history);
    const deletion = remove("project", p.id);
    w.db.update(task).set({ revision: 99 }).where(eq(task.id, a.id)).run();
    const afterDelete = listActivity(w.db, w.alice.id);
    expect(() => recovery.restoreDeletion(w.db, w.alice.id, deletion, mutation())).toThrow(/changed|conflict/i);
    expect(w.db.select().from(task).where(eq(task.id, b.id)).get()!.deletedAt).not.toBeNull();
    expect(() => getProject(w.db, w.alice.id, p.id)).toThrow(/not found/i);
    expect(listActivity(w.db, w.alice.id)).toEqual(afterDelete);
  });
});
