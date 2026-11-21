import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { listArchivedTasks } from "@/lib/tasks";
import { ArchivesView } from "@/components/archives-view";

export default async function ArchivesPage() {
  const ownerId = await requireUserId();
  const db = getDatabase();
  const allProjects = listProjects(db, ownerId, true);
  const archivedProjects = allProjects.filter((p) => Boolean(p.archivedAt));
  const archivedTasks = listArchivedTasks(db, ownerId);
  const projectNames = Object.fromEntries(allProjects.map((p) => [p.id, p.name]));

  return (
    <ArchivesView
      initialTasks={archivedTasks}
      initialProjects={archivedProjects}
      projectNames={projectNames}
    />
  );
}
