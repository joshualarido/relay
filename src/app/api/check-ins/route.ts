import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { createCheckIn, listCheckIns } from "@/lib/check-ins";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return route(request, (ownerId) => listCheckIns(getDatabase(), ownerId, { projectId: params.get("projectId"), taskId: params.get("taskId") }));
}
export function POST(request: Request) {
  return route(request, async (ownerId) => createCheckIn(getDatabase(), ownerId, await request.json()));
}
