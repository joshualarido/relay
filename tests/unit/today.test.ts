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
    expect(t).toMatchObject({ schedule: [], tasks: [], overdue: [], dayState: "empty", summary: { remaining: 0, total: 0, next: null } });
  });

  it("uses the owner zone, not UTC, for the day boundary", () => {
    event({ title: "UTC today, Jakarta yesterday", start: "2027-01-01T10:00:00Z", end: "2027-01-01T11:00:00Z" });
    const today = event({ title: "Jakarta morning", start: "2027-01-02T09:00:00+07:00", end: "2027-01-02T10:00:00+07:00" });
    const execToday = task({ title: "Planned Jakarta today", executionDate: "2027-01-02" });
    task({ title: "Planned UTC today", executionDate: "2027-01-01" });
    const t = run();
    expect(t.schedule.map((i) => i.id)).toEqual([today.id]);
    expect(t.tasks.map((x) => x.id)).toEqual([execToday.id]);
  });

  it("includes project deadlines (date-only and timed) in Today schedule", () => {
    const p1 = createProject(w.db, w.alice.id, { name: "Launch", status: "Active", deadline: "2027-01-02", mutationId: id() });
    const p2 = createProject(w.db, w.alice.id, {
      name: "Demo", status: "Active", deadlineAt: "2027-01-02T14:00:00+07:00", deadlineTimezone: TZ, mutationId: id(),
    });
    const t = run();
    expect(t.schedule.map((i) => [i.kind, i.projectId, i.allDay])).toEqual([
      ["project-deadline", p1.id, true],
      ["project-deadline", p2.id, false],
    ]);
    expect(t.summary.next).toMatchObject({ kind: "project-deadline", title: "Demo" });
  });

  it("includes events crossing midnight in either direction, and all-day events first", () => {
    const into = event({ title: "Into today", start: "2027-01-01T23:00:00+07:00", end: "2027-01-02T01:00:00+07:00" });
    const out = event({ title: "Out of today", start: "2027-01-02T23:00:00+07:00", end: "2027-01-03T02:00:00+07:00" });
    const allDay = event({ title: "Holiday", allDay: true, start: "2027-01-01", end: "2027-01-03" });
    event({ title: "Ends at midnight", start: "2027-01-01T22:00:00+07:00", end: "2027-01-02T00:00:00+07:00" });
    event({ title: "Yesterday all day", allDay: true, start: "2027-01-01", end: "2027-01-02" });
    const t = run();
    expect(t.schedule.map((i) => i.id)).toEqual([allDay.id, into.id, out.id]);
    expect(t.schedule[1]).toMatchObject({ kind: "event", start: into.start, end: into.end, done: true });
    expect(t.schedule[0]).toMatchObject({ allDay: true, done: false });
    expect(t.summary).toMatchObject({ remaining: 1, total: 2, next: { id: out.id } });
  });

  it("treats a day of only all-day events as active with nothing counted", () => {
    event({ title: "Holiday", allDay: true, start: "2027-01-02", end: "2027-01-03" });
    const t = run();
    expect(t.dayState).toBe("active");
    expect(t.summary).toMatchObject({ remaining: 0, total: 0 });
  });

  it("clears (not empties) when the only task for today is completed", () => {
    const tk = task({ title: "Ship it", executionDate: "2027-01-02" });
    expect(run().dayState).toBe("active");
    updateTask(w.db, w.alice.id, tk.id, tk.revision, { status: "Done", mutationId: id() });
    expect(run().dayState).toBe("clear");
  });

  it("excludes soft-deleted events and tasks", () => {
    const e = event({ title: "Gone", start: "2027-01-02T09:00:00+07:00", end: "2027-01-02T10:00:00+07:00" });
    const tk = task({ title: "Gone task", executionDate: "2027-01-02" });
    const old = task({ title: "Gone overdue", executionDate: "2026-12-01" });
    remove("event", e.id); remove("task", tk.id); remove("task", old.id);
    expect(run()).toMatchObject({ schedule: [], tasks: [], overdue: [], dayState: "empty" });
  });

  it("puts past execution dates in overdue and isolates owners", () => {
    const past = task({ title: "Past", executionDate: "2027-01-01" });
    task({ title: "Done past", executionDate: "2026-12-30", status: "Done" });
    const t = run();
    expect(t.overdue.map((x) => x.id)).toEqual([past.id]);
    expect(todayTimeline(w.db, w.bob.id, TZ, NOW).schedule).toEqual([]);
  });
});

describe("summarySentence", () => {
  const s = (remaining: number, total: number, next: { title: string; minutes: number } | null, dayState: "empty" | "active" | "clear") =>
    summarySentence(
      { remaining, total, next: next && { id: "x", kind: "event", at: NOW, href: "/?event=x", ...next } },
      dayState,
    );
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
