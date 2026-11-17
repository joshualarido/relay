import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { listEvents } from "@/lib/events";
import { getPreferences } from "@/lib/preferences";
import { dateInTimezone, dateOnlySchema } from "@/lib/dates";
import { ManualCalendar } from "@/components/manual-calendar";
import { EventForm } from "@/components/event-form";
import { EventSelection } from "@/components/event-selection";
import { TaskSelection } from "@/components/task-selection";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; event?: string; task?: string; focus?: string }> }) {
  const ownerId = await requireUserId(), db = getDatabase(), query = await searchParams;
  const preferences = getPreferences(db, ownerId);
  const projects = listProjects(db, ownerId), tasks = listTasks(db, ownerId);
  const date = dateOnlySchema.safeParse(query.date).success ? query.date! : dateInTimezone(new Date().toISOString(), preferences.timezone);
  const allProjects = [...projects, ...listProjects(db, ownerId, true)];
  return <div className="page"><header className="page-heading"><div><h1>Calendar</h1><p>Deadlines and time commitments, together.</p></div><EventForm projects={projects} tasks={tasks} timezone={preferences.timezone} /></header>
    <ManualCalendar projects={projects} tasks={tasks} events={listEvents(db, ownerId)} timezone={preferences.timezone} weekStart={preferences.weekStart} date={date} />
    {query.event ? <EventSelection key={query.event} db={db} ownerId={ownerId} id={query.event} projects={allProjects} tasks={listTasks(db, ownerId, true)} timezone={preferences.timezone} />
      : <TaskSelection key={query.focus ?? query.task} db={db} ownerId={ownerId} id={query.focus ?? query.task} projects={allProjects} focus={Boolean(query.focus)} />}
  </div>;
}
