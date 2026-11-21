import { describe, expect, it } from "vitest";
import { computeMomentum } from "@/lib/momentum";
import type { Project, Task } from "@/lib/db/schema";

const now = "2026-11-21T15:00:00Z";
const tz = "Asia/Jakarta";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    ownerId: "u1",
    projectId: null,
    title: "Task",
    description: "",
    status: "To do",
    priority: "Medium",
    important: null,
    urgent: null,
    plannedDate: null,
    dueDate: null,
    dueAt: null,
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: null,
    estimateMinutes: null,
    blockerReason: "",
    completedAt: null,
    position: 0,
    revision: 1,
    archivedAt: null,
    deletedAt: null,
    deletionOperationId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("computeMomentum", () => {
  it("returns On track when 5 of 7 days are active with steady output and follow-through", () => {
    const project: Project = {
      id: "p1",
      ownerId: "u1",
      name: "Relay",
      description: "",
      status: "Active",
      deadline: null,
      position: 0,
      revision: 1,
      archivedAt: null,
      deletedAt: null,
      deletionOperationId: null,
      createdAt: now,
      updatedAt: now,
    };
    const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-20", "2026-11-21"];
    const tasks = days.flatMap((d) => [
      makeTask({ projectId: "p1", status: "Done", startAt: d, endAt: d, allDay: true, completedAt: `${d}T08:00:00Z` }),
      makeTask({ projectId: "p1", status: "Done", completedAt: `${d}T10:00:00Z` }),
    ]);
    const report = computeMomentum(tasks, [project], tz, 7, now);
    expect(report.score).toBeGreaterThanOrEqual(75);
    expect(report.status).toBe("On track");
    expect(report.activeDays).toBe(5);
    expect(report.completedCount).toBe(10);
    expect(report.followThroughPct).toBe(100);
    expect(report.dailyBars).toHaveLength(7);
    expect(report.activeProjects[0]).toMatchObject({ name: "Relay", done: 10, total: 10, completedInWindow: 10 });
  });

  it("returns Quiet on an empty workspace", () => {
    const report = computeMomentum([], [], tz, 7, now);
    expect(report.score).toBe(0);
    expect(report.status).toBe("Quiet");
    expect(report.followThroughPct).toBeNull();
  });
});
