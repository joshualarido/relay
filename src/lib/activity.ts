import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppDatabase } from "./db";
import { activity } from "./db/schema";
import { AppError } from "./errors";

export const mutationIdSchema = z.uuid();

export function requestHash(action: string, entityId: string | null, data: unknown) {
  return createHash("sha256").update(JSON.stringify([action, entityId, data])).digest("hex");
}

export function replayMutation(db: Pick<AppDatabase, "select">, ownerId: string, mutationId: string, hash: string, legacyHashes: string[] = []) {
  const previous = db.select().from(activity)
    .where(and(eq(activity.ownerId, ownerId), eq(activity.mutationId, mutationId))).get();
  if (previous && previous.requestHash !== hash && !legacyHashes.includes(previous.requestHash)) throw new AppError(409, "This mutation identity was reused for different input.");
  return previous;
}

export function recordOperation(
  db: Pick<AppDatabase, "insert">,
  input: Omit<typeof activity.$inferInsert, "id" | "createdAt"> & { id?: string },
) {
  const id = input.id ?? crypto.randomUUID();
  db.insert(activity).values({ ...input, id, createdAt: new Date().toISOString() }).run();
  return id;
}

export function listActivity(db: Pick<AppDatabase, "select">, ownerId: string) {
  // ponytail: personal-workspace history loads in one query; paginate server-side when measured history size warrants it.
  return db.select().from(activity).where(eq(activity.ownerId, ownerId)).orderBy(desc(activity.createdAt)).all();
}
