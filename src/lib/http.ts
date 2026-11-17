import { z } from "zod";
import { currentSession } from "./auth";
import { AppError } from "./errors";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "./db";
import { activity } from "./db/schema";

export async function route(
  request: Request,
  action: (userId: string) => unknown | Promise<unknown>,
) {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const expectedOrigin = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin;
      if (request.headers.get("origin") !== expectedOrigin) throw new AppError(403, "Request origin is not allowed.");
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError(415, "Send JSON data.");
    }
    const session = await currentSession(request.headers);
    if (!session) throw new AppError(401, "Sign in to access your workspace.");
    const body = !["GET", "HEAD"].includes(request.method) ? request.clone() : null;
    const result = await action(session.user.id);
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (body) {
      const input = await body.json();
      if (typeof input.mutationId === "string") {
        const operation = getDatabase().select({ id: activity.id }).from(activity)
          .where(and(eq(activity.ownerId, session.user.id), eq(activity.mutationId, input.mutationId))).get();
        if (operation) headers["X-Relay-Operation-Id"] = operation.id;
      }
    }
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({
      error: "Check the highlighted fields.",
      fields: z.flattenError(error).fieldErrors,
    }, { status: 400 });
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    console.error("Workspace request failed; details suppressed to protect record content.");
    return Response.json({ error: "The request could not be saved. Your existing data has not been replaced." }, { status: 500 });
  }
}
