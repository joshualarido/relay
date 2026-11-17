import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { getTask, updateTask } from "@/lib/tasks";

type Context = { params: Promise<{ taskId: string }> };
export function GET(request: Request, context: Context) {
  return route(request, async (userId) => getTask(getDatabase(), userId, (await context.params).taskId));
}
export function PATCH(request: Request, context: Context) {
  return route(request, async (userId) => {
    const { expectedRevision, ...input } = z.object({ expectedRevision: z.number().int().positive() }).passthrough().parse(await request.json());
    return updateTask(getDatabase(), userId, (await context.params).taskId, expectedRevision, input);
  });
}
