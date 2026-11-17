import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { listTasks } from "@/lib/tasks";
import { TaskForm } from "@/components/task-form";
import { TaskBoard } from "@/components/task-board";
import { TaskSelection } from "@/components/task-selection";
import { dependencyWarnings } from "@/lib/dependencies";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ task?: string; focus?: string }> }) {
  const ownerId = await requireUserId();
  const db = getDatabase();
  const projects = [...listProjects(db, ownerId), ...listProjects(db, ownerId, true)];
  const query = await searchParams, selection = query.focus ?? query.task;
  const tasks = listTasks(db, ownerId).filter((t) => t.projectId === null);
  return <div className="page"><header className="page-heading"><div><h1>Inbox</h1><p>A landing place for unassigned tasks.</p></div><TaskForm projects={projects} /></header>
    <TaskBoard tasks={tasks} projectId={null} warnings={Object.fromEntries(tasks.map((t) => [t.id, dependencyWarnings(db, ownerId, t.id)]))} />
    <TaskSelection key={selection} db={db} ownerId={ownerId} id={selection} projects={projects} focus={Boolean(query.focus)} />
  </div>;
}
