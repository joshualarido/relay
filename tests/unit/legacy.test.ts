import { describe, expect, it } from "vitest";
import { normalizeProjectStatus, normalizeSnapshot, normalizeTaskStatus } from "../../src/lib/legacy";
import type { Snapshot } from "../../src/lib/db/schema";

describe("legacy status normalization", () => {
  it.each([["Backlog", "To do"], ["Next", "To do"], ["In Progress", "To do"], ["Blocked", "To do"], ["Done", "Done"],
    ["To do", "To do"], ["Doing", "To do"]])("task %s -> %s", (from, to) => expect(normalizeTaskStatus(from)).toBe(to));
  it.each([["Completed", "Done"], ["Planned", "Planned"], ["Active", "Active"], ["Paused", "Paused"], ["Done", "Done"]])(
    "project %s -> %s", (from, to) => expect(normalizeProjectStatus(from)).toBe(to));
  it("normalizes task, project, and event snapshots and passes other entities through", () => {
    const t = { entityType: "task", record: { id: "t", status: "Blocked" } } as unknown as Snapshot;
    const p = { entityType: "project", record: { id: "p", status: "Completed" } } as unknown as Snapshot;
    const e = { entityType: "event", record: { id: "e", title: "Standup" } } as unknown as Snapshot;
    const c = { entityType: "check-in", record: { id: "c", content: "Note" } } as unknown as Snapshot;
    expect(normalizeSnapshot(t).record).toMatchObject({ id: "t", status: "To do" });
    expect(normalizeSnapshot(p).record).toMatchObject({ id: "p", status: "Done" });
    expect(normalizeSnapshot(e).record).toMatchObject({
      id: "e",
      title: "Standup",
      recurrenceRule: null,
      recurrenceSeriesId: null,
      recurrenceExceptions: null,
      recurrenceOccurrenceDate: null,
    });
    expect(normalizeSnapshot(c)).toBe(c);
  });
  it("clears dormant plannedDate on task snapshots and passes unknown statuses through", () => {
    const t = { entityType: "task", record: { id: "t", status: "Weird", plannedDate: "2026-11-20" } } as unknown as Snapshot;
    const p = { entityType: "project", record: { id: "p", status: "Odd" } } as unknown as Snapshot;
    expect(normalizeSnapshot(t).record).toMatchObject({ status: "Weird", plannedDate: null });
    expect(normalizeSnapshot(p).record).toMatchObject({ status: "Odd" });
  });
});
