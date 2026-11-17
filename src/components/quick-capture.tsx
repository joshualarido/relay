"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { EventForm } from "./event-form";

type CaptureKind = "task" | "project" | "event";

export function QuickCapture({ projects = [], tasks = [], timezone, initialDate = "", onSaved, onPendingChange }: {
  projects?: Project[]; tasks?: Task[]; timezone?: string; initialDate?: string;
  onSaved?: () => void; onPendingChange?: (pending: boolean) => void;
}) {
  const [kind, setKind] = useState<CaptureKind>("task");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [eventDraft, setEventDraft] = useState<{ title: string; date: string } | null>(null);
  const identity = useRef({ payload: "", id: "" });
  const id = useId(), router = useRouter();
  const eventAvailable = Boolean(timezone);
  const dateLabel = kind === "project" ? "Deadline" : "Planned work date";
  async function save(form: HTMLFormElement, title: string, date: string | null) {
    const payload = JSON.stringify({ kind, title, date });
    if (identity.current.payload !== payload) identity.current = { payload, id: crypto.randomUUID() };
    setPending(true); onPendingChange?.(true); setError(""); setSaved(false);
    try {
      const response = await fetch(kind === "project" ? "/api/projects" : "/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "project"
          ? { name: title, deadline: date, mutationId: identity.current.id }
          : { title, plannedDate: date, mutationId: identity.current.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.fields?.title?.join(" ") || result.fields?.name?.join(" ") || result.error);
      form.reset(); identity.current = { payload: "", id: "" }; setSaved(true); onSaved?.();
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Your input is preserved."); }
    finally { setPending(false); onPendingChange?.(false); }
  }
  return <div className="quick-capture stack">
    <div className="card-heading"><div><h2>Quick capture</h2><p className="muted text-sm">Write it down first. Add detail when it helps.</p></div>
      <label className="sr-only" htmlFor={`${id}-kind`}>Capture type</label>
      <select id={`${id}-kind`} value={kind} onChange={(e) => { setKind(e.target.value as CaptureKind); setError(""); setSaved(false); }}>
        <option value="task">Task</option><option value="project">Project</option>{eventAvailable && <option value="event">Event</option>}
      </select>
    </div>
    {eventDraft && timezone ? <EventForm initialOpen initialTitle={eventDraft.title} initialDate={eventDraft.date} projects={projects} tasks={tasks} timezone={timezone} onClose={() => setEventDraft(null)} />
      : <form className="quick-capture-form" onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget, data = new FormData(form), title = String(data.get("title") || "");
        const date = String(data.get("date") || initialDate || "") || null;
        if (kind === "event") { setEventDraft({ title, date: date ?? "" }); return; }
        await save(form, title, date);
      }}>
        <div className="field"><label className="sr-only" htmlFor={`${id}-title`}>{kind === "project" ? "Project name" : kind === "event" ? "Event title" : "Quick capture"}</label>
          <input id={`${id}-title`} name="title" maxLength={500} required disabled={pending} placeholder={kind === "project" ? "Name a project" : kind === "event" ? "Name an event" : "Capture a task"} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /></div>
        {kind !== "event" && <div className="field"><label htmlFor={`${id}-date`}>{dateLabel}</label><input id={`${id}-date`} name="date" type="date" defaultValue={initialDate} disabled={pending} /></div>}
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : kind === "task" ? "Capture task" : kind === "project" ? "Create project" : "Set event details"}</Button>
        {error && <p id={`${id}-error`} className="error-message" role="alert">{error}</p>}{saved && <p role="status" className="muted">{kind === "project" ? "Project created." : "Task captured."}</p>}
      </form>}
  </div>;
}
