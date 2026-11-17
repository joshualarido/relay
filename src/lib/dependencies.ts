import type { Dependency } from "./db/schema";
import { AppError } from "./errors";

// dormant (v3): dependencies have no UI or API. Recovery of pre-v3 dependency rows still rejects cycles.
export function assertNoCycle(edges: Pick<Dependency, "taskId" | "prerequisiteId">[]) {
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new AppError(409, "This dependency would create a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of edges) if (edge.taskId === id) visit(edge.prerequisiteId);
    visiting.delete(id); visited.add(id);
  }
  for (const edge of edges) visit(edge.taskId);
}
