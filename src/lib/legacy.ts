import type { Snapshot } from "./db/schema";

// Pre-v3 activity snapshots may hold legacy status values; map them at read time.
const taskMap: Record<string, "To do" | "Doing" | "Done"> = {
  Backlog: "To do", Next: "To do", "To do": "To do", "In Progress": "Doing", Blocked: "Doing", Doing: "Doing", Done: "Done",
};
const projectMap: Record<string, "Planned" | "Active" | "Paused" | "Done"> = {
  Planned: "Planned", Active: "Active", Paused: "Paused", Completed: "Done", Done: "Done",
};

export function normalizeTaskStatus(s: string): "To do" | "Doing" | "Done" {
  const v = taskMap[s];
  if (!v) throw new Error(`Unknown task status: ${s}`);
  return v;
}

export function normalizeProjectStatus(s: string): "Planned" | "Active" | "Paused" | "Done" {
  const v = projectMap[s];
  if (!v) throw new Error(`Unknown project status: ${s}`);
  return v;
}

export function normalizeSnapshot(s: Snapshot): Snapshot {
  if (s.entityType === "task") return { ...s, record: { ...s.record, status: normalizeTaskStatus(s.record.status) } };
  if (s.entityType === "project") return { ...s, record: { ...s.record, status: normalizeProjectStatus(s.record.status) } };
  return s;
}
