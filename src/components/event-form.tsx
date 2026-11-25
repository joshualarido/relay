"use client";

import { useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { CalendarPlus, X } from "lucide-react";
import type { Event, Project, Task } from "@/lib/db/schema";
import type { RecurrenceRule } from "@/lib/recurrence";
import { instantToLocal, localToInstant } from "@/lib/dates";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { useConfirmation } from "./confirm-dialog";
import { RecurrencePicker } from "./recurrence-picker";
import { useWorkspace } from "./workspace-store";

export function EventForm({ event, projects, tasks, timezone, initialOpen = false, initialTitle = "", initialDate = "", onClose }: { event?: Event; projects: Project[]; tasks: Task[]; timezone: string; initialOpen?: boolean; initialTitle?: string; initialDate?: string; onClose?: () => void }) {
  const [open, setOpenState] = useState(initialOpen);
  function setOpen(value: boolean) { setOpenState(value); if (!value) onClose?.(); }
  const [allDay, setAllDay] = useState(event?.allDay ?? Boolean(initialDate));
  const [zone, setZone] = useState(event?.timezone ?? timezone);
  const [start, setStart] = useState(event ? event.allDay ? event.start : instantToLocal(event.start, event.timezone) : initialDate);
  const [end, setEnd] = useState(event ? event.allDay ? event.end : instantToLocal(event.end, event.timezone) : initialDate ? Temporal.PlainDate.from(initialDate).add({ days: 1 }).toString() : "");
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(event?.recurrenceRule ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const identity = useRef({ payload: "", id: "" });
  const prefix = useId();
  const router = useRouter();
  const workspace = useWorkspace();
  const { confirm, confirmation } = useConfirmation();
  function field(name: string) { return { id: `${prefix}-${name}`, name, "aria-invalid": Boolean(fields[name]), "aria-describedby": fields[name] ? `${prefix}-${name}-error` : undefined }; }
  function errors(name: string) { return fields[name] && <p className="error-message" id={`${prefix}-${name}-error`}>{fields[name].join(" ")}</p>; }
  return <><Dialog.Root open={open} onOpenChange={(value) => {
    if (pending) return;
    if (value) {
        setAllDay(event?.allDay ?? Boolean(initialDate)); setZone(event?.timezone ?? timezone);
        setStart(event ? event.allDay ? event.start : instantToLocal(event.start, event.timezone) : initialDate);
        setEnd(event ? event.allDay ? event.end : instantToLocal(event.end, event.timezone) : initialDate ? Temporal.PlainDate.from(initialDate).add({ days: 1 }).toString() : "");
        setRecurrenceRule(event?.recurrenceRule ?? null);
    }
    setOpen(value); setError(""); setFields({});
  }}>
    {!initialOpen && <Dialog.Trigger asChild><Button variant={event ? "outline" : "default"}>{!event && <CalendarPlus size={17} aria-hidden="true" />}{event ? "Edit event" : "New event"}</Button></Dialog.Trigger>}
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="form-dialog">
      <Dialog.Title className="text-xl font-semibold">{event ? "Edit event" : "New event"}</Dialog.Title>
      <Dialog.Description className="muted mt-2 mb-6">Choose the time and timezone explicitly. Saving confirms the displayed range.</Dialog.Description>
      <Dialog.Close asChild><Button variant="ghost" className="dialog-close" aria-label="Close event form" disabled={pending}><X size={20} /></Button></Dialog.Close>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setError(""); setFields({});
        const form = new FormData(e.currentTarget);
        try {
          const parent = String(form.get("parent") || "");
          function instant(key: "start" | "end", value: string) {
            if (event && !event.allDay && zone === event.timezone &&
              Temporal.PlainDateTime.from(value).equals(Temporal.PlainDateTime.from(instantToLocal(event[key], zone)))) {
              return Temporal.Instant.from(event[key]).toString();
            }
            return localToInstant(value, zone);
          }
          const input = {
            title: form.get("title"), description: form.get("description"), allDay, timezone: zone,
            start: allDay ? start : instant("start", start), end: allDay ? end : instant("end", end),
            projectId: parent.startsWith("project:") ? parent.slice(8) : null,
            taskId: parent.startsWith("task:") ? parent.slice(5) : null, location: form.get("location"),
            recurrenceRule,
            ...(event ? { expectedRevision: event.revision } : {}),
          };
          setPending(true);
          if (event && (input.start !== (event.allDay ? event.start : Temporal.Instant.from(event.start).toString()) ||
            input.end !== (event.allDay ? event.end : Temporal.Instant.from(event.end).toString()) || allDay !== event.allDay) &&
            !await confirm({ title: "Reschedule event?", action: "Reschedule", description: `${String(input.title)}: ${start} to ${end} (${zone}).` })) return;
          const payload = JSON.stringify(input);
          if (identity.current.payload !== payload) identity.current = { payload, id: crypto.randomUUID() };
          const response = await fetch(event ? `/api/events/${event.id}` : "/api/events", {
            method: event ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, mutationId: identity.current.id }),
          });
          const result = await response.json();
          if (!response.ok) { setFields(result.fields || {}); throw new Error(result.error); }
          if (event) {
            workspace?.setEvents((all) => all.map((ev) => (ev.id === event.id ? (result as Event) : ev)));
          } else {
            workspace?.setEvents((all) => (all.some((ev) => ev.id === (result as Event).id) ? all : [...all, result as Event]));
          }
          setOpen(false); identity.current = { payload: "", id: "" }; notifyMutation(response, () => router.refresh()); router.refresh();
        } catch (failure) {
          setError(failure instanceof RangeError ? "This local time is invalid or ambiguous in the selected timezone. Choose another time, or use a different timezone such as UTC." : failure instanceof Error ? failure.message : "Could not save. Your input is preserved.");
        } finally { setPending(false); }
      }}>
