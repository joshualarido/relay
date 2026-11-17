import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { getPreferences } from "@/lib/preferences";
import { searchWorkspace } from "@/lib/workbench";

export function GET(request: Request) {
  return route(request, (ownerId) => {
    const db = getDatabase();
    return searchWorkspace(db, ownerId, Object.fromEntries(new URL(request.url).searchParams), getPreferences(db, ownerId).timezone);
  });
}
