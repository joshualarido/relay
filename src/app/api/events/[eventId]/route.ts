import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import {
  archiveEvent,
  deleteEventOccurrence,
  editEventOccurrence,
  getEvent,
  rescheduleEvent,
  updateEvent,
} from "@/services/events";

type Context = { params: Promise<{ eventId: string }> };
export function GET(request: Request, context: Context) {
  return route(request, async (userId) => getEvent(getDatabase(), userId, (await context.params).eventId));
}
export function PATCH(request: Request, context: Context) {
  return route(request, async (userId) => {
    const { expectedRevision, reschedule, scope, deleteOccurrence, ...input } = z.object({
      expectedRevision: z.number().int().positive(),
      reschedule: z.boolean().optional(),
      scope: z.enum(["single", "series"]).optional(),
      deleteOccurrence: z.boolean().optional(),
    }).passthrough().parse(await request.json());
    const { eventId } = await context.params;
    if (scope === "single") {
      if (deleteOccurrence) {
        return deleteEventOccurrence(getDatabase(), userId, eventId, expectedRevision, input);
      }
      return editEventOccurrence(getDatabase(), userId, eventId, expectedRevision, {
        ...input,
        ...(reschedule !== undefined ? { reschedule } : {}),
      });
    }
    if ("archived" in input) return archiveEvent(getDatabase(), userId, eventId, expectedRevision, input);
    return reschedule ? rescheduleEvent(getDatabase(), userId, eventId, expectedRevision, input)
      : updateEvent(getDatabase(), userId, eventId, expectedRevision, input);
  });
}
