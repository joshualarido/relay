import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { reorderProjects } from "@/lib/projects";

export function POST(request: Request) {
  return route(request, async (userId) => reorderProjects(getDatabase(), userId, await request.json()));
}
