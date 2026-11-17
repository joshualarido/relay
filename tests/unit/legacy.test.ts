import { describe, expect, it } from "vitest";
import { normalizeProjectStatus, normalizeSnapshot, normalizeTaskStatus } from "../../src/lib/legacy";
import type { Snapshot } from "../../src/lib/db/schema";

describe("legacy status normalization", () => {
  it.each([["Backlog", "To do"], ["Next", "To do"], ["In Progress", "Doing"], ["Blocked", "Doing"], ["Done", "Done"],
    ["To do", "To do"], ["Doing", "Doing"]])("task %s -> %s", (from, to) => expect(normalizeTaskStatus(from)).toBe(to));
  it.each([["Completed", "Done"], ["Planned", "Planned"], ["Active", "Active"], ["Paused", "Paused"], ["Done", "Done"]])(
    "project %s -> %s", (from, to) => expect(normalizeProjectStatus(from)).toBe(to));
  it("normalizes task and project snapshots and passes other entities through", () => {
    const t = { entityType: "task", record: { id: "t", status: "Blocked" } } as unknown as Snapshot;
    const p = { entityType: "project", record: { id: "p", status: "Completed" } } as unknown as Snapshot;
    const e = { entityType: "event", record: { id: "e", status: "Blocked" } } as unknown as Snapshot;
    expect(normalizeSnapshot(t).record).toMatchObject({ id: "t", status: "Doing" });
    expect(normalizeSnapshot(p).record).toMatchObject({ id: "p", status: "Done" });
    expect(normalizeSnapshot(e)).toBe(e);
  });
});
