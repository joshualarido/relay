import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { archiveProject, getProject, updateProject } from "@/services/projects";

type Context = { params: Promise<{ projectId: string }> };

export function GET(request: Request, context: Context) {
  return route(request, async (userId) => getProject(getDatabase(), userId, (await context.params).projectId));
}

export function PATCH(request: Request, context: Context) {
  return route(request, async (userId) => {
    const { expectedRevision, ...input } = z.object({ expectedRevision: z.number().int().positive() }).passthrough().parse(await request.json());
    const { projectId } = await context.params;
    return "archived" in input
      ? archiveProject(getDatabase(), userId, projectId, expectedRevision, input)
      : updateProject(getDatabase(), userId, projectId, expectedRevision, input);
  });
}
