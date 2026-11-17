import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { listActivity } from "@/lib/activity";

export function GET(request: Request) {
  return route(request, (ownerId) => listActivity(getDatabase(), ownerId));
}
