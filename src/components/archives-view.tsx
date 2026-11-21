"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Folder, SquareCheck, Trash2 } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import type { DeletionPreview } from "@/lib/lifecycle";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { useConfirmation } from "./confirm-dialog";
import { useWorkspace } from "./workspace-store";

export function ArchivesView({
  initialTasks,
  initialProjects,
  projectNames,
}: {
  initialTasks: Task[];
  initialProjects: Project[];
  projectNames: Record<string, string>;
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const { confirm, confirmation } = useConfirmation();
  const [tasks, setTasks] = useState(initialTasks);
  const [projects, setProjects] = useState(initialProjects);
  const [error, setError] = useState("");

  async function restoreTask(t: Task) {
    setError("");
    const prev = tasks;
    setTasks((all) => all.filter((x) => x.id !== t.id));
    try {
      const response = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: t.revision,
          archived: false,
          mutationId: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not restore task.");
      workspace?.setTasks((all) => (all.some((x) => x.id === result.id) ? all : [...all, result]));
      notifyMutation(response, () => router.refresh(), { message: "Task restored." });
      router.refresh();
    } catch (failure) {
      setTasks(prev);
      setError(failure instanceof Error ? failure.message : "Could not restore task.");
    }
  }

  async function restoreProject(p: Project) {
    setError("");
    const prev = projects;
    setProjects((all) => all.filter((x) => x.id !== p.id));
    try {
      const response = await fetch(`/api/projects/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: p.revision,
          archived: false,
          mutationId: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not restore project.");
      workspace?.setProjects((all) => (all.some((x) => x.id === result.id) ? all : [...all, result]));
      notifyMutation(response, () => router.refresh(), { message: "Project restored." });
      router.refresh();
    } catch (failure) {
      setProjects(prev);
      setError(failure instanceof Error ? failure.message : "Could not restore project.");
    }
  }

  async function deleteItem(entityType: "task" | "project", id: string, name: string) {
    setError("");
    let preview: DeletionPreview;
    try {
      const res = await fetch(`/api/${entityType}s/${id}/deletion`);
      preview = await res.json();
      if (!res.ok) throw new Error((preview as unknown as { error: string }).error);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load deletion preview.");
      return;
    }
    const ok = await confirm({
      title: entityType === "task" ? "Delete task?" : "Delete project?",
      action: "Delete",
      description: `"${name}" will be deleted. You can undo this from the toast.`,
    });
    if (!ok) return;
    const prevTasks = tasks;
    const prevProjects = projects;
    if (entityType === "task") setTasks((all) => all.filter((x) => x.id !== id));
    else setProjects((all) => all.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/${entityType}s/${id}/deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...preview, mutationId: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      notifyMutation(res, () => router.refresh(), {
        message: entityType === "task" ? "Task deleted." : "Project deleted.",
      });
      router.refresh();
    } catch (failure) {
      setTasks(prevTasks);
      setProjects(prevProjects);
      setError(failure instanceof Error ? failure.message : "Could not delete.");
    }
  }

  const empty = tasks.length === 0 && projects.length === 0;

  return (
    <div className="page today-page">
      <header className="today-header">
        <div>
          <h1>Archives</h1>
        </div>
      </header>

      {error && (
        <p role="alert" className="error-message mb-4">
          {error}
        </p>
      )}

      {empty && <p className="muted">Nothing archived.</p>}

      {tasks.length > 0 && (
        <section className="today-section" aria-labelledby="archived-tasks-heading">
          <h2 id="archived-tasks-heading">Tasks</h2>
          <ul className="today-list">
            {tasks.map((t) => (
              <li key={t.id} className="today-row">
                <div className="today-row-body">
                  <SquareCheck size={15} className="timeline-icon" aria-hidden="true" />
                  <span className="task-title">{t.title}</span>
                  {t.projectId && projectNames[t.projectId] && (
                    <span className="today-meta">{projectNames[t.projectId]}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" onClick={() => void restoreTask(t)}>
                    <ArchiveRestore size={15} aria-hidden="true" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete ${t.title}`}
                    onClick={() => void deleteItem("task", t.id, t.title)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {projects.length > 0 && (
        <section className="today-section" aria-labelledby="archived-projects-heading">
          <h2 id="archived-projects-heading">Projects</h2>
          <ul className="today-list">
            {projects.map((p) => (
              <li key={p.id} className="today-row">
                <div className="today-row-body">
                  <Folder size={15} className="timeline-icon" aria-hidden="true" />
                  <span className="task-title">{p.name}</span>
                  <span className="today-meta">{p.status}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" onClick={() => void restoreProject(p)}>
                    <ArchiveRestore size={15} aria-hidden="true" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => void deleteItem("project", p.id, p.name)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmation}
    </div>
  );
}
