import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { archiveTask, getTask, skipTaskOccurrence, updateTask } from "@/services/tasks";

type Context = { params: Promise<{ taskId: string }> };
export function GET(request: Request, context: Context) {
  return route(request, async (userId) => getTask(getDatabase(), userId, (await context.params).taskId));
}
export function PATCH(request: Request, context: Context) {
  return route(request, async (userId) => {
    const { expectedRevision, scope, skipOccurrence, ...input } = z.object({
      expectedRevision: z.number().int().positive(),
      scope: z.enum(["single", "series"]).optional(),
      skipOccurrence: z.boolean().optional(),
    }).passthrough().parse(await request.json());
    const id = (await context.params).taskId;
    if (scope === "single" && skipOccurrence) {
      return skipTaskOccurrence(getDatabase(), userId, id, expectedRevision, input);
    }
    return "archived" in input
      ? archiveTask(getDatabase(), userId, id, expectedRevision, input)
      : updateTask(getDatabase(), userId, id, expectedRevision, input);
  });
}
