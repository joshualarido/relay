import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { restoreDeletion } from "@/lib/lifecycle";

export function POST(request: Request, context: { params: Promise<{ operationId: string }> }) {
  return route(request, async (ownerId) => restoreDeletion(getDatabase(), ownerId, (await context.params).operationId, await request.json()));
}
