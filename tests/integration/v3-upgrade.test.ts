import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import journal from "../../drizzle/meta/_journal.json";
import { activity } from "../../src/lib/db/schema";
import { createTask, getTask, updateTask } from "../../src/lib/tasks";
import { createProject, getProject } from "../../src/lib/projects";
import { undoOperation } from "../../src/lib/lifecycle";
import { testWorkspace } from "../support/auth";

let w: Awaited<ReturnType<typeof testWorkspace>>;
beforeAll(async () => { w = await testWorkspace(); });
afterAll(() => w?.close());

it("maps legacy statuses and undoes pre-v3 operations with legacy snapshots", () => {
  const m = () => crypto.randomUUID();
  const legacy = { Backlog: "To do", Next: "To do", "In Progress": "Doing", Blocked: "Doing", Done: "Done" } as const;
  const tasks = Object.keys(legacy).map((s) => createTask(w.db, w.alice.id, { title: `Legacy ${s}`, mutationId: m() }));
  const p = createProject(w.db, w.alice.id, { name: "Legacy project", mutationId: m() });
  const edited = createTask(w.db, w.alice.id, { title: "Undo me", mutationId: m() });
  const update = updateTask(w.db, w.alice.id, edited.id, 1, { title: "Undo me edited", mutationId: m() });
  const op = w.db.select().from(activity).where(eq(activity.entityId, edited.id)).all().find((a) => a.beforeState.length === 1)!;
  expect(update.title).toBe("Undo me edited");
  // Roll back to the 0006 boundary and write legacy values with raw SQL.
  const v3When = journal.entries.find((e) => e.tag === "0007_v3_statuses")!.when;
  const sql = w.db.$client;
  sql.prepare("DELETE FROM __drizzle_migrations WHERE created_at >= ?").run(v3When);
  Object.keys(legacy).forEach((s, i) => sql.prepare("UPDATE task SET status=? WHERE id=?").run(s, tasks[i].id));
  sql.prepare("UPDATE project SET status='Completed' WHERE id=?").run(p.id);
  sql.prepare("UPDATE task SET status='In Progress' WHERE id=?").run(edited.id);
  const withStatus = (json: string) => JSON.stringify(JSON.parse(json).map((s: { record: object }) => ({ ...s, record: { ...s.record, status: "In Progress" } })));
  const raw = sql.prepare("SELECT before_state b, after_state a FROM activity WHERE id=?").get(op.id) as { b: string; a: string };
  sql.prepare("UPDATE activity SET before_state=?, after_state=? WHERE id=?").run(withStatus(raw.b), withStatus(raw.a), op.id);

  migrate(w.db, { migrationsFolder: "./drizzle" });

  Object.values(legacy).forEach((to, i) => expect(getTask(w.db, w.alice.id, tasks[i].id).status).toBe(to));
  expect(getProject(w.db, w.alice.id, p.id).status).toBe("Done");
  expect(sql.pragma("integrity_check", { simple: true })).toBe("ok");
  expect(sql.pragma("foreign_key_check")).toEqual([]);
  expect(getTask(w.db, w.alice.id, edited.id)).toMatchObject({ status: "Doing", title: "Undo me edited" });
  undoOperation(w.db, w.alice.id, op.id, { mutationId: m() });
  expect(getTask(w.db, w.alice.id, edited.id)).toMatchObject({ status: "Doing", title: "Undo me" });
  expect(createTask(w.db, w.alice.id, { title: "Fresh", mutationId: m() }).status).toBe("To do");
});
