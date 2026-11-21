import { Temporal } from "temporal-polyfill";
import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getPreferences } from "@/lib/preferences";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { summarySentence, todayTimeline } from "@/lib/today";
import { TodayTimeline } from "@/components/today-timeline";
import { TodayDueList, TodayShortcuts } from "@/components/today-due-list";
import { CatchUp } from "@/components/catch-up";
import { DayClear } from "@/components/day-clear";
import { TaskSelection } from "@/components/task-selection";
import { EventSelection } from "@/components/event-selection";
import { CaptureButton } from "@/components/capture-dialog";

export default async function TodayPage({ searchParams }: {
  searchParams: Promise<{ task?: string; focus?: string; event?: string }>;
}) {
  const ownerId = await requireUserId(), db = getDatabase(), query = await searchParams;
  const timezone = getPreferences(db, ownerId).timezone;
  const day = todayTimeline(db, ownerId, timezone);
  const start = Temporal.PlainDate.from(day.today).toZonedDateTime({ timeZone: timezone });
  const tomorrow = start.add({ days: 1 });
  const projects = listProjects(db, ownerId);
  const allProjects = [...projects, ...listProjects(db, ownerId, true)];
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day.today}T12:00:00Z`));
  const todayTasks = [
    ...day.overdue,
    ...day.dueUnscheduled,
    ...day.items.flatMap((item) => (item.kind === "task-block" && item.task ? [item.task] : [])),
  ];

  return <div className="page today-page">
    <TodayShortcuts tasks={todayTasks} />
    <header className="today-header">
      <div><h1>Today</h1><p className="today-summary"><span>{dateLabel}</span>{day.dayState === "active" && <> · <span>{summarySentence(day.summary, day.dayState)}</span></>}</p></div>
      {day.dayState !== "empty" && <CaptureButton />}
    </header>
    {day.overdue.length > 0 && <CatchUp tasks={day.overdue} today={day.today} tomorrow={tomorrow.toPlainDate().toString()} timezone={timezone} />}
    {day.dueUnscheduled.length > 0 && <section className="today-section" aria-labelledby="due-today-heading">
      <h2 id="due-today-heading">Due today</h2>
      <TodayDueList tasks={day.dueUnscheduled} projectNames={projectNames} timezone={timezone} />
    </section>}
    {day.dayState === "empty" ? <div className="today-empty"><p>Nothing planned today</p><CaptureButton /></div>
      : day.dayState === "clear" ? <DayClear day={day.today} />
      : <TodayTimeline items={day.items} timezone={timezone} dayStart={start.epochMilliseconds} dayEnd={tomorrow.epochMilliseconds} />}
    {query.event ? <EventSelection key={query.event} db={db} ownerId={ownerId} id={query.event} projects={allProjects} tasks={listTasks(db, ownerId, true)} timezone={timezone} />
      : <TaskSelection key={query.focus ?? query.task} db={db} ownerId={ownerId} id={query.focus ?? query.task} focus={Boolean(query.focus)} projects={allProjects} />}
  </div>;
}
