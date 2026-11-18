import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/lib/projects";
import { createTask, updateTask } from "../../src/lib/tasks";
import { createEvent } from "../../src/lib/events";
import { confirmDeletion, previewDeletion } from "../../src/lib/lifecycle";
import { summarySentence, todayTimeline } from "../../src/lib/today";
import { testWorkspace } from "../support/auth";

// Owner zone Asia/Jakarta (UTC+7, no DST). now = 01:30 on 2027-01-02 local, still 2027-01-01 in UTC.
const TZ = "Asia/Jakarta", NOW = "2027-01-01T18:30:00Z";

describe("todayTimeline", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeEach(async () => { w = await testWorkspace(); });
  afterEach(() => w?.close());
  const id = () => crypto.randomUUID();
  const task = (input: Record<string, unknown> = {}) => createTask(w.db, w.alice.id, { title: "Task", ...input, mutationId: id() });
  const event = (input: Record<string, unknown>) => createEvent(w.db, w.alice.id, { title: "Event", timezone: TZ, ...input, mutationId: id() });
  const run = (now = NOW) => todayTimeline(w.db, w.alice.id, TZ, now);
  const remove = (type: "task" | "event", rid: string) =>
    confirmDeletion(w.db, w.alice.id, { ...previewDeletion(w.db, w.alice.id, type, rid), mutationId: id() });

  it("returns an empty day", () => {
    const t = run();
    expect(t).toMatchObject({ items: [], dueUnscheduled: [], overdue: [], dayState: "empty", summary: { remaining: 0, total: 0, next: null } });
  });

  it("uses the owner zone, not UTC, for the day boundary", () => {
    event({ title: "UTC today, Jakarta yesterday", start: "2027-01-01T10:00:00Z", end: "2027-01-01T11:00:00Z" });
    const today = event({ title: "Jakarta morning", start: "2027-01-02T09:00:00+07:00", end: "2027-01-02T10:00:00+07:00" });
    const late = task({ title: "Due Jakarta today", dueDate: "2027-01-02" });
    task({ title: "Due UTC today", dueDate: "2027-01-01" });
    const t = run();
    expect(t.items.map((i) => i.id)).toEqual([today.id]);
    expect(t.dueUnscheduled.map((x) => x.id)).toEqual([late.id]);
  });

  it("lists two sessions of one task as two task blocks with the project name", () => {
    const p = createProject(w.db, w.alice.id, { name: "Launch", status: "Active", mutationId: id() });
    const tk = task({ title: "Write spec", projectId: p.id, dueDate: "2027-01-02" });
    event({ title: "Write spec (2)", taskId: tk.id, start: "2027-01-02T14:00:00+07:00", end: "2027-01-02T15:00:00+07:00" });
    event({ title: "Write spec (1)", taskId: tk.id, start: "2027-01-02T09:00:00+07:00", end: "2027-01-02T10:00:00+07:00" });
    const t = run();
    expect(t.items.map((i) => [i.kind, i.title, i.taskId, i.projectName, i.task?.id])).toEqual([
      ["task-block", "Write spec (1)", tk.id, "Launch", tk.id], ["task-block", "Write spec (2)", tk.id, "Launch", tk.id],
    ]);
    expect(t.dueUnscheduled).toEqual([]);
    expect(t.summary).toMatchObject({ remaining: 2, total: 2, next: { title: "Write spec (1)", minutes: 450 } });
  });

  it("includes events crossing midnight in either direction, and all-day events first", () => {
    const into = event({ title: "Into today", start: "2027-01-01T23:00:00+07:00", end: "2027-01-02T01:00:00+07:00" });
    const out = event({ title: "Out of today", start: "2027-01-02T23:00:00+07:00", end: "2027-01-03T02:00:00+07:00" });
    const allDay = event({ title: "Holiday", allDay: true, start: "2027-01-01", end: "2027-01-03" });
    event({ title: "Ends at midnight", start: "2027-01-01T22:00:00+07:00", end: "2027-01-02T00:00:00+07:00" });
    event({ title: "Yesterday all day", allDay: true, start: "2027-01-01", end: "2027-01-02" });
    const t = run();
    expect(t.items.map((i) => i.id)).toEqual([allDay.id, into.id, out.id]);
    expect(t.items[1]).toMatchObject({ kind: "event", start: into.start, end: into.end, done: true });
    expect(t.items[0]).toMatchObject({ allDay: true, done: false });
    expect(t.summary).toMatchObject({ remaining: 1, total: 2, next: { id: out.id } });
  });

  it("treats a day of only all-day events as active with nothing counted", () => {
    event({ title: "Holiday", allDay: true, start: "2027-01-02", end: "2027-01-03" });
    const t = run();
    expect(t.dayState).toBe("active");
    expect(t.summary).toMatchObject({ remaining: 0, total: 0 });
  });

  it("shows Done work but counts it done, and clears the day", () => {
    const a = task({ title: "Block", status: "Done" });
    event({ title: "Block", taskId: a.id, start: "2027-01-02T09:00:00+07:00", end: "2027-01-02T10:00:00+07:00" });
    const due = task({ title: "Due", dueDate: "2027-01-02" });
    let t = run();
    expect(t.items[0]).toMatchObject({ kind: "task-block", done: true });
    expect(t.summary).toMatchObject({ remaining: 1, total: 2, next: null });
    expect(t.dayState).toBe("active");
    updateTask(w.db, w.alice.id, due.id, due.revision, { status: "Done", mutationId: id() });
    t = run();
    expect(t.dueUnscheduled).toEqual([]);
    expect(t.summary).toMatchObject({ remaining: 0, total: 2 });
    expect(t.dayState).toBe("clear");
  });

  it("clears (not empties) when the only due task is completed", () => {
    const due = task({ title: "Due", dueDate: "2027-01-02" });
    updateTask(w.db, w.alice.id, due.id, due.revision, { status: "Done", mutationId: id() });
    expect(run().dayState).toBe("clear");
  });

  it("excludes soft-deleted events and tasks", () => {
    const e = event({ title: "Gone", start: "2027-01-02T09:00:00+07:00", end: "2027-01-02T10:00:00+07:00" });
    const tk = task({ title: "Gone task", dueDate: "2027-01-02" });
    const old = task({ title: "Gone overdue", dueDate: "2026-12-01" });
    remove("event", e.id); remove("task", tk.id); remove("task", old.id);
    expect(run()).toMatchObject({ items: [], dueUnscheduled: [], overdue: [], dayState: "empty" });
  });

  it("puts past deadlines in overdue but keeps today's (even earlier today) as due", () => {
    const past = task({ title: "Past", dueDate: "2027-01-01" });
    const pastTimed = task({ title: "Past timed", dueAt: "2027-01-01T16:00:00Z", timezone: TZ }); // 23:00 Jan 1 Jakarta
    const earlier = task({ title: "Earlier today", dueAt: "2027-01-01T17:30:00Z", timezone: TZ }); // 00:30 Jan 2 Jakarta, before now
    const dueToday = task({ title: "Today", dueDate: "2027-01-02" });
    task({ title: "Done past", dueDate: "2026-12-30", status: "Done" });
    const t = run();
    expect(t.overdue.map((x) => x.id).sort()).toEqual([past.id, pastTimed.id].sort());
    expect(t.dueUnscheduled.map((x) => x.id).sort()).toEqual([earlier.id, dueToday.id].sort());
    expect(t.summary).toMatchObject({ remaining: 2, total: 2, next: null });
  });

  it("isolates owners", () => {
    event({ title: "Alice", start: "2027-01-02T09:00:00+07:00", end: "2027-01-02T10:00:00+07:00" });
    expect(todayTimeline(w.db, w.bob.id, TZ, NOW).items).toEqual([]);
  });
});

describe("summarySentence", () => {
  const s = (remaining: number, total: number, next: { title: string; minutes: number } | null, dayState: "empty" | "active" | "clear") =>
    summarySentence({ remaining, total, next: next && { id: "x", ...next } }, dayState);
  it("builds the sentence with singular and plural", () => {
    expect(s(4, 5, { title: "Design review", minutes: 40 }, "active")).toBe("4 things today · next: Design review in 40 min");
    expect(s(1, 1, { title: "Call", minutes: 1 }, "active")).toBe("1 thing today · next: Call in 1 min");
    expect(s(2, 2, { title: "Call", minutes: 80 }, "active")).toBe("2 things today · next: Call in 1 h 20 min");
    expect(s(2, 2, { title: "Call", minutes: 120 }, "active")).toBe("2 things today · next: Call in 2 h");
    expect(s(3, 3, null, "active")).toBe("3 things left today");
    expect(s(1, 3, null, "active")).toBe("1 thing left today");
    expect(s(0, 3, null, "clear")).toBe("Nothing left today");
    expect(s(0, 0, null, "empty")).toBe("Nothing planned today");
    expect(s(0, 0, null, "active")).toBe("Nothing timed today");
  });
});
