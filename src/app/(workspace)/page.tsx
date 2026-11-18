import Link from "next/link";
import { Temporal } from "temporal-polyfill";
import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getPreferences } from "@/lib/preferences";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { summarySentence, todayTimeline } from "@/lib/today";
import { TaskComplete } from "@/components/task-complete";
import { TodayTimeline } from "@/components/today-timeline";
import { CatchUp } from "@/components/catch-up";
import { TaskSelection } from "@/components/task-selection";
import { EventSelection } from "@/components/event-selection";

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
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day.today}T12:00:00Z`));

  return <div className="page today-page">
    <header className="today-header">
      <div><h1>Today</h1><p className="today-summary"><span>{dateLabel}</span> · <span>{summarySentence(day.summary, day.dayState)}</span></p></div>
    </header>
    {day.overdue.length > 0 && <CatchUp tasks={day.overdue} today={day.today} tomorrow={tomorrow.toPlainDate().toString()} />}
    {day.dueUnscheduled.length > 0 && <section className="today-section" aria-labelledby="due-today-heading">
      <h2 id="due-today-heading">Due today</h2>
      <ul className="today-list">{day.dueUnscheduled.map((task) => <li className="today-row" key={task.id}>
        <TaskComplete task={task} />
        <div className="today-row-body"><Link className="task-title" data-task-link={task.id} href={`/?task=${task.id}`} scroll={false}>{task.title}</Link>
          {projectName(task.projectId) && <span className="today-meta">{projectName(task.projectId)}</span>}</div>
        <Link className="today-quiet-action" href="/calendar">Schedule<span className="sr-only"> {task.title}</span></Link>
      </li>)}</ul>
    </section>}
    {day.dayState === "empty" ? <p className="today-empty">Nothing planned today</p>
      : day.dayState === "clear" ? <div className="day-clear" role="status">
        <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><circle cx="12" cy="12" r="10.5" /><path d="M7 12.5l3.2 3.2L17 9" /></svg>
        <p>Day clear</p>
      </div>
      : <TodayTimeline items={day.items} timezone={timezone} dayStart={start.epochMilliseconds} dayEnd={tomorrow.epochMilliseconds} />}
    {query.event ? <EventSelection key={query.event} db={db} ownerId={ownerId} id={query.event} projects={allProjects} tasks={listTasks(db, ownerId, true)} timezone={timezone} />
      : <TaskSelection key={query.focus ?? query.task} db={db} ownerId={ownerId} id={query.focus ?? query.task} focus={Boolean(query.focus)} projects={allProjects} />}
  </div>;
}
