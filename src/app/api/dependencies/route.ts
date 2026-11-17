import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { addDependency, listDependencies } from "@/lib/dependencies";

export function GET(request: Request) {
  return route(request, (ownerId) => listDependencies(getDatabase(), ownerId));
}
export function POST(request: Request) {
  return route(request, async (ownerId) => addDependency(getDatabase(), ownerId, await request.json()));
}
