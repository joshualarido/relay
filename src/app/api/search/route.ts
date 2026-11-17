import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { searchWorkspace } from "@/lib/workbench";

export function GET(request: Request) {
  return route(request, (ownerId) => searchWorkspace(getDatabase(), ownerId, Object.fromEntries(new URL(request.url).searchParams)));
}
