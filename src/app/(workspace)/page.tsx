import { Temporal } from "temporal-polyfill";
import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getCachedPreferences, getCachedProjects, getCachedTasks } from "@/lib/request-data";
import { advanceMissedRecurringTasks } from "@/services/tasks";
import { todayTimeline } from "@/lib/today";
import { formatMinutes } from "@/lib/capacity";
import { TodayGlance } from "@/components/today-glance";
import { TodayTimeline } from "@/components/today-timeline";
import { TodayQueue } from "@/components/today-queue";
import { TodayShortcuts } from "@/components/today-due-list";
import { TodayProgress } from "@/components/today-progress";
import { CatchUp } from "@/components/catch-up";
import { DayClear } from "@/components/day-clear";
import { TodaySwap } from "@/components/today-swap";
import { TaskSelection } from "@/components/task-selection";
import { EventSelection } from "@/components/event-selection";
import { CaptureButton } from "@/components/capture-dialog";

export default async function TodayPage({ searchParams }: {
  searchParams: Promise<{ task?: string; focus?: string; event?: string; occurrence?: string }>;
}) {
  const ownerId = await requireUserId(), db = getDatabase(), query = await searchParams;
  const prefs = getCachedPreferences(ownerId);
  const timezone = prefs.timezone;
  const nowIso = new Date().toISOString();
  const todayDate = Temporal.Instant.from(nowIso).toZonedDateTimeISO(timezone).toPlainDate().toString();
  advanceMissedRecurringTasks(db, ownerId, todayDate);

  const day = todayTimeline(db, ownerId, timezone, nowIso);
  const start = Temporal.PlainDate.from(day.today).toZonedDateTime({ timeZone: timezone });
  const tomorrow = start.add({ days: 1 });
  const projects = getCachedProjects(ownerId);
  const allProjects = [...projects, ...getCachedProjects(ownerId, true)];
  const allTasks = getCachedTasks(ownerId, true);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day.today}T12:00:00Z`));
  const todayTasks = [...day.overdue, ...day.tasks];

  return <div className="page today-page">
    <TodayShortcuts tasks={todayTasks} />
    <header className="today-header">
      <div><p className="today-eyebrow">{dateLabel}</p><h1>Today</h1></div>
      {day.dayState !== "empty" && <CaptureButton />}
    </header>
    <TodayGlance day={day} timezone={timezone} projectNames={projectNames} />
    <div className="today-layout">
      <div className="today-primary">
        {day.overdue.length > 0 && <CatchUp tasks={day.overdue} today={day.today} tomorrow={tomorrow.toPlainDate().toString()} timezone={timezone} />}
        {day.schedule.length > 0 && <TodayTimeline items={day.schedule} timezone={timezone} dayStart={start.epochMilliseconds} dayEnd={tomorrow.epochMilliseconds} />}
        <TodaySwap state={day.dayState}>
        {day.dayState === "empty" ? (
          <div className="today-empty"><p>Nothing planned today</p><CaptureButton /></div>
        ) : day.dayState === "clear" ? (
          <DayClear day={day.today} tasksDone={day.tasks.length} doneLabel={formatMinutes(day.capacity.completedMinutes)} />
        ) : day.tasks.length > 0 ? (
          <TodayQueue
            today={day.today}
            tasks={day.tasks}
            projectNames={projectNames}
            taskTypeMinutes={day.taskTypeMinutes}
            timezone={timezone}
          />
        ) : null}
        </TodaySwap>
      </div>
      <aside className="today-secondary" aria-label="Progress">
        <TodayProgress tasks={allTasks} projects={projects} timezone={timezone} now={nowIso} />
      </aside>
    </div>
    {query.event ? <EventSelection key={`${query.event}:${query.occurrence ?? ""}`} db={db} ownerId={ownerId} id={query.event} occurrenceDate={query.occurrence} projects={allProjects} tasks={allTasks} timezone={timezone} />
      : <TaskSelection key={query.focus ?? query.task} db={db} ownerId={ownerId} id={query.focus ?? query.task} focus={Boolean(query.focus)} projects={allProjects} />}
  </div>;
}
