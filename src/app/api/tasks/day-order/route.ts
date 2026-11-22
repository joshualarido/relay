import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { reorderDayTasks } from "@/services/tasks";

export function POST(request: Request) {
  return route(request, async (userId) => reorderDayTasks(getDatabase(), userId, await request.json()));
}
