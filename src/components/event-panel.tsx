"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { Event, Project, Task } from "@/lib/db/schema";
import type { DeletionPreview } from "@/lib/lifecycle";
import { EventForm } from "./event-form";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";

export function EventPanel({ event, projects, tasks, timezone }: { event: Event | null; projects: Project[]; tasks: Task[]; timezone: string }) {
  const router = useRouter(), path = usePathname(), search = useSearchParams();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const mutation = useRef("");
  function close() {
    const query = new URLSearchParams(search); query.delete("event");
    router.replace(`${path}${query.size ? `?${query}` : ""}`, { scroll: false });
  }
  function display(value: string) {
    return event!.allDay ? value : new Intl.DateTimeFormat("en-GB", { timeZone: event!.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !pending) close(); }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="form-dialog"
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        const trigger = event && document.querySelector<HTMLElement>(`[data-calendar-record="event:${CSS.escape(event.id)}"]`);
        (trigger || document.getElementById("main"))?.focus();
      }}>
      <Dialog.Title className="sr-only">Event details</Dialog.Title>
      <Dialog.Description className="muted mb-5">Your saved commitment, in its recorded timezone.</Dialog.Description>
      <Button variant="ghost" className="dialog-close" aria-label="Close event details" disabled={pending} onClick={close}><X size={20} /></Button>
      {!event ? <p>Event not found.</p> : <div className="stack">
        <h2 className="text-xl break-words">{event.title}</h2><p className="whitespace-pre-wrap">{event.description || "No description yet."}</p>
        <p>Start <time dateTime={event.start}>{display(event.start)}</time><br />End <time dateTime={event.end}>{display(event.end)}</time>{event.allDay && " (exclusive)"}</p>
        <p className="muted">{event.allDay ? "All day" : "Timed event"} / {event.timezone}</p>
        {event.location && (/^https?:\/\//i.test(event.location) ? <a className="text-primary break-all" href={event.location} target="_blank" rel="noopener noreferrer">{event.location}</a> : <p>{event.location}</p>)}
        {event.projectId && <Link className="text-primary" href={`/projects/${event.projectId}`}>{projects.find((p) => p.id === event.projectId)?.name ?? "Project"}</Link>}
        {event.taskId && <Link className="text-primary" href={`/inbox?task=${event.taskId}`}>{tasks.find((t) => t.id === event.taskId)?.title ?? "Task"}</Link>}
        <div className="flex flex-wrap gap-3"><EventForm event={event} projects={projects} tasks={tasks} timezone={timezone} />
          <Button variant="destructive" disabled={pending} onClick={async () => {
            setPending(true); setError("");
            try {
              const response = await fetch(`/api/events/${event.id}/deletion`);
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              mutation.current = crypto.randomUUID(); setPreview(result);
            } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load deletion preview."); }
            finally { setPending(false); }
          }}>Delete event</Button>
        </div>
      </div>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => { if (!open && !pending) setPreview(null); }}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="form-dialog">
          <Dialog.Title className="text-xl font-semibold">Delete event?</Dialog.Title><Dialog.Description className="muted mt-3">This event will be soft-deleted and remain recoverable.</Dialog.Description>
          <ul className="preview-list">{preview?.records.map((r) => <li key={r.id}>{r.label}</li>)}</ul>
          {error && <p role="alert" className="error-message">{error}</p>}
          <div className="form-actions"><Button variant="outline" disabled={pending} onClick={() => setPreview(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={async () => {
              setPending(true); setError("");
              try {
                const response = await fetch(`/api/events/${event!.id}/deletion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...preview, mutationId: mutation.current }) });
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
