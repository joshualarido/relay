import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { and, eq } from "drizzle-orm";
import { activity } from "../../src/lib/db/schema";
import { createProject } from "../../src/lib/projects";
import { createTask, getTask, updateTask } from "../../src/lib/tasks";
import { undoOperation } from "../../src/lib/lifecycle";
import { homeData, searchWorkspace } from "../../src/lib/workbench";
import { testWorkspace } from "../support/auth";

const unchangedFields = ["status", "projectId", "completedAt", "dueDate", "dueAt", "important", "urgent", "priority"] as const;
const pick = (t: Record<string, unknown>) => Object.fromEntries(unchangedFields.map((k) => [k, t[k]]));

describe("phase 1.3 planned dates", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const task = (input = {}) => createTask(w.db, w.alice.id, { title: "Planned work", ...input, mutationId: crypto.randomUUID() });
  const lastLog = (entityId: string) => w.db.select().from(activity)
    .where(and(eq(activity.entityId, entityId), eq(activity.ownerId, w.alice.id))).all().at(-1)!;

  it("fresh migration has a nullable planned_date column on task", () => {
    const column = (w.db.$client.pragma("table_info(task)") as { name: string; notnull: number }[]).find((c) => c.name === "planned_date");
    expect(column).toBeDefined();
    expect(column!.notnull).toBe(0);
  });

  it("planned edits leave status, project, completion, deadlines and priority unchanged", () => {
    const p = createProject(w.db, w.alice.id, { name: "Planned project", status: "Active", mutationId: crypto.randomUUID() });
    const t = task({ projectId: p.id, status: "In Progress", dueAt: "2027-03-20T09:00:00Z", timezone: "UTC", important: true, urgent: false });
    const saved = updateTask(w.db, w.alice.id, t.id, t.revision, { plannedDate: "2027-03-16", mutationId: crypto.randomUUID() });
    expect(saved.plannedDate).toBe("2027-03-16");
    expect(pick(saved)).toEqual(pick(t));
    const done = task({ status: "Done", dueDate: "2027-03-18" });
    const moved = updateTask(w.db, w.alice.id, done.id, done.revision, { plannedDate: "2027-03-17", mutationId: crypto.randomUUID() });
    expect(pick(moved)).toEqual(pick(done));
    expect(moved.completedAt).not.toBeNull();
  });

  it("Undo of a planned-date edit restores the previous plannedDate only", () => {
    const t = task({ plannedDate: "2027-03-10", dueDate: "2027-03-30", important: false, urgent: true });
    const saved = updateTask(w.db, w.alice.id, t.id, t.revision, { plannedDate: "2027-03-12", mutationId: crypto.randomUUID() });
    undoOperation(w.db, w.alice.id, lastLog(t.id).id, { mutationId: crypto.randomUUID() });
    const restored = getTask(w.db, w.alice.id, t.id);
    expect(restored.plannedDate).toBe("2027-03-10");
    expect(pick(restored)).toEqual(pick(saved));
  });

  it("another owner cannot change a planned date", () => {
    const t = task({ plannedDate: "2027-03-10" });
    expect(() => updateTask(w.db, w.bob.id, t.id, t.revision, { plannedDate: "2027-04-01", mutationId: crypto.randomUUID() })).toThrow(/not found/i);
    expect(getTask(w.db, w.alice.id, t.id).plannedDate).toBe("2027-03-10");
  });

  it("derives Today and overdue from the owner's local day, not the UTC date", () => {
    // 2027-03-15T11:30Z is 2027-03-16 00:30 in Pacific/Auckland (NZDT, UTC+13).
    const now = "2027-03-15T11:30:00Z", zone = "Pacific/Auckland";
    const local = task({ title: "Local today", plannedDate: "2027-03-16" });
    const utc = task({ title: "UTC today only", plannedDate: "2027-03-15" });
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
    const planned = task({ title, plannedDate: "2027-05-02" });
    const deadline = task({ title: `${title} deadline`, plannedDate: "2027-05-02", dueDate: "2027-05-09" });
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
    const strip = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(strip);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "plannedDate").map(([k, v]) => [k, strip(v)]));
      return value;
    };
    for (const log of w.db.select().from(activity).all()) w.db.$client.prepare("UPDATE activity SET before_state=?, after_state=?, result=? WHERE id=?")
      .run(JSON.stringify(strip(log.beforeState)), JSON.stringify(strip(log.afterState)), JSON.stringify(strip(log.result)), log.id);
    expect(JSON.stringify(w.db.select().from(activity).all())).not.toContain("plannedDate");
    // Recreate the pre-1.3 schema boundary (0006 adds planned_date), then apply the upgrade.
    w.db.$client.exec("ALTER TABLE task DROP COLUMN planned_date; DELETE FROM __drizzle_migrations WHERE created_at=(SELECT MAX(created_at) FROM __drizzle_migrations)");
    migrate(w.db, { migrationsFolder: "./drizzle" });
    expect(w.db.$client.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(w.db.$client.pragma("foreign_key_check")).toEqual([]);
    expect(getTask(w.db, w.alice.id, t.id).plannedDate).toBeNull();
    expect(getTask(w.db, w.alice.id, other.id).plannedDate).toBeNull();
    // A planned date on the live row must survive recovery from a legacy snapshot that lacks the key.
    w.db.$client.prepare("UPDATE task SET planned_date=? WHERE id=?").run("2027-06-01", t.id);
    const editLog = w.db.select().from(activity).where(eq(activity.entityId, t.id)).all().at(-1)!;
    undoOperation(w.db, w.alice.id, editLog.id, { mutationId: crypto.randomUUID() });
    expect(getTask(w.db, w.alice.id, t.id)).toMatchObject({ title: "Legacy task", plannedDate: "2027-06-01", revision: edited.revision + 1 });
  });
});
