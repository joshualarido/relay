import type { AppDatabase } from "@/lib/db";
import type { Project, Task } from "@/lib/db/schema";
import { getTask } from "@/lib/tasks";
import { AppError } from "@/lib/errors";
import { TaskPanel } from "./task-panel";

export function TaskSelection({ db, ownerId, id, projects, focus = false }: { db: AppDatabase; ownerId: string; id?: string; projects: Project[]; focus?: boolean }) {
  if (!id) return null;
  let task: Task | null = null;
  try { task = getTask(db, ownerId, id); }
  catch (error) {
    if (!(error instanceof AppError && error.status === 404)) throw error;
  }
  return <TaskPanel task={task} projects={projects} focus={focus} />;
}
