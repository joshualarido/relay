import Link from "next/link";
import { AlertTriangle, CalendarDays, Check } from "lucide-react";
import { currentSession, requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import type { Task } from "@/lib/db/schema";
import { getPreferences } from "@/lib/preferences";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { listEvents } from "@/lib/events";
import { dateInTimezone, dateOnlySchema } from "@/lib/dates";
import { homeData } from "@/lib/workbench";
import { priorityLabel } from "@/lib/priority";
import { QuickCapture } from "@/components/quick-capture";
import { ManualCalendar } from "@/components/manual-calendar";
import { TaskComplete } from "@/components/task-complete";
import { TaskSelection } from "@/components/task-selection";
import { EventSelection } from "@/components/event-selection";

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ task?: string; focus?: string; event?: string; date?: string; captureDate?: string }>;
}) {
  const ownerId = await requireUserId(), db = getDatabase(), query = await searchParams;
  const preferences = getPreferences(db, ownerId), timezone = preferences.timezone;
  const data = homeData(db, ownerId, timezone);
  const today = dateInTimezone(new Date().toISOString(), timezone);
  const date = dateOnlySchema.safeParse(query.date).success ? query.date! : today;
  const captureDate = dateOnlySchema.safeParse(query.captureDate).success ? query.captureDate! : "";
  const projects = listProjects(db, ownerId);
  const allProjects = [...projects, ...listProjects(db, ownerId, true)];
  const session = await currentSession();
  const overdue = new Set(data.overdue.map((task) => task.id));
  const currentDay = data.todayTasks.filter((task) => !overdue.has(task.id));
  const taskHref = (task: Task) => `${task.projectId ? `/projects/${task.projectId}` : "/inbox"}?task=${task.id}`;
  const dateText = (value: string) => value.length === 10
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
  function taskRows(tasks: typeof data.todayTasks, label: string) {
    return tasks.length ? <ul className="work-list divided-list">{tasks.map((task) => <li className={`today-task${task.status === "Done" ? " is-done" : ""}`} key={task.id}>
      <div className="today-task-check">{task.status === "Done" ? <span className="complete-mark" aria-label="Completed"><Check size={18} aria-hidden="true" /></span> : <TaskComplete task={task} />}</div>
      <div className="today-task-body"><Link className="task-title" data-task-link={task.id} href={taskHref(task)}>{task.title}</Link>
        <p className="muted text-sm">{label} / {projects.find((project) => project.id === task.projectId)?.name ?? "Inbox"} / {priorityLabel(task)}</p>
        <p className="muted text-sm">{task.plannedDate ? `Planned ${dateText(task.plannedDate)}` : ""}{task.plannedDate && (task.dueDate || task.dueAt) ? " / " : ""}{task.dueDate || task.dueAt ? `Due ${dateText((task.dueDate ?? task.dueAt)!)}` : ""}</p>
        {(task.status === "Blocked" || task.blockerReason || task.warnings.length > 0) && <p className="error-message text-sm">{task.status === "Blocked" ? "Blocked. " : ""}{task.blockerReason} {task.warnings.join(" ")}</p>}
      </div>
    </li>)}</ul> : <p className="muted">Nothing here yet. Capture a task or plan one on the calendar.</p>;
  }
  return <div className="page home-page">
    <header className="home-heading"><div><h1>Today</h1><p>{session?.user.name.split(" ")[0]}&apos;s daily workspace / {dateText(today)}</p></div><Link className="home-calendar-link" href="/calendar"><CalendarDays size={17} aria-hidden="true" />Detailed calendar</Link></header>
    <div className="home-workbench">
      <div className="home-left">
        <section className="section quick-capture-card"><QuickCapture key={captureDate} projects={projects} tasks={data.tasks} timezone={timezone} initialDate={captureDate} /></section>
        <section className="section today-card" aria-labelledby="today-tasks-heading">
          <div className="card-heading"><h2 id="today-tasks-heading"><CalendarDays size={20} aria-hidden="true" />Today&apos;s tasks</h2><span className="progress-count">{data.todayProgress.done}/{data.todayProgress.total} complete</span></div>
          {data.overdue.length > 0 && <section className="today-group" aria-labelledby="overdue-heading"><div className="today-group-heading"><h3 id="overdue-heading"><AlertTriangle size={16} aria-hidden="true" />Overdue</h3><span className="badge badge-danger">{data.overdue.length}</span></div>{taskRows(data.todayTasks.filter((task) => overdue.has(task.id)), "Overdue")}</section>}
          <section className="today-group" aria-labelledby="today-heading"><div className="today-group-heading"><h3 id="today-heading">Planned and due today</h3><span className="muted text-sm">{currentDay.length} tasks</span></div>{taskRows(currentDay, "Today")}</section>
        </section>
      </div>
      <ManualCalendar home projects={projects} tasks={data.tasks} events={listEvents(db, ownerId)} timezone={timezone} weekStart={preferences.weekStart} date={date} />
    </div>
    {query.event ? <EventSelection key={query.event} db={db} ownerId={ownerId} id={query.event} projects={allProjects} tasks={listTasks(db, ownerId, true)} timezone={timezone} />
      : <TaskSelection key={query.focus ?? query.task} db={db} ownerId={ownerId} id={query.focus ?? query.task} focus={Boolean(query.focus)} projects={allProjects} />}
  </div>;
}
