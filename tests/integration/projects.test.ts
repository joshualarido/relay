import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activity, project } from "../../src/lib/db/schema";
import { createProject, updateProject, archiveProject, getProject, listProjects, reorderProjects } from "../../src/lib/projects";
import { previewDeletion, confirmDeletion } from "../../src/lib/lifecycle";
import { testWorkspace } from "../support/auth";

describe("projects and transactional mutation/history", () => {
  let workspace: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { workspace = await testWorkspace(); });
  afterAll(() => workspace?.close());
  const create = (name = "Portfolio") => createProject(workspace.db, workspace.alice.id, { name, mutationId: crypto.randomUUID() });

  it("creates, edits, orders, changes status, and records before/after atomically", () => {
    const p = create();
    expect(p).toMatchObject({ name: "Portfolio", status: "Planned", revision: 1 });
    const updated = updateProject(workspace.db, workspace.alice.id, p.id, 1, {
      name: "Portfolio v2", status: "Active", position: 5, deadline: "2027-01-20", mutationId: crypto.randomUUID(),
    });
    expect(updated).toMatchObject({ name: "Portfolio v2", status: "Active", position: 5, deadline: "2027-01-20", revision: 2 });
    expect(getProject(workspace.db, workspace.alice.id, p.id)).toEqual(updated);
    const log = workspace.db.select().from(activity).where(eq(activity.entityId, p.id)).all();
    expect(log).toHaveLength(2);
    expect(log[1].beforeState[0]).toMatchObject({ entityType: "project", record: { name: "Portfolio" } });
    expect(log[1].afterState[0]).toMatchObject({ entityType: "project", record: { name: "Portfolio v2" } });
  });

  it("rejects empty names, invalid dates/statuses, and submitted ownership", () => {
    for (const invalid of [
      { name: "" }, { name: "  " }, { name: "X", deadline: "2027-02-30" },
      { name: "X", status: "Completed" }, { name: "X", ownerId: workspace.bob.id },
    ]) expect(() => createProject(workspace.db, workspace.alice.id, { ...invalid, mutationId: crypto.randomUUID() })).toThrow();
  });

  it("does not expose or mutate another owner's project", () => {
    const p = create("Private");
    expect(listProjects(workspace.db, workspace.bob.id)).toEqual([]);
    expect(() => getProject(workspace.db, workspace.bob.id, p.id)).toThrow(/not found/i);
    expect(() => updateProject(workspace.db, workspace.bob.id, p.id, 1, { name: "Stolen", mutationId: crypto.randomUUID() })).toThrow(/not found/i);
    expect(() => previewDeletion(workspace.db, workspace.bob.id, "project", p.id)).toThrow(/not found/i);
    expect(getProject(workspace.db, workspace.alice.id, p.id).name).toBe("Private");
  });

  it("stale edits change neither data nor history", () => {
    const p = create("Concurrent");
    updateProject(workspace.db, workspace.alice.id, p.id, 1, { description: "Newer work", mutationId: crypto.randomUUID() });
    const beforeCount = workspace.db.select().from(activity).all().length;
    expect(() => updateProject(workspace.db, workspace.alice.id, p.id, 1, { name: "Wrong", mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    expect(getProject(workspace.db, workspace.alice.id, p.id)).toMatchObject({ revision: 2, description: "Newer work" });
    expect(workspace.db.select().from(activity).all()).toHaveLength(beforeCount);
  });

  it("archive/unarchive hides active work and preserves status", () => {
    const p = create("Archived");
    const archived = archiveProject(workspace.db, workspace.alice.id, p.id, 1, { archived: true, mutationId: crypto.randomUUID() });
    expect(archived.archivedAt).toBeTruthy();
    expect(listProjects(workspace.db, workspace.alice.id).some((v) => v.id === p.id)).toBe(false);
    expect(listProjects(workspace.db, workspace.alice.id, true).some((v) => v.id === p.id)).toBe(true);
    const restored = archiveProject(workspace.db, workspace.alice.id, p.id, 2, { archived: false, mutationId: crypto.randomUUID() });
    expect(restored).toMatchObject({ status: "Planned", archivedAt: null, revision: 3 });
  });

  it("previews deletion and rejects a stale or forged confirmation before soft deleting", () => {
    const p = create("Delete safely");
    const preview = previewDeletion(workspace.db, workspace.alice.id, "project", p.id);
    expect(preview.records).toEqual([{ entityType: "project", id: p.id, revision: 1, label: p.name }]);
    updateProject(workspace.db, workspace.alice.id, p.id, 1, { description: "Newer work", mutationId: crypto.randomUUID() });
    expect(() => confirmDeletion(workspace.db, workspace.alice.id, { ...preview, mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    expect(() => confirmDeletion(workspace.db, workspace.alice.id, { ...preview, records: [], mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    const current = previewDeletion(workspace.db, workspace.alice.id, "project", p.id);
    const operation = confirmDeletion(workspace.db, workspace.alice.id, { ...current, mutationId: crypto.randomUUID() });
    expect(operation).toHaveProperty("operationId");
    expect(() => getProject(workspace.db, workspace.alice.id, p.id)).toThrow(/not found/i);
    const stored = workspace.db.select().from(project).where(eq(project.id, p.id)).get();
    expect(stored?.deletedAt).toBeTruthy();
    expect(stored?.deletionOperationId).toBe(operation.operationId);
  });

  it("retries a mutation exactly once and refuses reusing its identity for other input", () => {
    const input = { name: "Exactly once", mutationId: crypto.randomUUID() };
    const first = createProject(workspace.db, workspace.alice.id, input);
    expect(createProject(workspace.db, workspace.alice.id, input)).toEqual(first);
    expect(listProjects(workspace.db, workspace.alice.id).filter((p) => p.name === input.name)).toHaveLength(1);
    expect(() => createProject(workspace.db, workspace.alice.id, { ...input, name: "Changed payload" })).toThrow(/reused/i);
  });

  it("reorders a full status column atomically and rejects stale membership", () => {
    const first = create("Order first");
    const second = create("Order second");
    const input = {
      id: first.id, status: "Paused", orderedIds: [first.id],
      expectedRevisions: [{ id: first.id, revision: first.revision }], mutationId: crypto.randomUUID(),
    };
    const [moved] = reorderProjects(workspace.db, workspace.alice.id, input);
    expect(moved).toMatchObject({ status: "Paused", position: 0, revision: 2 });
    expect(reorderProjects(workspace.db, workspace.alice.id, input)).toEqual([moved]);
    expect(() => reorderProjects(workspace.db, workspace.alice.id, {
      id: second.id, status: "Paused", orderedIds: [second.id],
      expectedRevisions: [{ id: second.id, revision: 1 }], mutationId: crypto.randomUUID(),
    })).toThrow(/changed/i);
    const ordered = reorderProjects(workspace.db, workspace.alice.id, {
      id: second.id, status: "Paused", orderedIds: [second.id, first.id],
      expectedRevisions: [{ id: first.id, revision: 2 }, { id: second.id, revision: 1 }], mutationId: crypto.randomUUID(),
    });
    expect(ordered.map((p) => [p.id, p.position])).toEqual([[second.id, 0], [first.id, 1]]);
  });

  it("rolls back a project if audit persistence fails", () => {
    workspace.db.$client.exec("CREATE TRIGGER fail_activity BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END");
    try { expect(() => create("Must roll back")).toThrow(/injected/); }
    finally { workspace.db.$client.exec("DROP TRIGGER fail_activity"); }
    expect(listProjects(workspace.db, workspace.alice.id).some((p) => p.name === "Must roll back")).toBe(false);
  });
});
