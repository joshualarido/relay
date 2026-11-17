"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { Task } from "@/lib/db/schema";
import { dateInTimezone } from "@/lib/dates";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { priorityLabel, quadrants } from "@/lib/priority";
import { PriorityMatrix } from "./priority-matrix";

const statuses = ["To do", "Doing", "Done"] as const;
type Status = Task["status"];
type Move = (id: string, status: Status, position?: number) => void;

function TaskCard({ task, href, disabled, index, count, move, warnings }: {
  task: Task; href: string; disabled: boolean; index: number; count: number; move: Move; warnings: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return <article ref={setNodeRef} className="project-card" aria-label={task.title}
    style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .5 : 1 }}>
    <div className="flex justify-between items-start gap-3">
      <Link className="project-title" data-task-link={task.id} href={href} scroll={false}>{task.title}</Link>
      <button className="drag-handle" aria-label={`Drag ${task.title}`} disabled={disabled} {...attributes} {...listeners}><GripVertical size={18} /></button>
    </div>
    <p className="muted text-sm">{task.status} / {priorityLabel(task)}{task.estimateMinutes ? ` / ${task.estimateMinutes} min` : ""}</p>
    {task.plannedDate && <p className="muted text-sm">Planned <time dateTime={task.plannedDate}>{task.plannedDate}</time></p>}
    {task.dueDate && <p className="muted text-sm">Due <time dateTime={task.dueDate}>{task.dueDate}</time></p>}
    {task.dueAt && <p className="muted text-sm">Due <time dateTime={task.dueAt}>{new Intl.DateTimeFormat("en-GB", { timeZone: task.timezone!, dateStyle: "medium", timeStyle: "short" }).format(new Date(task.dueAt))}</time> ({task.timezone})</p>}
    {task.blockerReason && <p className="project-description error-message">Blocker: {task.blockerReason}</p>}
    {warnings.map((warning) => <p className="muted text-sm" key={warning}>{warning}</p>)}
    <div className="card-controls">
      <label className="sr-only" htmlFor={`task-status-${task.id}`}>Change task status</label>
      <select id={`task-status-${task.id}`} value={task.status} disabled={disabled} onChange={(e) => move(task.id, e.target.value as Status)}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
      <Button variant="ghost" className="px-2" disabled={disabled || index === 0} aria-label={`Move ${task.title} earlier`} onClick={() => move(task.id, task.status, index - 1)}><ArrowUp size={16} /></Button>
      <Button variant="ghost" className="px-2" disabled={disabled || index === count - 1} aria-label={`Move ${task.title} later`} onClick={() => move(task.id, task.status, index + 1)}><ArrowDown size={16} /></Button>
    </div>
  </article>;
}

function TaskColumn({ status, children }: { status: Status; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${status}` });
  return <section aria-label={status} role="region" className="kanban-column" ref={setNodeRef} data-over={isOver}><h2>{status}</h2>{children}</section>;
}

export function TaskBoard({ tasks, projectId, warnings = {} }: { tasks: Task[]; projectId: string | null; warnings?: Record<string, string[]> }) {
  const [view, setView] = useState<"list" | "board" | "matrix">("board");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function href(id: string) {
    const query = new URLSearchParams(params); query.set("task", id);
    return `${pathname}?${query}`;
  }
  async function move(id: string, status: Status, position?: number) {
    if (pending) return;
    const moving = tasks.find((t) => t.id === id);
    if (!moving) return;
    const target = tasks.filter((t) => t.status === status && t.id !== id);
    target.splice(position ?? target.length, 0, moving);
    const affected = tasks.filter((t) => t.status === status || t.id === id);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/tasks/reorder", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, projectId, status, orderedIds: target.map((t) => t.id), expectedRevisions: affected.map((t) => ({ id: t.id, revision: t.revision })), mutationId: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Persisted task order is unchanged."); }
    finally { setPending(false); }
  }
  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const id = String(event.active.id), over = String(event.over.id);
    const card = tasks.find((t) => t.id === over);
    const status = card?.status ?? (over.startsWith("status:") ? over.slice(7) as Status : undefined);
    if (!status || !statuses.includes(status)) return;
    const target = tasks.filter((t) => t.status === status && t.id !== id);
    void move(id, status, card ? target.findIndex((t) => t.id === card.id) : undefined);
  }
  const visible = tasks.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(search.toLowerCase()) &&
    (!status || t.status === status) && (!priority || priorityLabel(t) === priority) &&
    (!date || t.plannedDate === date || t.dueDate === date || (t.dueAt && dateInTimezone(t.dueAt, t.timezone!) === date)));
  function cards(group: Task[]) {
    return <SortableContext items={group.map((t) => t.id)}>{group.map((t) => {
      const column = tasks.filter((v) => v.status === t.status);
      return <TaskCard key={t.id} task={t} href={href(t.id)} disabled={pending} index={column.findIndex((v) => v.id === t.id)} count={column.length} move={move} warnings={warnings[t.id] ?? []} />;
    })}</SortableContext>;
  }
  return <div className="stack">
    <div className="flex flex-wrap gap-3"><Button variant="outline" aria-pressed={view === "board"} onClick={() => setView("board")}>Task board</Button><Button variant="outline" aria-pressed={view === "list"} onClick={() => setView("list")}>Task list</Button><Button variant="outline" aria-pressed={view === "matrix"} onClick={() => setView("matrix")}>Priority matrix</Button></div>
    <div className="task-filters">
      <div className="field"><label htmlFor="task-search">Search tasks</label><input id="task-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="field"><label htmlFor="task-filter-status">Filter task status</label><select id="task-filter-status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><label htmlFor="task-filter-priority">Filter priority</label><select id="task-filter-priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All quadrants</option>{quadrants.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><label htmlFor="task-filter-date">Filter planned or due date</label><input id="task-filter-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
    </div>
    <p className="muted text-sm">Timed deadlines use each task&apos;s saved timezone.</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    {pending && <p role="status" className="muted">Saving task order...</p>}
    {view === "matrix" ? <PriorityMatrix tasks={visible} /> : <DndContext id="task-board" sensors={sensors} collisionDetection={(args) => {
      const hits = pointerWithin(args); return hits.length ? hits : closestCenter(args);
    }} onDragEnd={onDragEnd}>
      {view === "board" ? <div className="kanban-board task-kanban">{statuses.filter((s) => !status || status === s).map((s) => <TaskColumn key={s} status={s}>{cards(visible.filter((t) => t.status === s))}{!visible.some((t) => t.status === s) && <p className="column-empty">No {s.toLowerCase()} tasks.</p>}</TaskColumn>)}</div>
        : <div className="stack" role="region" aria-label="Task list">{cards(visible)}</div>}
    </DndContext>}
    {!visible.length && <p className="muted">{tasks.length ? "No tasks match these filters." : "Nothing here yet. Capture a task in your own words."}</p>}
  </div>;
}
