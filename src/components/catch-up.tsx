"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { dateInTimezone } from "@/lib/dates";

/** One collapsed line for overdue tasks; expands in place to move each one to a new date. */
export function CatchUp({ tasks, today, tomorrow, timezone }: { tasks: Task[]; today: string; tomorrow: string; timezone: string }) {
  const [open, setOpen] = useState(false), id = useId();
  return <section className="today-section catch-up" aria-label="Overdue">
    <button type="button" className="catch-up-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span className="catch-up-count">{tasks.length} overdue</span> · Review<ChevronDown size={15} aria-hidden="true" />
    </button>
    <ul id={id} className="today-list" hidden={!open}>
      {tasks.map((task) => <CatchUpRow key={task.id} task={task} today={today} tomorrow={tomorrow} timezone={timezone} />)}
    </ul>
  </section>;
}

const dueText = (task: Task, timezone: string) => {
  const dateStr = task.executionDate ?? task.dueDate ?? (task.dueAt ? dateInTimezone(task.dueAt, timezone) : null);
  if (!dateStr) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${dateStr}T12:00:00Z`));
};

function CatchUpRow({ task, today, tomorrow, timezone }: { task: Task; today: string; tomorrow: string; timezone: string }) {
  const router = useRouter(), inputId = useId();
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [picking, setPicking] = useState(false);
  async function move(executionDate: string) {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: task.revision,
          executionDate,
          ...(task.dueDate && { dueDate: null }),
          ...(task.dueAt && { dueAt: null, timezone: null }),
          mutationId: crypto.randomUUID(),
        }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || Object.values(result.fields ?? {}).flat().join(" ") || "Could not move task. Try again.");
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not move task. Try again."); }
    finally { setPending(false); }
  }
  return <li className="today-row catch-up-row" data-task-row={task.id}>
    <div className="today-row-body">
      <Link className="task-title" data-task-link={task.id} href={`/?task=${task.id}`} title="Edit task (E)" scroll={false}>{task.title}</Link>
      <span className="today-meta">Planned {dueText(task, timezone)}</span>
    </div>
    <div className="catch-up-actions" role="group" aria-label={`Move ${task.title}`}>
      <Button variant="ghost" disabled={pending} onClick={() => move(today)}>Today</Button>
      <Button variant="ghost" disabled={pending} onClick={() => move(tomorrow)}>Tomorrow</Button>
      {picking
        ? <form className="catch-up-pick" onSubmit={(e) => { e.preventDefault(); const value = String(new FormData(e.currentTarget).get("date")); if (value) void move(value); }}>
          <label className="sr-only" htmlFor={inputId}>New due date for {task.title}</label>
          <input id={inputId} name="date" type="date" min={today} defaultValue={tomorrow} required autoFocus disabled={pending} />
          <Button type="submit" variant="outline" disabled={pending}>Move</Button>
        </form>
        : <Button variant="ghost" disabled={pending} onClick={() => setPicking(true)}>Pick date</Button>}
    </div>
    {error && <p role="alert" className="error-message text-sm today-row-error">{error}</p>}
  </li>;
}
