import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { createEvent, listEvents } from "@/services/events";

export function GET(request: Request) {
  return route(request, (userId) => listEvents(getDatabase(), userId));
}
export function POST(request: Request) {
  return route(request, async (userId) => createEvent(getDatabase(), userId, await request.json()));
}
