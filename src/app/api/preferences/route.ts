import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { getPreferences, savePreferences } from "@/lib/preferences";

export function GET(request: Request) {
  return route(request, (userId) => getPreferences(getDatabase(), userId));
}

export function PATCH(request: Request) {
  return route(request, async (userId) => savePreferences(getDatabase(), userId, await request.json()));
}
