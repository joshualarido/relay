import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import journal from "../../drizzle/meta/_journal.json";
import { activity } from "../../src/lib/db/schema";
import { createTask, getTask, updateTask } from "../../src/lib/tasks";
import { requestHash } from "../../src/lib/activity";
import { confirmDeletion, previewDeletion, restoreDeletion, undoOperation } from "../../src/lib/lifecycle";
import { testWorkspace } from "../support/auth";

let w: Awaited<ReturnType<typeof testWorkspace>>;
beforeAll(async () => { w = await testWorkspace(); });
afterAll(() => w?.close());

it("upgrades populated legacy rows/history/replay results without losing priorities or bypassing later classification", () => {
  // v3: priority is dormant and no longer accepted as input; seed legacy priorities directly on the rows.
  const input = { title: "Legacy High task", mutationId: crypto.randomUUID() };
  const t = createTask(w.db, w.alice.id, input);
  w.db.$client.prepare("UPDATE task SET priority = 'High' WHERE id = ?").run(t.id);
  const edited = updateTask(w.db, w.alice.id, t.id, 1, { title: "Legacy edit", mutationId: crypto.randomUUID() });
  const deleted = createTask(w.db, w.alice.id, { title: "Legacy deleted", mutationId: crypto.randomUUID() });
  w.db.$client.prepare("UPDATE task SET priority = 'Low' WHERE id = ?").run(deleted.id);
  const deletion = confirmDeletion(w.db, w.alice.id, { ...previewDeletion(w.db, w.alice.id, "task", deleted.id), mutationId: crypto.randomUUID() });
  const logs = w.db.select().from(activity).where(eq(activity.entityId, t.id)).all();
  const legacy = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(legacy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !["important", "urgent"].includes(key)).map(([key, v]) => [key, legacy(v)]));
    return value;
  };
  for (const log of w.db.select().from(activity).all()) w.db.$client.prepare("UPDATE activity SET before_state=?, after_state=?, result=? WHERE id=?")
    .run(JSON.stringify(legacy(log.beforeState)), JSON.stringify(legacy(log.afterState)), JSON.stringify(legacy(log.result)), log.id);
  // Pre-1.2 createSchema output (no important/urgent/plannedDate); status defaulted to "Backlog".
  const oldCreate = { title: t.title, description: t.description, projectId: t.projectId, status: "Backlog", priority: t.priority,
    dueDate: t.dueDate, dueAt: t.dueAt, timezone: t.timezone, estimateMinutes: t.estimateMinutes, blockerReason: t.blockerReason, position: t.position };
  w.db.$client.prepare("UPDATE activity SET request_hash=? WHERE id=?").run(requestHash("task-create", null, oldCreate), logs[0].id);
  // Recreate the exact pre-1.2/pre-1.3 schema boundary before applying upgrades.
  const phase12When = journal.entries.find((e) => e.tag === "0005_phase12_priorities")!.when;
  w.db.$client.exec(`ALTER TABLE task DROP COLUMN planned_date; ALTER TABLE task DROP COLUMN important; ALTER TABLE task DROP COLUMN urgent; DELETE FROM __drizzle_migrations WHERE created_at >= ${phase12When}`);
  migrate(w.db, { migrationsFolder: "./drizzle" });
  expect(w.db.$client.pragma("integrity_check", { simple: true })).toBe("ok");
  expect(w.db.$client.pragma("foreign_key_check")).toEqual([]);
  expect(getTask(w.db, w.alice.id, t.id)).toMatchObject({ priority: "High", important: null, urgent: null, title: "Legacy edit" });
  restoreDeletion(w.db, w.alice.id, deletion.operationId, { mutationId: crypto.randomUUID() });
  expect(getTask(w.db, w.alice.id, deleted.id)).toMatchObject({ title: "Legacy deleted", priority: "Low", important: null, urgent: null });
  expect(createTask(w.db, w.alice.id, input)).toMatchObject({ id: t.id, title: "Legacy High task", important: null, urgent: null });
  expect(() => createTask(w.db, w.alice.id, { ...input, important: true })).toThrow(/reused/i);
  undoOperation(w.db, w.alice.id, logs[1].id, { mutationId: crypto.randomUUID() });
  const recovered = getTask(w.db, w.alice.id, t.id);
  expect(recovered).toMatchObject({ title: "Legacy High task", important: null, urgent: null, revision: edited.revision + 1 });
  updateTask(w.db, w.alice.id, t.id, recovered.revision, { important: false, mutationId: crypto.randomUUID() });
  expect(() => undoOperation(w.db, w.alice.id, logs[0].id, { mutationId: crypto.randomUUID() })).toThrow(/changed/i);
  expect(getTask(w.db, w.alice.id, t.id)).toMatchObject({ important: false });
});
