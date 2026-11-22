import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getCachedEvents, getCachedPreferences, getCachedProjects, getCachedTasks, getCachedWorkingHoursOverrides } from "@/lib/request-data";
import { dateInTimezone, dateOnlySchema } from "@/lib/dates";
import { ManualCalendar } from "@/components/manual-calendar";
import { EventForm } from "@/components/event-form";
import { EventSelection } from "@/components/event-selection";
import { TaskSelection } from "@/components/task-selection";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; event?: string; task?: string; focus?: string; schedule?: string; view?: string }> }) {
  const ownerId = await requireUserId(), db = getDatabase(), query = await searchParams;
  const preferences = getCachedPreferences(ownerId);
  const overrides = getCachedWorkingHoursOverrides(ownerId);
  const projects = getCachedProjects(ownerId), tasks = getCachedTasks(ownerId);
  const date = dateOnlySchema.safeParse(query.date).success ? query.date! : dateInTimezone(new Date().toISOString(), preferences.timezone);
  const allProjects = [...projects, ...getCachedProjects(ownerId, true)];
  return <div className="page"><header className="page-heading"><div><h1>Calendar</h1></div><EventForm projects={projects} tasks={tasks} timezone={preferences.timezone} /></header>
    <ManualCalendar
      projects={projects}
      tasks={tasks}
      events={getCachedEvents(ownerId)}
      timezone={preferences.timezone}
      weekStart={preferences.weekStart}
      workingHours={preferences.workingHours}
      taskTypeMinutes={preferences.taskTypeMinutes}
      workingHoursOverrides={overrides}
      date={date}
    />
    {query.event ? <EventSelection key={query.event} db={db} ownerId={ownerId} id={query.event} projects={allProjects} tasks={getCachedTasks(ownerId, true)} timezone={preferences.timezone} />
      : query.schedule === "1" ? null
      : <TaskSelection key={query.focus ?? query.task} db={db} ownerId={ownerId} id={query.focus ?? query.task} projects={allProjects} focus={Boolean(query.focus)} />}
  </div>;
}
