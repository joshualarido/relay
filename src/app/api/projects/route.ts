import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { createProject, listProjects } from "@/services/projects";

export function GET(request: Request) {
  return route(request, (userId) => listProjects(getDatabase(), userId, new URL(request.url).searchParams.get("archived") === "true"));
}

export function POST(request: Request) {
  return route(request, async (userId) => createProject(getDatabase(), userId, await request.json()));
}
