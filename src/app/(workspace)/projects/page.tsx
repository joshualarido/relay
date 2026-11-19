import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { listEvents } from "@/lib/events";
import { getPreferences } from "@/lib/preferences";
import { dateInTimezone } from "@/lib/dates";
import { ProjectsView } from "@/components/projects/projects-view";

export default async function ProjectsPage() {
  const ownerId = await requireUserId(), db = getDatabase();
  const timezone = getPreferences(db, ownerId).timezone;
  const now = new Date().toISOString(), today = dateInTimezone(now, timezone);
  const projects = [...listProjects(db, ownerId), ...listProjects(db, ownerId, true)];
  // Only events not yet over are shown on the board; the rest stay on the Calendar.
  const events = listEvents(db, ownerId, true).filter((e) => e.allDay ? e.end > today : Date.parse(e.end) > Date.parse(now));
  return <ProjectsView projects={projects} tasks={listTasks(db, ownerId, true)} events={events} timezone={timezone} now={now} />;
}
