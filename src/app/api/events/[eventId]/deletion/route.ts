import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { confirmDeletion, previewDeletion } from "@/lib/lifecycle";
import { AppError } from "@/lib/errors";

type Context = { params: Promise<{ eventId: string }> };
export function GET(request: Request, context: Context) {
  return route(request, async (userId) => previewDeletion(getDatabase(), userId, "event", (await context.params).eventId));
}
export function POST(request: Request, context: Context) {
  return route(request, async (userId) => {
    const input = z.object({ id: z.string(), entityType: z.literal("event") }).passthrough().parse(await request.json());
    if (input.id !== (await context.params).eventId) throw new AppError(400, "Deletion preview does not match this event.");
    return confirmDeletion(getDatabase(), userId, input);
  });
}
