import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testWorkspace } from "../support/auth";
import { activity } from "../../src/lib/db/schema";
import { createProject, listProjects, reorderProjects } from "../../src/lib/projects";
import { createTask, listTasks, reorderTasks } from "../../src/lib/tasks";
import { undoOperation } from "../../src/lib/lifecycle";
import { planProjectMove, planTaskMove, summarize, tasksByProject } from "../../src/lib/project-board";

// The board's move plans must be exactly what the reorder services accept, and what they persist.
describe("projects split view: plans against the reorder services", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const m = () => ({ mutationId: crypto.randomUUID() });
  const order = (projectId: string | null, status: string) =>
    (tasksByProject(listTasks(w.db, w.alice.id, true)).get(projectId ?? "none") ?? []).filter((t) => t.status === status).map((t) => t.title);

  it("persists status changes and order within and across columns", () => {
    const p = createProject(w.db, w.alice.id, { name: "Launch", ...m() });
    for (const [i, title] of ["one", "two", "three", "four", "five"].entries()) createTask(w.db, w.alice.id, { title, projectId: p.id, position: i, ...m() });
    const id = (title: string) => listTasks(w.db, w.alice.id).find((t) => t.title === title)!.id;
    const move = (title: string, status: "To do" | "Done", index?: number) => {
      const plan = planTaskMove(listTasks(w.db, w.alice.id, true), id(title), { projectId: p.id, status, index })!;
      const saved = reorderTasks(w.db, w.alice.id, { id: id(title), projectId: p.id, status, orderedIds: plan.orderedIds, expectedRevisions: plan.expectedRevisions, ...m() });
      expect(saved.map((t) => t.id)).toEqual(plan.orderedIds);
    };
    move("two", "Done");
    move("four", "Done", 0);
    move("five", "To do", 0);
    move("one", "Done");
    expect(order(p.id, "To do")).toEqual(["five", "three"]);
    expect(order(p.id, "Done")).toEqual(["four", "two", "one"]);
    const done = listTasks(w.db, w.alice.id).find((t) => t.title === "one")!;
    expect(done.completedAt).not.toBeNull();
    expect(summarize(p, listTasks(w.db, w.alice.id).filter((t) => t.projectId === p.id))).toMatchObject({ done: 3, total: 5 });
  });

  it("moves a task to another project and to No project, and Undo puts it back", () => {
    const a = createProject(w.db, w.alice.id, { name: "From", ...m() });
    const b = createProject(w.db, w.alice.id, { name: "To", ...m() });
    const moving = createTask(w.db, w.alice.id, { title: "Mover", projectId: a.id, status: "To do", ...m() });
    createTask(w.db, w.alice.id, { title: "Resident", projectId: b.id, status: "To do", ...m() });
    const plan = planTaskMove(listTasks(w.db, w.alice.id, true), moving.id, { projectId: b.id, status: "To do" })!;
    const input = { id: moving.id, projectId: b.id, status: "To do", orderedIds: plan.orderedIds, expectedRevisions: plan.expectedRevisions, ...m() };
    reorderTasks(w.db, w.alice.id, input);
    expect(order(b.id, "To do")).toEqual(["Resident", "Mover"]);
    expect(order(a.id, "To do")).toEqual([]);
    const op = w.db.select().from(activity).where(eq(activity.mutationId, input.mutationId)).get()!;
    undoOperation(w.db, w.alice.id, op.id, m());
    expect(order(a.id, "To do")).toEqual(["Mover"]);
    expect(order(b.id, "To do")).toEqual(["Resident"]);

    const loose = planTaskMove(listTasks(w.db, w.alice.id, true), moving.id, { projectId: null, status: "To do" })!;
    reorderTasks(w.db, w.alice.id, { id: moving.id, projectId: null, status: "To do", orderedIds: loose.orderedIds, expectedRevisions: loose.expectedRevisions, ...m() });
    expect(order(null, "To do")).toContain("Mover");
  });

  it("drags a project from Planned to Active and keeps its place", () => {
    const first = createProject(w.db, w.alice.id, { name: "Alpha", status: "Active", ...m() });
    const planned = createProject(w.db, w.alice.id, { name: "Beta", ...m() });
    const plan = planProjectMove(listProjects(w.db, w.alice.id), planned.id, { status: "Active", index: 0 })!;
    reorderProjects(w.db, w.alice.id, { id: planned.id, status: "Active", orderedIds: plan.orderedIds, expectedRevisions: plan.expectedRevisions, ...m() });
    const active = listProjects(w.db, w.alice.id).filter((p) => p.status === "Active").map((p) => p.id);
    expect(active.slice(0, 2)).toEqual([planned.id, first.id]);
  });

  it("rejects a stale plan instead of overwriting newer order", () => {
    const p = createProject(w.db, w.alice.id, { name: "Stale", ...m() });
    const a = createTask(w.db, w.alice.id, { title: "A", projectId: p.id, ...m() });
    const stale = planTaskMove(listTasks(w.db, w.alice.id, true), a.id, { projectId: p.id, status: "Done" })!;
    const fresh = planTaskMove(listTasks(w.db, w.alice.id, true), a.id, { projectId: p.id, status: "Done" })!;
    reorderTasks(w.db, w.alice.id, { id: a.id, projectId: p.id, status: "Done", orderedIds: fresh.orderedIds, expectedRevisions: fresh.expectedRevisions, ...m() });
    expect(() => reorderTasks(w.db, w.alice.id, { id: a.id, projectId: p.id, status: "Done", orderedIds: stale.orderedIds, expectedRevisions: stale.expectedRevisions, ...m() }))
      .toThrow(/changed/);
  });
});
