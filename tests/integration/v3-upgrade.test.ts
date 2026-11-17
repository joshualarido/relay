import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import journal from "../../drizzle/meta/_journal.json";
import { z } from "zod";
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

it("moves live planned dates to linked all-day events without duplicates and keeps pre-v3 Undo working", () => {
  const m = () => crypto.randomUUID();
  const sql = w.db.$client;
  const live = createTask(w.db, w.alice.id, { title: "Planned live", mutationId: m() });
  const gone = createTask(w.db, w.alice.id, { title: "Planned deleted", mutationId: m() });
  const linked = createTask(w.db, w.alice.id, { title: "Planned linked", mutationId: m() });
  const bobs = createTask(w.db, w.bob.id, { title: "Bob planned", mutationId: m() });
  const undo = createTask(w.db, w.alice.id, { title: "Planned undo", mutationId: m() });
  updateTask(w.db, w.alice.id, undo.id, 1, { title: "Planned undo edited", mutationId: m() });
  const op = w.db.select().from(activity).where(eq(activity.entityId, undo.id)).all().find((a) => a.beforeState.length === 1)!;
  const events0 = (taskId: string) => sql.prepare("SELECT * FROM event WHERE task_id=? AND deleted_at IS NULL").all(taskId) as Record<string, unknown>[];
  sql.prepare("INSERT INTO event (id, owner_id, task_id, title, start, end, all_day, timezone, created_at, updated_at) VALUES (?,?,?,?,?,?,1,'UTC',?,?)")
    .run(m(), w.alice.id, linked.id, "Existing", "2026-11-21", "2026-11-22", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  // Roll back to the 0007 boundary and write pre-v3 planned dates with raw SQL.
  const when = journal.entries.find((e) => e.tag === "0008_v3_planned_to_events")!.when;
  sql.prepare("DELETE FROM __drizzle_migrations WHERE created_at >= ?").run(when);
  const plan = sql.prepare("UPDATE task SET planned_date=? WHERE id=?");
  plan.run("2026-11-20", live.id); plan.run("2026-11-19", gone.id); plan.run("2026-11-21", linked.id); plan.run("2026-11-22", bobs.id); plan.run("2026-11-23", undo.id);
  sql.prepare("UPDATE task SET deleted_at=? WHERE id=?").run("2026-11-01T00:00:00.000Z", gone.id);
  sql.prepare("INSERT INTO preferences (user_id, timezone) VALUES (?, 'Europe/Paris') ON CONFLICT(user_id) DO UPDATE SET timezone=excluded.timezone").run(w.alice.id);
  sql.prepare("DELETE FROM preferences WHERE user_id=?").run(w.bob.id);
  const withPlanned = (json: string) => JSON.stringify(JSON.parse(json).map((s: { record: object }) => ({ ...s, record: { ...s.record, plannedDate: "2026-11-23" } })));
  const raw = sql.prepare("SELECT before_state b, after_state a FROM activity WHERE id=?").get(op.id) as { b: string; a: string };
  sql.prepare("UPDATE activity SET before_state=?, after_state=? WHERE id=?").run(withPlanned(raw.b), withPlanned(raw.a), op.id);
  const beforeRow = sql.prepare("SELECT revision, updated_at FROM task WHERE id=?").get(live.id);

  migrate(w.db, { migrationsFolder: "./drizzle" });

  const [e] = events0(live.id);
  expect(events0(live.id)).toHaveLength(1);
  expect(e).toMatchObject({ all_day: 1, start: "2026-11-20", end: "2026-11-21", task_id: live.id, project_id: null, owner_id: w.alice.id,
    title: "Planned live", timezone: "Europe/Paris", description: "", location: "", revision: 1, deleted_at: null });
  expect(z.uuid().safeParse(e.id).success).toBe(true);
  expect(sql.prepare("SELECT count(*) n FROM event WHERE task_id=?").get(gone.id)).toEqual({ n: 0 });
  expect(events0(linked.id)).toHaveLength(1);
  expect(events0(bobs.id)[0]).toMatchObject({ start: "2026-11-22", timezone: "Asia/Jakarta" });
  expect(sql.prepare("SELECT count(*) n FROM task WHERE planned_date IS NOT NULL").get()).toEqual({ n: 0 });
  expect(sql.prepare("SELECT revision, updated_at FROM task WHERE id=?").get(live.id)).toEqual(beforeRow);
  expect(sql.pragma("foreign_key_check")).toEqual([]);
  // Re-running the data migration is a no-op.
  sql.prepare("DELETE FROM __drizzle_migrations WHERE created_at >= ?").run(when);
  migrate(w.db, { migrationsFolder: "./drizzle" });
  expect(events0(live.id)).toHaveLength(1);
  undoOperation(w.db, w.alice.id, op.id, { mutationId: m() });
  expect(getTask(w.db, w.alice.id, undo.id)).toMatchObject({ title: "Planned undo", plannedDate: null });
});
