import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { confirmDeletion, previewDeletion } from "@/services/lifecycle";
import { AppError } from "@/lib/errors";

type Context = { params: Promise<{ taskId: string }> };
export function GET(request: Request, context: Context) {
  return route(request, async (userId) => previewDeletion(getDatabase(), userId, "task", (await context.params).taskId));
}
export function POST(request: Request, context: Context) {
  return route(request, async (userId) => {
    const input = z.object({ id: z.string(), entityType: z.literal("task") }).passthrough().parse(await request.json());
    if (input.id !== (await context.params).taskId) throw new AppError(400, "Deletion preview does not match this task.");
    return confirmDeletion(getDatabase(), userId, input);
  });
}
