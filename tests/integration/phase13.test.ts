import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import journal from "../../drizzle/meta/_journal.json";
import { activity } from "../../src/lib/db/schema";
import { createTask, getTask, updateTask } from "../../src/lib/tasks";
import { confirmDeletion, previewDeletion, restoreDeletion, undoOperation } from "../../src/lib/lifecycle";
import { homeData, searchWorkspace } from "../../src/lib/workbench";
import { createEvent } from "../../src/lib/events";
import { testWorkspace } from "../support/auth";


describe("phase 1.3 planned dates", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const task = (input = {}) => createTask(w.db, w.alice.id, { title: "Planned work", ...input, mutationId: crypto.randomUUID() });
  // v3: planned work is a linked all-day event.
  const plan = (taskId: string, date: string, end: string) => createEvent(w.db, w.alice.id, { title: "Plan", taskId, start: date, end, allDay: true, timezone: "UTC", mutationId: crypto.randomUUID() });

  it("fresh migration has a nullable planned_date column on task", () => {
    const column = (w.db.$client.pragma("table_info(task)") as { name: string; notnull: number }[]).find((c) => c.name === "planned_date");
    expect(column).toBeDefined();
    expect(column!.notnull).toBe(0);
  });

  it("derives Today and overdue from the owner's local day, not the UTC date", () => {
    // 2027-03-15T11:30Z is 2027-03-16 00:30 in Pacific/Auckland (NZDT, UTC+13).
    const now = "2027-03-15T11:30:00Z", zone = "Pacific/Auckland";
    const local = task({ title: "Local today" }), utc = task({ title: "UTC today only" });
    plan(local.id, "2027-03-16", "2027-03-17"); plan(utc.id, "2027-03-15", "2027-03-16");
    const late = task({ title: "Late locally", dueDate: "2027-03-15" });
    const home = homeData(w.db, w.alice.id, zone, now);
    const ids = home.todayTasks.map((t) => t.id);
    expect(ids).toContain(local.id);
    expect(home.plannedToday.map((t) => t.id)).toContain(local.id);
    expect(ids).not.toContain(utc.id);
    expect(home.overdue.map((t) => t.id)).toContain(late.id);
    expect(homeData(w.db, w.alice.id, "UTC", now).overdue.map((t) => t.id)).not.toContain(late.id);
  });

  it("search returns a planned-only task with its planned date labeled as planned", () => {
    const title = `Planned search ${crypto.randomUUID()}`;
    const planned = task({ title }), deadline = task({ title: `${title} deadline`, dueDate: "2027-05-09" });
    plan(planned.id, "2027-05-02", "2027-05-03"); plan(deadline.id, "2027-05-02", "2027-05-03");
    const items = searchWorkspace(w.db, w.alice.id, { q: title, date: "2027-05-02" }).items;
    expect(items.find((i) => i.id === planned.id)).toMatchObject({ date: "2027-05-02", dateKind: "planned" });
    expect(items.find((i) => i.id === deadline.id)).toMatchObject({ date: "2027-05-09", dateKind: "deadline" });
    expect(searchWorkspace(w.db, w.bob.id, { q: title }).items).toEqual([]);
  });
});

describe("phase 1.3 upgrade", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());

  it("legacy history without plannedDate recovers through the lifecycle service without touching plannedDate", () => {
    const t = createTask(w.db, w.alice.id, { title: "Legacy task", mutationId: crypto.randomUUID() });
    const edited = updateTask(w.db, w.alice.id, t.id, t.revision, { title: "Legacy edit", mutationId: crypto.randomUUID() });
    const other = createTask(w.db, w.alice.id, { title: "Legacy untouched", mutationId: crypto.randomUUID() });
    const removed = createTask(w.db, w.alice.id, { title: "Legacy deleted", mutationId: crypto.randomUUID() });
    const { operationId: deletion } = confirmDeletion(w.db, w.alice.id, { ...previewDeletion(w.db, w.alice.id, "task", removed.id), mutationId: crypto.randomUUID() });
    const strip = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(strip);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "plannedDate").map(([k, v]) => [k, strip(v)]));
      return value;
    };
    for (const log of w.db.select().from(activity).all()) w.db.$client.prepare("UPDATE activity SET before_state=?, after_state=?, result=? WHERE id=?")
      .run(JSON.stringify(strip(log.beforeState)), JSON.stringify(strip(log.afterState)), JSON.stringify(strip(log.result)), log.id);
    expect(JSON.stringify(w.db.select().from(activity).all())).not.toContain("plannedDate");
    // Recreate the pre-1.3 schema boundary (0006 adds planned_date), then apply the upgrade.
    const phase13When = journal.entries.find((e) => e.tag === "0006_fearless_edwin_jarvis")!.when;
    w.db.$client.exec(`ALTER TABLE task DROP COLUMN planned_date; DELETE FROM __drizzle_migrations WHERE created_at >= ${phase13When}`);
    migrate(w.db, { migrationsFolder: "./drizzle" });
    expect(w.db.$client.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(w.db.$client.pragma("foreign_key_check")).toEqual([]);
    expect(getTask(w.db, w.alice.id, t.id).plannedDate).toBeNull();
    expect(getTask(w.db, w.alice.id, other.id).plannedDate).toBeNull();
    // v3: plannedDate is dormant (0008 nulls it); legacy snapshots lacking the key still recover.
    const editLog = w.db.select().from(activity).where(eq(activity.entityId, t.id)).all().at(-1)!;
    undoOperation(w.db, w.alice.id, editLog.id, { mutationId: crypto.randomUUID() });
    expect(getTask(w.db, w.alice.id, t.id)).toMatchObject({ title: "Legacy task", plannedDate: null, revision: edited.revision + 1 });
    restoreDeletion(w.db, w.alice.id, deletion, { mutationId: crypto.randomUUID() });
    expect(getTask(w.db, w.alice.id, removed.id)).toMatchObject({ title: "Legacy deleted", plannedDate: null, deletedAt: null });
  });
});
