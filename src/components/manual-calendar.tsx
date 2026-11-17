"use client";

import "temporal-polyfill/global";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FullCalendar, { type CalendarRef, type EventDropInfo } from "@fullcalendar/react";
import dayGrid from "@fullcalendar/react/daygrid";
import timeGrid from "@fullcalendar/react/timegrid";
import list from "@fullcalendar/react/list";
import interaction from "@fullcalendar/react/interaction";
import classic from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import type { Event, Project, Task } from "@/lib/db/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { useConfirmation } from "./confirm-dialog";

type Kind = "planned" | "project" | "task" | "event";
const labels = { planned: "Planned work", project: "Project deadline", task: "Task deadline", event: "Event" };
const colors = { planned: "var(--planned)", project: "var(--project-deadline)", task: "var(--task-deadline)", event: "var(--event)" };
const views = { Month: "dayGridMonth", Week: "timeGridWeek", Day: "timeGridDay", Agenda: "listMonth" };

export function ManualCalendar({ projects, tasks, events, timezone, weekStart, date, home = false }: {
  projects: Project[]; tasks: Task[]; events: Event[]; timezone: string; weekStart: number; date: string; home?: boolean;
}) {
  const ref = useRef<CalendarRef>(null);
  const router = useRouter();
  const params = useSearchParams();
  const [enabled, setEnabled] = useState<Record<Kind, boolean>>({ planned: true, project: true, task: true, event: true });
  const [view, setView] = useState("Month");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { confirm, confirmation } = useConfirmation();
  const captureLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: timezone });
  const records = [
    ...tasks.filter((t) => t.plannedDate).map((t) => ({ kind: "planned" as const, id: t.id, title: t.title, start: t.plannedDate!, end: undefined, allDay: true, revision: t.revision, done: t.status === "Done" })),
    ...projects.filter((p) => p.deadline).map((p) => ({ kind: "project" as const, id: p.id, title: p.name, start: p.deadline!, end: undefined, allDay: true, revision: p.revision, done: false })),
    ...tasks.filter((t) => t.dueDate || t.dueAt).map((t) => ({ kind: "task" as const, id: t.id, title: t.title, start: (t.dueDate ?? t.dueAt)!, end: undefined, allDay: Boolean(t.dueDate), revision: t.revision, done: t.status === "Done" })),
    ...events.map((e) => ({ kind: "event" as const, id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, revision: e.revision, done: false })),
  ];
  function href(kind: Kind, id: string) {
    if (kind === "project") return `/projects/${id}`;
    const query = new URLSearchParams(params); query.delete("task"); query.delete("event"); query.set(kind === "event" ? "event" : "task", id);
    return `${home ? "/" : "/calendar"}?${query}`;
  }
  function chooseDate(value: string) {
    const query = new URLSearchParams(params); query.set("captureDate", value); query.set("date", value);
    router.replace(`/?${query}`, { scroll: false });
  }
  async function reschedule(info: EventDropInfo) {
    const record = records.find((r) => `${r.kind}:${r.id}` === info.event.id);
    if (!record || pending) { info.revert(); return; }
    setPending(true); setError("");
    try {
      if (!await confirm({ title: "Reschedule item?", action: "Reschedule", description: `${labels[record.kind]} "${record.title}": ${record.start} to ${info.event.startStr} (${timezone}).` })) { info.revert(); return; }
      const start = record.allDay ? info.event.startStr.slice(0, 10) : info.event.start!.toISOString();
      const input = record.kind === "event" ? { reschedule: true, start } : record.kind === "project" ? { deadline: start }
        : record.kind === "planned" ? { plannedDate: start } : record.allDay ? { dueDate: start } : { dueAt: start };
      const response = await fetch(`/api/${record.kind === "project" ? "projects" : record.kind === "event" ? "events" : "tasks"}/${record.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, expectedRevision: record.revision, mutationId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { info.revert(); setError(failure instanceof Error ? failure.message : "Could not save. The original dates have been restored."); }
    finally { setPending(false); }
  }
  return <div className={`${home ? "home-calendar" : "section"} stack`}>
    <fieldset className="calendar-legend"><legend className="sr-only">Calendar filters and legend</legend>
      {(["planned", "project", "task", "event"] as const).map((kind) => <label key={kind} className="checkbox-label"><input type="checkbox" checked={enabled[kind]} onChange={(e) => setEnabled({ ...enabled, [kind]: e.target.checked })} aria-label={`Show ${labels[kind].toLowerCase()}`} /><span style={{ background: colors[kind] }} className="status-dot" aria-hidden="true" />{labels[kind]}</label>)}
    </fieldset>
    {!home && <div className="calendar-controls"><div className="flex flex-wrap gap-2">{Object.keys(views).map((name) => <Button key={name} variant="outline" aria-pressed={view === name} onClick={() => { setView(name); ref.current?.getApi().changeView(views[name as keyof typeof views]); }}>{name}</Button>)}</div>
      <form className="calendar-date" onSubmit={(e) => {
        e.preventDefault(); const value = String(new FormData(e.currentTarget).get("date"));
        ref.current?.getApi().gotoDate(value);
        const query = new URLSearchParams(params); query.set("date", value); router.replace(`/calendar?${query}`, { scroll: false });
      }}><label className="sr-only" htmlFor="calendar-date">Go to date</label><input id="calendar-date" name="date" type="date" defaultValue={date} required /><Button type="submit" variant="outline">Go</Button></form>
    </div>}
    {home ? <p className="muted text-sm home-calendar-help">Displayed in {timezone}. Open an item to change its dates without dragging.</p>
      : <p className="muted text-sm">Displayed in {timezone}. Deadlines are not time blocks. Edit any item for a keyboard/touch alternative to dragging.</p>}
    <div className="calendar-controls items-center"><h2 aria-live="polite">{title}</h2><div className="flex gap-2">
      <Button variant="outline" aria-label="Previous period" onClick={() => ref.current?.getApi().prev()}><ChevronLeft size={18} /></Button>
      <Button variant="outline" aria-label="Next period" onClick={() => ref.current?.getApi().next()}><ChevronRight size={18} /></Button>
      <Button variant="outline" onClick={() => ref.current?.getApi().today()}>Today</Button>
    </div></div>
    {error && <p role="alert" className="error-message">{error}</p>}{pending && <p role="status" className="muted">Saving schedule...</p>}
    <div className="calendar-frame" data-color-scheme="dark" aria-busy={pending} role="region" aria-label="Calendar grid; scroll horizontally on narrow screens" tabIndex={0}>
      <FullCalendar ref={ref} plugins={[dayGrid, timeGrid, list, interaction, classic]} initialView="dayGridMonth" initialDate={date}
        timeZone={timezone} firstDay={weekStart} headerToolbar={false} datesSet={(info) => setTitle(info.view.title)}
        height={home ? "100%" : "auto"} editable={!pending} eventDurationEditable={false} dayMaxEvents={home ? 2 : false}
        eventAllow={(span, moving) => span.allDay === moving?.allDay}
        events={records.filter((r) => enabled[r.kind]).map((r) => ({
          id: `${r.kind}:${r.id}`, title: r.title, start: r.start, end: r.end, allDay: r.allDay,
           color: colors[r.kind], contrastColor: r.kind === "task" || r.kind === "planned" ? "var(--background)" : "#ffffff", extendedProps: { kind: r.kind, id: r.id, done: r.done },
        }))}
        eventDrop={(info) => { void reschedule(info); }}
        eventContent={(info) => {
          const kind = info.event.extendedProps.kind as Kind, id = info.event.extendedProps.id as string;
          return <Link href={href(kind, id)} scroll={false} className="calendar-record" data-calendar-record={`${kind}:${id}`} data-task-link={kind === "task" || kind === "planned" ? id : undefined}
            style={{ "--record-color": colors[kind], opacity: info.event.extendedProps.done ? .6 : 1 } as React.CSSProperties}
            aria-label={`${labels[kind]}: ${info.event.title}`}><span aria-hidden="true">{info.timeText && `${info.timeText} `}{labels[kind]}: {info.event.title}</span></Link>;
        }}
        dayCellClass={(info) => info.isToday ? "calendar-today" : ""}
        navLinks={home} navLinkClass="calendar-day-capture" navLinkHint={(_text, day) => `Capture on ${captureLabel.format(day)}`}
        navLinkDayClick={(_day, jsEvent) => {
          const value = (jsEvent.target as HTMLElement | null)?.closest("[data-date]")?.getAttribute("data-date");
          if (value) chooseDate(value.slice(0, 10));
        }}
        dateClick={(info) => { if (home) chooseDate(info.dateStr); }} />
    </div>
    {confirmation}
  </div>;
}
