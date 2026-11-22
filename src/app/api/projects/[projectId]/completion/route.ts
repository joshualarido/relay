import { route } from "@/lib/http";
import { getDatabase } from "@/lib/db";
import { previewProjectCompletion } from "@/services/projects";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  return route(request, (ownerId) => previewProjectCompletion(getDatabase(), ownerId, projectId));
}
