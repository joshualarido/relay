import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { listWorkingHoursOverrides } from "@/lib/preferences";

export function GET(request: Request) {
  return route(request, (userId) => {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    return listWorkingHoursOverrides(getDatabase(), userId, from, to);
  });
}
