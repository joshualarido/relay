import type { Task } from "./db/schema";

export const quadrants = ["Do first", "Schedule", "Handle quickly", "Reconsider", "Unclassified"] as const;
export function priorityLabel(task: Pick<Task, "important" | "urgent">) {
  return task.important === null || task.urgent === null ? "Unclassified"
    : task.important ? task.urgent ? "Do first" : "Schedule" : task.urgent ? "Handle quickly" : "Reconsider";
}
