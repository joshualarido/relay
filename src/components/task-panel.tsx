"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, CalendarClock, CalendarDays, Check, CircleDot, Folder, Gauge, Repeat, SquareCheck, Star, Timer, X } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import { taskColumns } from "@/lib/project-board";

const taskTypeOptions: Array<{ value: Task["taskType"]; label: string }> = [
  { value: "Instant", label: "Instant · 15m" },
  { value: "Medium", label: "Medium · 45m" },
  { value: "Deep", label: "Deep · 1.5h" },
];
import { notifyMutation } from "./mutation-notice";
import { InlineText } from "./projects/inline-text";
import { DEFAULT_TASK_TYPE_MINUTES } from "@/lib/capacity";
import { DurationField } from "./duration-field";
import { RecurrencePicker } from "./recurrence-picker";
import { useWorkspace } from "./workspace-store";

function relativeTime(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (diff < 1) return "Updated just now";
  if (diff < 60) return `Updated ${diff}m ago`;
  const hrs = Math.floor(diff / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  return `Updated ${Math.floor(hrs / 24)}d ago`;
}

export function TaskPanel({ task, projects }: { task: Task | null; projects: Project[]; focus?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const workspace = useWorkspace();
  const [localTask, setLocalTask] = useState(task);
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const current = localTask;

  function close() {
    setOpen(false);
    window.setTimeout(() => {
      const query = new URLSearchParams(search);
      query.delete("task");
      query.delete("focus");
      router.replace(`${path}${query.size ? `?${query}` : ""}`, { scroll: false });
    }, 155);
  }

  async function patch(fields: Record<string, unknown>, message: string) {
    if (!current) return false;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: current.revision, ...fields, mutationId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save task.");
      setLocalTask(result as Task);
      workspace?.setTasks((all) => all.map((t) => (t.id === current.id ? (result as Task) : t)));
      notifyMutation(response, () => router.refresh(), { message });
      router.refresh();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save task.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    if (!current) return;
    workspace?.setTasks((all) => all.filter((t) => t.id !== current.id));
    close();
    try {
      const response = await fetch(`/api/tasks/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: current.revision, archived: true, mutationId: crypto.randomUUID() }),
      });
      if (response.ok) {
        notifyMutation(response, () => router.refresh(), { message: "Task archived." });
        router.refresh();
      }
    } catch {}
  }

  const activeProjects = projects.filter((p) => !p.archivedAt || p.id === current?.projectId);
  const dateValue = current?.executionDate ?? "";

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !pending) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content
          className="detail-sheet"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const trigger = current && document.querySelector<HTMLElement>(`[data-task-link="${CSS.escape(current.id)}"]`);
            (trigger || document.getElementById("main"))?.focus();
          }}
        >
          <Dialog.Close className="icon-button sheet-close" aria-label="Close task details" disabled={pending}>
            <X size={18} aria-hidden="true" />
          </Dialog.Close>

          {!current ? (
            <p className="muted">Task not found.</p>
          ) : (
            <>
              <div className="detail-header">
                <div className="detail-kicker">
                  <span className="detail-badge">
                    <SquareCheck size={12} aria-hidden="true" />
                    Task
                  </span>
                  <button
                    type="button"
                    className="detail-complete-pill"
                    data-done={current.status === "Done" || undefined}
                    disabled={pending}
                    onClick={() =>
                      void patch(
                        { status: current.status === "Done" ? "To do" : "Done" },
                        current.status === "Done" ? "Task reopened." : "Task completed.",
                      )
                    }
                  >
                    <Check size={13} aria-hidden="true" />
                    {current.status === "Done" ? "Completed" : "Mark done"}
                  </button>
                </div>
                <Dialog.Title asChild>
                  <h2 className="sheet-title">
                    <InlineText
                      value={current.title}
                      label="task title"
                      required
                      onSave={(title) => patch({ title }, "Task renamed.")}
                    />
                  </h2>
                </Dialog.Title>
              </div>

              <div className="detail-props">
                <div className="detail-prop-row">
                  <span className="detail-prop-label">
                    <CircleDot size={14} aria-hidden="true" />
                    Status
                  </span>
                  <div className="detail-prop-value">
                    <div className="view-switch" role="group" aria-label="Status">
                      {taskColumns.map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={current.status === s}
                          disabled={pending}
                          onClick={() => s !== current.status && void patch({ status: s }, `Moved to ${s}.`)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="detail-prop-row">
                  <span className="detail-prop-label">
                    <Gauge size={14} aria-hidden="true" />
                    Type
                  </span>
                  <div className="detail-prop-value">
                    <div className="view-switch" role="group" aria-label="Task type">
                      {taskTypeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={current.taskType === opt.value}
                          disabled={pending}
                          onClick={() => opt.value !== current.taskType && void patch({ taskType: opt.value }, `Type set to ${opt.value}.`)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="detail-prop-row">
                  <label className="detail-prop-label" htmlFor="task-sheet-duration">
                    <Timer size={14} aria-hidden="true" />
                    Duration
                  </label>
                  <div className="detail-prop-value">
                    <DurationField
                      id="task-sheet-duration"
                      key={current.id}
                      value={current.durationMinutes ?? null}
                      defaultMinutes={(workspace?.taskTypeMinutes ?? DEFAULT_TASK_TYPE_MINUTES)[current.taskType]}
                      disabled={pending}
                      onCommit={(durationMinutes) =>
                        void patch(
                          { durationMinutes },
                          durationMinutes ? "Duration set." : "Duration reset to the type default.",
                        )
                      }
                    />
                  </div>
                </div>

                <div className="detail-prop-row">
                  <label className="detail-prop-label" htmlFor="task-sheet-date">
                    <CalendarDays size={14} aria-hidden="true" />
                    Execution date
                  </label>
                  <div className="detail-prop-value">
                    <input
                      id="task-sheet-date"
                      type="date"
                      key={`${current.id}-${dateValue}`}
                      defaultValue={dateValue}
                      disabled={pending}
                      onBlur={(e) => {
                        const val = e.target.value || null;
                        if (val === (dateValue || null)) return;
                        void patch(
                          { executionDate: val },
                          val ? "Execution date set." : "Execution date cleared.",
                        );
                      }}
                    />
                  </div>
                </div>

                <div className="detail-prop-row">
                  <span className="detail-prop-label">
                    <Repeat size={14} aria-hidden="true" />
                    Repeat
                  </span>
                  <div className="detail-prop-value">
                    <RecurrencePicker
                      value={current.recurrenceRule ?? null}
                      disabled={pending}
                      compact
                      onChange={(recurrenceRule) =>
                        void patch(
                          { recurrenceRule },
                          recurrenceRule ? "Recurrence updated." : "Recurrence removed.",
                        )
                      }
                    />
                  </div>
                </div>

                <div className="detail-prop-row">
                  <label className="detail-prop-label" htmlFor="task-sheet-project">
                    <Folder size={14} aria-hidden="true" />
                    Project
                  </label>
                  <div className="detail-prop-value">
                    <select
                      id="task-sheet-project"
                      value={current.projectId ?? ""}
                      disabled={pending}
                      onChange={(e) => {
                        const projectId = e.target.value || null;
                        void patch({ projectId }, projectId ? "Moved to project." : "Moved to No project.");
                      }}
                    >
                      <option value="">No project</option>
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="detail-prop-row">
                  <span className="detail-prop-label">
                    <Star size={14} aria-hidden="true" />
                    Important
                  </span>
                  <div className="detail-prop-value">
                    <button
                      type="button"
                      className="toggle-button"
                      aria-pressed={Boolean(current.important)}
                      disabled={pending}
                      onClick={() =>
                        void patch(
                          { important: !current.important },
                          current.important ? "Unmarked important." : "Marked important.",
                        )
                      }
                    >
                      <Star size={14} aria-hidden="true" />
                      {current.important ? "Important" : "Mark important"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="detail-notes-section">
                <span className="sheet-label">Notes</span>
                <InlineText
                  className="sheet-notes"
                  value={current.description}
                  label="task notes"
                  multiline
                  placeholder="Add notes…"
                  onSave={(description) => patch({ description }, "Notes saved.")}
                />
              </div>

              {error && (
                <p role="alert" className="error-message text-sm">
                  {error}
                </p>
              )}

              <div className="sheet-actions detail-footer">
                <Link className="text-quiet inline-flex items-center gap-1.5" href={`/calendar?schedule=1&task=${current.id}`}>
                  <CalendarClock size={14} aria-hidden="true" />
                  Schedule
                </Link>
                <button type="button" className="text-quiet inline-flex items-center gap-1.5" onClick={() => void archive()}>
                  <Archive size={14} aria-hidden="true" />
                  Archive
                </button>
                <span className="muted text-sm ml-auto">{relativeTime(current.updatedAt)}</span>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
