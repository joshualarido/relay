import { requireUserId } from "@/lib/auth";
import { getCachedEvents, getCachedPreferences, getCachedProjects, getCachedTasks } from "@/lib/request-data";
import { dateInTimezone } from "@/lib/dates";
import { ProjectsView } from "@/components/projects/projects-view";

export default async function ProjectsPage() {
  const ownerId = await requireUserId();
  const timezone = getCachedPreferences(ownerId).timezone;
  const now = new Date().toISOString(), today = dateInTimezone(now, timezone);
  const projects = [...getCachedProjects(ownerId), ...getCachedProjects(ownerId, true)];
  // Only events not yet over are shown on the board; the rest stay on the Calendar.
  const events = getCachedEvents(ownerId, true).filter((e) => e.allDay ? e.end > today : Date.parse(e.end) > Date.parse(now));
  return <ProjectsView projects={projects} tasks={getCachedTasks(ownerId, true)} events={events} timezone={timezone} now={now} />;
}
