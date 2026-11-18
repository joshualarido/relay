"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project, Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { EventForm } from "./event-form";
import { taskHref } from "@/lib/links";

type CaptureKind = "task" | "project" | "event";

export function QuickCapture({ projects = [], tasks = [], timezone, initialDate = "", onSaved, onPendingChange, onOpen }: {
  projects?: Project[]; tasks?: Task[]; timezone?: string; initialDate?: string;
  onSaved?: () => void; onPendingChange?: (pending: boolean) => void; onOpen?: () => void;
}) {
  const [kind, setKind] = useState<CaptureKind>("task");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [openHref, setOpenHref] = useState("");
  const [eventDraft, setEventDraft] = useState<{ title: string; date: string } | null>(null);
  // A calendar date click updates only the date field; the typed title, type and drafts survive.
  const [date, setDate] = useState(initialDate), [shownDate, setShownDate] = useState(initialDate);
  if (initialDate !== shownDate) { setShownDate(initialDate); setDate(initialDate); }
  const identity = useRef({ payload: "", id: "" });
  const id = useId(), router = useRouter();
  const eventAvailable = Boolean(timezone);
  async function save(form: HTMLFormElement, title: string, date: string | null) {
    const payload = JSON.stringify({ kind, title, date });
    if (identity.current.payload !== payload) identity.current = { payload, id: crypto.randomUUID() };
    setPending(true); onPendingChange?.(true); setError(""); setSaved(false); setOpenHref("");
    try {
      const response = await fetch(kind === "project" ? "/api/projects" : "/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "project"
          ? { name: title, deadline: date, mutationId: identity.current.id }
          : { title, mutationId: identity.current.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.fields?.title?.join(" ") || result.fields?.name?.join(" ") || result.error);
      form.reset(); setDate(initialDate); identity.current = { payload: "", id: "" }; setSaved(true); onSaved?.();
      // Inbox is not in navigation, so a loose task is reachable from this notice.
      if (kind === "task" && !result.projectId) setOpenHref(taskHref(result));
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Your input is preserved."); }
    finally { setPending(false); onPendingChange?.(false); }
  }
  const kindSelect = <><label className="sr-only" htmlFor={`${id}-kind`}>Capture type</label>
    <select id={`${id}-kind`} value={kind} onChange={(e) => { setKind(e.target.value as CaptureKind); setError(""); setSaved(false); }}>
      <option value="task">Task</option><option value="project">Project</option>{eventAvailable && <option value="event">Event</option>}
    </select></>;
  return <div className="quick-capture stack">
    <h2 className="sr-only">Quick capture</h2>
    {eventDraft && timezone ? <EventForm initialOpen initialTitle={eventDraft.title} initialDate={eventDraft.date} projects={projects} tasks={tasks} timezone={timezone} onClose={() => setEventDraft(null)} />
      : <form className="quick-capture-form" onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget, data = new FormData(form), title = String(data.get("title") || "");
        if (kind === "event") { setEventDraft({ title, date: initialDate }); return; }
        await save(form, title, String(data.get("date") || "") || null);
      }}>
        <div className="field">{kindSelect}</div>
        <div className="field"><label className="sr-only" htmlFor={`${id}-title`}>{kind === "project" ? "Project name" : kind === "event" ? "Event title" : "Quick capture"}</label>
          <input id={`${id}-title`} name="title" maxLength={500} required disabled={pending} placeholder={kind === "project" ? "Name a project" : kind === "event" ? "Name an event" : "Capture a task"} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /></div>
        {kind === "project" && <div className="field"><label htmlFor={`${id}-date`}>Deadline</label><input id={`${id}-date`} name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} /></div>}
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : kind === "task" ? "Capture task" : kind === "project" ? "Create project" : "Set event details"}</Button>
        {error && <p id={`${id}-error`} className="error-message" role="alert">{error}</p>}{saved && <p role="status" className="muted"><span>{kind === "project" ? "Project created." : "Task captured."}</span>{kind === "task" && openHref && <> <Link className="text-primary" href={openHref} onClick={onOpen}>Open<span className="sr-only"> captured task</span></Link></>}</p>}
      </form>}
  </div>;
}
