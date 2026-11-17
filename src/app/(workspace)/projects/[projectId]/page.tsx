import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getProject, getProjectProgress, listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { listEvents } from "@/lib/events";
import { dateInTimezone } from "@/lib/dates";
import { getPreferences } from "@/lib/preferences";
import { AppError } from "@/lib/errors";
import { ProjectForm } from "@/components/project-form";
import { ProjectActions } from "@/components/project-actions";
import { TaskForm } from "@/components/task-form";
import { TaskBoard } from "@/components/task-board";
import { TaskSelection } from "@/components/task-selection";
import { listCheckIns } from "@/lib/check-ins";
import { CheckIns } from "@/components/check-ins";
import { dependencyWarnings } from "@/lib/dependencies";
import { listActivity } from "@/lib/activity";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ task?: string; focus?: string }> }) {
  const userId = await requireUserId();
  const { projectId } = await params;
  let project;
  try { project = getProject(getDatabase(), userId, projectId); }
  catch (error) { if (error instanceof AppError && error.status === 404) notFound(); throw error; }
  const db = getDatabase();
  const projects = [...listProjects(db, userId), ...listProjects(db, userId, true)];
  const progress = getProjectProgress(db, userId, projectId);
  const query = await searchParams, selection = query.focus ?? query.task;
  const tasks = listTasks(db, userId, true).filter((t) => t.projectId === projectId);
  const taskIds = new Set(tasks.map((t) => t.id));
  const events = listEvents(db, userId, true).filter((e) => e.projectId === projectId || (e.taskId && taskIds.has(e.taskId)));
  const timezone = getPreferences(db, userId).timezone;
  const recentActivity = listActivity(db, userId).filter((a) => [...a.beforeState, ...a.afterState].some((s) =>
    (s.entityType === "project" && s.record.id === projectId) ||
    ("projectId" in s.record && s.record.projectId === projectId) ||
    ("taskId" in s.record && s.record.taskId && taskIds.has(s.record.taskId)) ||
    ("prerequisiteId" in s.record && taskIds.has(s.record.prerequisiteId)))).slice(0, 6);
  return <div className="page">
    <Link className="muted text-sm inline-block mb-6" href="/projects">All projects</Link>
    <header className="page-heading"><div><h1 className="break-words">{project.name}</h1><p>{project.archivedAt ? "Archived project" : "Project overview"}</p></div><ProjectForm project={project} /></header>
    <section className="section project-overview">
      <div className="stack"><div className="flex flex-wrap gap-5"><span className="status-label">{project.status}</span><span className="muted">{progress.percent}% complete</span>{project.deadline && <span className="muted">Deadline <time dateTime={project.deadline}>{project.deadline}</time></span>}</div>
      <progress value={progress.done} max={progress.total || 1} aria-label="Project progress" />
      <p className="whitespace-pre-wrap">{project.description || "No description yet."}</p></div>
      <div><ProjectActions project={project} /></div>
    </section>
    <section className="section stack"><div className="flex flex-wrap justify-between gap-4"><h2>Tasks</h2><TaskForm projects={projects} projectId={projectId} /></div>
      {project.archivedAt && <p className="notice">Archived project: tasks retain their statuses and are hidden from active work.</p>}
      <TaskBoard tasks={tasks} projectId={projectId} warnings={Object.fromEntries(tasks.map((t) => [t.id, dependencyWarnings(db, userId, t.id)]))} />
    </section>
    <div className="detail-grid"><section className="section stack"><h2>Related events</h2>
      {events.length ? <ul className="stack">{events.map((event) => <li key={event.id}><Link className="text-primary" href={`/calendar?event=${event.id}&date=${event.allDay ? event.start : dateInTimezone(event.start, timezone)}`}>{event.title}</Link><p className="muted text-sm">{event.allDay ? event.start : new Intl.DateTimeFormat("en-GB", { timeZone: event.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(event.start))} / {event.timezone}</p></li>)}</ul>
        : <p className="muted">No linked events yet.</p>}
      <Link className="text-primary" href="/calendar">Manage events in Calendar</Link>
    </section>
    <CheckIns projectId={projectId} entries={listCheckIns(db, userId, { projectId })} />
    </div>
    <TaskSelection key={selection} db={db} ownerId={userId} id={selection} projects={projects} focus={Boolean(query.focus)} />
    <section className="section stack"><h2>Recent activity</h2>
      <ul className="work-list">{recentActivity.map((entry) => <li key={entry.id}><span>{entry.action} / {entry.entityType}</span><p className="muted text-sm"><time dateTime={entry.createdAt}>{entry.createdAt}</time></p></li>)}</ul>
      <Link className="text-primary" href="/history">Inspect changes and recovery in History</Link>
    </section>
  </div>;
}
