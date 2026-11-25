import type { AppDatabase } from "@/lib/db";
import type { Event, Project, Task } from "@/lib/db/schema";
import { getEvent } from "@/lib/events";
import { AppError } from "@/lib/errors";
import { EventPanel } from "./event-panel";

export function EventSelection({ db, ownerId, id, occurrenceDate, projects, tasks, timezone }: { db: AppDatabase; ownerId: string; id?: string; occurrenceDate?: string; projects: Project[]; tasks: Task[]; timezone: string }) {
  if (!id) return null;
  let event: Event | null = null;
  try { event = getEvent(db, ownerId, id); }
  catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
  return <EventPanel event={event} occurrenceDate={occurrenceDate} projects={projects} tasks={tasks} timezone={timezone} />;
}
