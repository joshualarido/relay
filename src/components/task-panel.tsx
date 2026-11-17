"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import type { DeletionPreview } from "@/lib/lifecycle";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { TaskForm } from "./task-form";

export function TaskPanel({ task, projects, focus }: { task: Task | null; projects: Project[]; focus: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const mutationId = useRef("");
  function close() {
    const query = new URLSearchParams(search);
    query.delete("task"); query.delete("focus");
    router.replace(`${path}${query.size ? `?${query}` : ""}`, { scroll: false });
  }
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !pending) close(); }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className={`form-dialog task-panel${focus ? " focus-panel" : ""}`}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        const trigger = task && document.querySelector<HTMLElement>(`[data-task-link="${CSS.escape(task.id)}"]`);
        (trigger || document.getElementById("main"))?.focus();
      }}>
      <Dialog.Title className={focus ? "text-2xl font-semibold mb-4" : "sr-only"}>{focus ? "Focus mode" : "Task details"}</Dialog.Title>
      <Dialog.Description className="muted mb-5">Saved task details. You can undo changes from the notification.</Dialog.Description>
      <Button variant="ghost" className="dialog-close" aria-label="Close task details" disabled={pending} onClick={close}><X size={20} /></Button>
      {!task ? <p>Task not found.</p> : <div className="stack">
        <h2 className="text-xl break-words">{task.title}</h2>
        <p className="muted">{task.status}{task.important ? " / Important" : ""}</p>
        <p className="whitespace-pre-wrap">{task.description || "No description yet."}</p>
        {task.projectId ? <Link className="text-primary" href={`/projects/${task.projectId}`} onClick={(e) => { if (pending) e.preventDefault(); }}>{projects.find((p) => p.id === task.projectId)?.name ?? "Project"}</Link> : <p className="muted">Inbox (unassigned)</p>}
        {task.dueDate && <p>Due <time dateTime={task.dueDate}>{task.dueDate}</time> (date only)</p>}
        {task.dueAt && <p>Due <time dateTime={task.dueAt}>{new Intl.DateTimeFormat("en-GB", { timeZone: task.timezone!, dateStyle: "medium", timeStyle: "short" }).format(new Date(task.dueAt))}</time> ({task.timezone})</p>}
        {task.completedAt && <p className="muted">Completed at <time dateTime={task.completedAt}>{task.completedAt}</time></p>}
        <p className="muted text-sm">Created {task.createdAt} / Updated {task.updatedAt}</p>
        <div className="flex flex-wrap gap-3"><TaskForm task={task} projects={projects} />
          {!focus && <Button variant="outline" disabled={pending} onClick={() => {
            const query = new URLSearchParams(search); query.delete("task"); query.set("focus", task.id);
            router.replace(`${path}?${query}`, { scroll: false });
          }}>Focus on this task</Button>}
          {task.status === "Done" && <Button variant="outline" disabled={pending} onClick={async () => {
            setPending(true); setError("");
            try {
              const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expectedRevision: task.revision, status: "To do", mutationId: crypto.randomUUID() }) });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              notifyMutation(response, () => router.refresh()); router.refresh();
            } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Try again."); }
            finally { setPending(false); }
          }}>Reopen task</Button>}
          <Button variant="destructive" disabled={pending} onClick={async () => {
            setPending(true); setError("");
            try {
              const response = await fetch(`/api/tasks/${task.id}/deletion`);
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              mutationId.current = crypto.randomUUID(); setPreview(result);
            } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load preview."); }
            finally { setPending(false); }
          }}>Delete task</Button>
        </div>
        {error && <p role="alert" className="error-message">{error}</p>}
      </div>}
      <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => { if (!open && !pending) setPreview(null); }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="form-dialog">
          <Dialog.Title className="text-xl font-semibold">Delete task?</Dialog.Title>
          <Dialog.Description className="muted mt-3">These records will be deleted together. You can undo this from the notification.</Dialog.Description>
          <ul className="preview-list">{preview?.records.map((r) => <li key={r.id}>{r.label}<span className="muted">{r.entityType}</span></li>)}</ul>
          {error && <p role="alert" className="error-message">{error}</p>}
          <div className="form-actions"><Button variant="outline" disabled={pending} onClick={() => setPreview(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={async () => {
              setPending(true); setError("");
              try {
                const response = await fetch(`/api/tasks/${task!.id}/deletion`, { method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...preview, mutationId: mutationId.current }) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                setPreview(null); close(); notifyMutation(response, () => router.refresh()); router.refresh();
              } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Retry with this preview."); }
              finally { setPending(false); }
            }}>{pending ? "Deleting..." : "Confirm soft deletion"}</Button>
          </div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
