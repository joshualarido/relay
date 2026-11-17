import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { reorderTasks } from "@/lib/tasks";

export function POST(request: Request) {
  return route(request, async (userId) => reorderTasks(getDatabase(), userId, await request.json()));
}
