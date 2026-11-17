import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { createTask, listTasks } from "@/lib/tasks";

export function GET(request: Request) {
  return route(request, (userId) => listTasks(getDatabase(), userId));
}

export function POST(request: Request) {
  return route(request, async (userId) => createTask(getDatabase(), userId, await request.json()));
}
