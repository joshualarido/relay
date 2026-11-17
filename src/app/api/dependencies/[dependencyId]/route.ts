import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { removeDependency } from "@/lib/dependencies";

export function DELETE(request: Request, context: { params: Promise<{ dependencyId: string }> }) {
  return route(request, async (ownerId) => {
    const { expectedRevision, ...input } = z.object({ expectedRevision: z.number().int().positive() }).passthrough().parse(await request.json());
    return removeDependency(getDatabase(), ownerId, (await context.params).dependencyId, expectedRevision, input);
  });
}
