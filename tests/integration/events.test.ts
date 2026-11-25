import { beforeAll, afterAll, describe, it, expect } from "vitest";
import * as events from "../../src/lib/events";
import { createProject, archiveProject } from "../../src/lib/projects";
import { createTask } from "../../src/lib/tasks";
import { previewDeletion, confirmDeletion, undoOperation } from "../../src/lib/lifecycle";
import { activity } from "../../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { testWorkspace } from "../support/auth";

describe("manual events and calendar", () => {
  let w: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { w = await testWorkspace(); });
  afterAll(() => w?.close());
  const create = (input: Record<string, unknown> = {}) => events.createEvent(w.db, w.alice.id, {
    title: "Study", start: "2027-03-14T09:30:00Z", end: "2027-03-14T10:30:00Z",
    timezone: "America/Los_Angeles", ...input, mutationId: crypto.randomUUID(),
  });
  it("validates times, timezone, URL and exclusive all-day dates", () => {
    for (const input of [
      { end: "2027-03-14T08:30:00Z" }, { end: null }, { timezone: "Not/Zone" }, { timezone: "+07:00" }, { location: "javascript:alert(1)" },
      { allDay: true, start: "2027-03-14", end: "2027-03-14" },
      { allDay: true, start: "2027-03-14", end: "2027-03-13" },
      { allDay: true, start: "2027-02-30", end: "2027-03-02" }, { ownerId: w.bob.id },
    ]) expect(() => create(input)).toThrow();
    const day = create({ allDay: true, start: "2027-03-14", end: "2027-03-15", timezone: "Asia/Jakarta" });
    expect(events.getEvent(w.db, w.alice.id, day.id)).toMatchObject({ start: "2027-03-14", end: "2027-03-15" });
  });
  it("stores instants and preserves duration through DST rescheduling", () => {
    const e = create();
    const moved = events.rescheduleEvent(w.db, w.alice.id, e.id, 1, { start: "2027-03-15T01:30:00-07:00", mutationId: crypto.randomUUID() });
    expect(moved).toMatchObject({ start: "2027-03-15T08:30:00.000Z", end: "2027-03-15T09:30:00.000Z", timezone: "America/Los_Angeles" });
    expect(() => events.updateEvent(w.db, w.alice.id, e.id, 1, { title: "Stale", mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    const day = create({ allDay: true, start: "2027-01-01", end: "2027-01-04" });
    expect(events.rescheduleEvent(w.db, w.alice.id, day.id, 1, { start: "2027-04-20", mutationId: crypto.randomUUID() }))
      .toMatchObject({ start: "2027-04-20", end: "2027-04-23" });
  });
  it("checks links and ownership, hides archived child events, and leaves independent events visible", () => {
    const p = createProject(w.db, w.alice.id, { name: "Linked", mutationId: crypto.randomUUID() });
    const t = createTask(w.db, w.alice.id, { title: "Linked task", projectId: p.id, mutationId: crypto.randomUUID() });
    const direct = create({ projectId: p.id });
    const child = create({ taskId: t.id, projectId: p.id });
    const independent = create();
    const other = createProject(w.db, w.alice.id, { name: "Other", mutationId: crypto.randomUUID() });
    expect(() => create({ projectId: other.id, taskId: t.id })).toThrow(/match/i);
    expect(() => events.getEvent(w.db, w.bob.id, child.id)).toThrow(/not found/i);
    expect(() => events.createEvent(w.db, w.bob.id, { title: "Foreign", start: direct.start, end: direct.end, timezone: "UTC", taskId: t.id, mutationId: crypto.randomUUID() })).toThrow(/not found/i);
    archiveProject(w.db, w.alice.id, p.id, 1, { archived: true, mutationId: crypto.randomUUID() });
    const ids = events.listEvents(w.db, w.alice.id).map((e) => e.id);
    expect(ids).not.toContain(child.id); expect(ids).not.toContain(direct.id); expect(ids).toContain(independent.id);
  });
  it("cascades linked events, excludes independently deleted events, and invalidates new child membership", () => {
    const p = createProject(w.db, w.alice.id, { name: "Cascade", mutationId: crypto.randomUUID() });
    const t = createTask(w.db, w.alice.id, { title: "Cascade task", projectId: p.id, mutationId: crypto.randomUUID() });
    const deleted = create({ taskId: t.id });
    const deletion = confirmDeletion(w.db, w.alice.id, { ...previewDeletion(w.db, w.alice.id, "event", deleted.id), mutationId: crypto.randomUUID() });
    const old = previewDeletion(w.db, w.alice.id, "project", p.id);
    const linked = create({ taskId: t.id });
    const direct = create({ projectId: p.id });
    const independent = create();
    expect(() => confirmDeletion(w.db, w.alice.id, { ...old, mutationId: crypto.randomUUID() })).toThrow(/changed/i);
    const preview = previewDeletion(w.db, w.alice.id, "project", p.id);
    expect(preview.records.map((r) => r.id)).toEqual(expect.arrayContaining([p.id, t.id, linked.id, direct.id]));
    expect(preview.records.map((r) => r.id)).not.toContain(deleted.id);
    expect(confirmDeletion(w.db, w.alice.id, { ...preview, mutationId: crypto.randomUUID() }).operationId).not.toBe(deletion.operationId);
    expect(() => events.getEvent(w.db, w.alice.id, linked.id)).toThrow(/not found/i);
    expect(events.getEvent(w.db, w.alice.id, independent.id)).toBeTruthy();
  });
  it("replays retries once and rolls back data when activity fails", () => {
    const input = { title: "Once", allDay: true, start: "2027-01-01", end: "2027-01-02", timezone: "UTC", mutationId: crypto.randomUUID() };
    expect(events.createEvent(w.db, w.alice.id, input)).toEqual(events.createEvent(w.db, w.alice.id, input));
    w.db.$client.exec("CREATE TRIGGER fail_event_audit BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END");
    try { expect(() => create({ title: "Roll back event" })).toThrow(/injected/); }
    finally { w.db.$client.exec("DROP TRIGGER fail_event_audit"); }
    expect(events.listEvents(w.db, w.alice.id).some((e) => e.title === "Roll back event")).toBe(false);
  });

  it("supports recurring events with single-occurrence edit/delete, series delete, and atomic undo", () => {
    const series = create({
      title: "Daily standup",
      allDay: false,
      start: "2027-02-10T09:00:00Z",
      end: "2027-02-10T09:30:00Z",
      timezone: "UTC",
      recurrenceRule: { frequency: "daily", interval: 1, endDate: "2027-02-15" },
    });
    expect(series.recurrenceRule).toEqual({ frequency: "daily", interval: 1, endDate: "2027-02-15" });
    expect(series.recurrenceSeriesId).toBeTruthy();

    // Edit just the 2027-02-12 occurrence -> detaches an override and excludes 2027-02-12 from the master
    const editedSingle = events.editEventOccurrence(w.db, w.alice.id, series.id, series.revision, {
      occurrenceDate: "2027-02-12",
      title: "Standup (retro)",
      mutationId: crypto.randomUUID(),
    });
    expect(editedSingle.series.recurrenceExceptions).toEqual(["2027-02-12"]);
    expect(editedSingle.event).toMatchObject({
      title: "Standup (retro)",
      start: "2027-02-12T09:00:00.000Z",
      end: "2027-02-12T09:30:00.000Z",
      recurrenceRule: null,
      recurrenceSeriesId: series.recurrenceSeriesId,
      recurrenceOccurrenceDate: "2027-02-12",
    });

    // Delete just the 2027-02-13 occurrence -> adds exception without deleting the series
    const deletedSingle = events.deleteEventOccurrence(w.db, w.alice.id, series.id, editedSingle.series.revision, {
      occurrenceDate: "2027-02-13",
      mutationId: crypto.randomUUID(),
    });
    expect(deletedSingle.recurrenceExceptions).toEqual(["2027-02-12", "2027-02-13"]);

    // Undo single-occurrence delete restores 2027-02-13
    const ops = w.db.select().from(activity).where(eq(activity.entityId, series.id)).all();
    const delOccOp = ops.find((a) => a.action === "delete-occurrence")!;
    undoOperation(w.db, w.alice.id, delOccOp.id, { mutationId: crypto.randomUUID() });
    expect(events.getEvent(w.db, w.alice.id, series.id).recurrenceExceptions).toEqual(["2027-02-12"]);

    // Deleting the whole series includes both the master and detached overrides
    const preview = previewDeletion(w.db, w.alice.id, "event", series.id);
    expect(preview.records.map((r) => r.id)).toEqual(expect.arrayContaining([series.id, editedSingle.event.id]));
    confirmDeletion(w.db, w.alice.id, { ...preview, mutationId: crypto.randomUUID() });
    expect(() => events.getEvent(w.db, w.alice.id, series.id)).toThrow(/not found/i);
    expect(() => events.getEvent(w.db, w.alice.id, editedSingle.event.id)).toThrow(/not found/i);
  });
});
