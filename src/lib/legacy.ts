import type { Snapshot } from "./db/schema";

// Pre-v3 activity snapshots may hold legacy status values; map them at read time.
const taskMap: Record<string, "To do" | "Done"> = {
  Backlog: "To do", Next: "To do", "To do": "To do", "In Progress": "To do", Blocked: "To do", Doing: "To do", Done: "Done",
};
const projectMap: Record<string, "Planned" | "Active" | "Paused" | "Done"> = {
  Planned: "Planned", Active: "Active", Paused: "Paused", Completed: "Done", Done: "Done",
};

export function normalizeTaskStatus(s: string): "To do" | "Done" {
  const v = taskMap[s];
  if (!v) throw new Error(`Unknown task status: ${s}`);
  return v;
}

export function normalizeProjectStatus(s: string): "Planned" | "Active" | "Paused" | "Done" {
  const v = projectMap[s];
  if (!v) throw new Error(`Unknown project status: ${s}`);
  return v;
}

// Unknown statuses pass through so a corrupt snapshot fails the revision comparison (409), not a 500.
// plannedDate is dormant since migration 0008 nulled every planned_date (now linked events).
export function normalizeSnapshot(s: Snapshot): Snapshot {
  if (s.entityType === "task") {
    const status = (taskMap[s.record.status] ?? s.record.status) as typeof s.record.status;
    return { ...s, record: { ...s.record, status, plannedDate: null } };
  }
  if (s.entityType === "project") {
    const status = (projectMap[s.record.status] ?? s.record.status) as typeof s.record.status;
    return { ...s, record: { ...s.record, status } };
  }
  return s;
}
