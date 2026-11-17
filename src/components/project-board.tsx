"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, CalendarDays, GripVertical } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { useProjectCompletion } from "./project-completion";

const statuses = ["Planned", "Active", "Paused", "Completed"] as const;
type Status = Project["status"];

function ProjectCard({ project, disabled, move, index, count, progress }: {
  project: Project; disabled: boolean; move: (id: string, status: Status, position?: number) => void; index: number; count: number; progress: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id, disabled });
  return <article aria-label={project.name} ref={setNodeRef} className="project-card"
    style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .5 : 1 }}>
    <div className="flex items-start justify-between gap-3">
      <Link className="project-title" href={`/projects/${project.id}`}>{project.name}</Link>
      {!project.archivedAt && <button type="button" className="drag-handle" disabled={disabled} aria-label={`Drag ${project.name}`} {...attributes} {...listeners}><GripVertical size={18} aria-hidden="true" /></button>}
    </div>
    {project.description && <p className="muted project-description">{project.description}</p>}
    <p className="muted text-sm">{progress}% complete</p>
    <progress value={progress} max={100} aria-label={`${project.name} progress`} />
    {project.deadline && <p className="muted flex items-center gap-2 text-sm"><CalendarDays size={14} aria-hidden="true" /><time dateTime={project.deadline}>{project.deadline}</time></p>}
    {!project.archivedAt && <div className="card-controls">
      <label className="sr-only" htmlFor={`status-${project.id}`}>Project status</label>
      <select id={`status-${project.id}`} value={project.status} disabled={disabled} onChange={(event) => move(project.id, event.target.value as Status)}>
        {statuses.map((status) => <option key={status}>{status}</option>)}
      </select>
      <Button variant="ghost" className="px-2" disabled={disabled || index === 0} aria-label={`Move ${project.name} earlier`} onClick={() => move(project.id, project.status, index - 1)}><ArrowUp size={16} /></Button>
      <Button variant="ghost" className="px-2" disabled={disabled || index === count - 1} aria-label={`Move ${project.name} later`} onClick={() => move(project.id, project.status, index + 1)}><ArrowDown size={16} /></Button>
    </div>}
  </article>;
}

function Column({ status, projects, disabled, move, progress }: {
  status: Status; projects: Project[]; disabled: boolean; move: (id: string, status: Status, position?: number) => void; progress: Record<string, number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${status}` });
  return <section aria-label={status} role="region" className="kanban-column" ref={setNodeRef} data-over={isOver}>
    <h2><span className={`status-dot status-${status.toLowerCase()}`} aria-hidden="true" />{status}<span className="muted text-sm">{projects.length}</span></h2>
    <SortableContext items={projects.map((p) => p.id)}>
      {projects.map((project, index) => <ProjectCard key={project.id} project={project} disabled={disabled} move={move} index={index} count={projects.length} progress={progress[project.id] ?? 0} />)}
    </SortableContext>
    {projects.length === 0 && <p className="column-empty">No {status.toLowerCase()} projects.</p>}
  </section>;
}

export function ProjectBoard({ projects, archived, progress }: { projects: Project[]; archived: boolean; progress: Record<string, number> }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const { reviewCompletion, confirmation } = useProjectCompletion();
  async function move(id: string, status: Status, position?: number) {
    const moving = projects.find((p) => p.id === id);
    if (!moving || pending || archived) return;
    const target = projects.filter((p) => p.status === status && p.id !== id);
    target.splice(position ?? target.length, 0, moving);
    const affected = projects.filter((p) => p.status === status || p.id === id);
    setPending(true); setError("");
    try {
      const completionPreview = status === "Completed" && moving.status !== "Completed" ? await reviewCompletion(id, moving.name) : undefined;
      if (completionPreview === null) return;
      const response = await fetch("/api/projects/reorder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, orderedIds: target.map((p) => p.id), expectedRevisions: affected.map((p) => ({ id: p.id, revision: p.revision })), completionPreview, mutationId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save the move. Persisted order is unchanged."); }
    finally { setPending(false); }
  }
  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const id = String(event.active.id);
    const over = String(event.over.id);
    const card = projects.find((p) => p.id === over);
    const status = card?.status ?? (over.startsWith("status:") ? over.slice(7) as Status : undefined);
    if (!status || !statuses.includes(status)) return;
    const target = projects.filter((p) => p.status === status && p.id !== id);
    void move(id, status, card ? target.findIndex((p) => p.id === card.id) : undefined);
  }
  const visible = projects.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="stack">
    <div className="board-filters"><div className="field"><label className="sr-only" htmlFor="project-search">Search projects</label><input id="project-search" type="search" placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="field"><label className="sr-only" htmlFor="project-filter">Filter project status</label><select id="project-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
    </div>
    {error && <p role="alert" className="error-message">{error}</p>}
    {pending && <p role="status" className="muted text-sm">Saving project order...</p>}
    <DndContext id="project-board" sensors={sensors} collisionDetection={(args) => {
      const hits = pointerWithin(args);
      return hits.length ? hits : closestCenter(args);
    }} onDragEnd={onDragEnd}>
      <div className="kanban-board">{statuses.filter((s) => !filter || filter === s).map((status) => <Column key={status} status={status} projects={visible.filter((p) => p.status === status)} disabled={pending || archived} move={move} progress={progress} />)}</div>
    </DndContext>
    {confirmation}
    {projects.length === 0 && <p className="muted">{archived ? "No archived projects. Archiving keeps statuses and records intact." : "Start with one project. You can add tasks and deadlines as the work takes shape."}</p>}
    {search && visible.length === 0 && <p role="status" className="muted">No projects match this search.</p>}
  </div>;
}