<fieldset disabled={pending} className="contents">
        <div className="field"><label htmlFor={`${prefix}-title`}>Event title</label><input {...field("title")} required maxLength={500} defaultValue={event?.title ?? initialTitle} />{errors("title")}</div>
        <div className="field"><label htmlFor={`${prefix}-description`}>Event description</label><textarea {...field("description")} rows={2} maxLength={20000} defaultValue={event?.description} />{errors("description")}</div>
        <label className="checkbox-label"><input name="allDay" type="checkbox" checked={allDay} onChange={(e) => { setAllDay(e.target.checked); setStart(""); setEnd(""); }} />All-day event</label>
        <div className="field"><label htmlFor={`${prefix}-timezone`}>Event timezone</label><input {...field("timezone")} value={zone} onChange={(e) => setZone(e.target.value)} required />{errors("timezone")}</div>
        <div className="form-grid">
          <div className="field"><label htmlFor={`${prefix}-start`}>Start</label><input {...field("start")} type={allDay ? "date" : "datetime-local"} step="any" value={start} onChange={(e) => setStart(e.target.value)} required />{errors("start")}</div>
          <div className="field"><label htmlFor={`${prefix}-end`}>End</label><input {...field("end")} type={allDay ? "date" : "datetime-local"} step="any" value={end} onChange={(e) => setEnd(e.target.value)} required />{errors("end")}</div>
        </div>
        {allDay ? <p className="muted text-sm">End is exclusive: for one day, choose the following date.</p> : <div className="stack">
          <Button variant="outline" type="button" disabled={pending || !start} onClick={() => {
            try {
              const instant = Temporal.Instant.from(localToInstant(start, zone)).add({ minutes: 60 }).toString();
              setEnd(instantToLocal(instant, zone)); setError("");
            } catch { setError("Choose a valid, unambiguous start and timezone first."); }
          }}>Suggest 60-minute end</Button>
          <p className="muted text-sm">The suggestion is visible before saving; it never creates an event by itself.</p>
        </div>}
        <div className="field"><span className="sheet-label">Repeat</span><RecurrencePicker value={recurrenceRule} onChange={setRecurrenceRule} disabled={pending} />{errors("recurrenceRule")}</div>
        <div className="field"><label htmlFor={`${prefix}-parent`}>Link to</label><select {...field("parent")} defaultValue={event?.taskId ? `task:${event.taskId}` : event?.projectId ? `project:${event.projectId}` : ""}>
          <option value="">Independent event</option>
          <optgroup label="Projects">{projects.map((p) => <option value={`project:${p.id}`} key={p.id}>{p.name}</option>)}</optgroup>
          <optgroup label="Tasks">{tasks.map((t) => <option value={`task:${t.id}`} key={t.id}>{t.title}</option>)}</optgroup>
        </select>{errors("projectId")}{errors("taskId")}</div>
        <div className="field"><label htmlFor={`${prefix}-location`}>Location or meeting URL</label><input {...field("location")} defaultValue={event?.location} maxLength={2000} />{errors("location")}</div>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="form-actions"><Dialog.Close asChild><Button variant="outline" type="button" disabled={pending}>Cancel</Button></Dialog.Close><Button type="submit" disabled={pending}>{pending ? "Saving..." : event ? "Save event" : "Create event"}</Button></div>
      </fieldset>
</form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>{confirmation}</>;
}
