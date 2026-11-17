import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { previewDeletion, confirmDeletion } from "@/lib/lifecycle";
import { AppError } from "@/lib/errors";
import { z } from "zod";

type Context = { params: Promise<{ projectId: string }> };

export function GET(request: Request, context: Context) {
  return route(request, async (userId) => previewDeletion(getDatabase(), userId, "project", (await context.params).projectId));
}

export function POST(request: Request, context: Context) {
  return route(request, async (userId) => {
    const input = z.object({ id: z.string(), entityType: z.literal("project") }).passthrough().parse(await request.json());
    if (input.id !== (await context.params).projectId) throw new AppError(400, "Deletion preview does not match this project.");
    return confirmDeletion(getDatabase(), userId, input);
  });
}
