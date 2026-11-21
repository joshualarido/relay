import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { undoOperation } from "@/services/lifecycle";

export function POST(request: Request, context: { params: Promise<{ operationId: string }> }) {
  return route(request, async (ownerId) => undoOperation(getDatabase(), ownerId, (await context.params).operationId, await request.json()));
}
