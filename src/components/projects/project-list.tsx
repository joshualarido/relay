"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SORT_TRANSITION, withFade } from "../drag-feel";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Archive, ArchiveRestore, ArrowDown, ArrowUp, CalendarDays, Check, ChevronRight, CircleDot, Folder, GripVertical, Inbox, PanelRight, Pause, Play, Plus, Trash2 } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { NO_PROJECT, isEmptyActiveProject, projectGroups, type Summary } from "@/lib/project-board";
import { useBoard, type BoardApi } from "./projects-view";
import { MoreMenu, RightClickMenu, type MenuEntry } from "./item-menu";

const formatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const shortDate = (date: string) => formatter.format(new Date(`${date}T12:00:00Z`));

/** Next deadline: icon in the deadline's category colour, plus words, so colour is never the only cue. */
export function DeadlineMeta({ next, today }: { next: Summary["next"]; today: string }) {
  if (!next) return null;
  const overdue = next.date < today;
  return <span className={`row-meta deadline-${next.kind}${overdue ? " is-overdue" : ""}`}>
    <CalendarDays size={13} aria-hidden="true" />
    <span>{overdue ? "Overdue · " : ""}<span className="sr-only">{next.kind === "project" ? "Project deadline " : "Next task due "}</span><time dateTime={next.date}>{shortDate(next.date)}</time></span>
  </span>;
}

export function Progress({ summary }: { summary: Summary }) {
  return <span className="progress-line">
    <span className="progress-track" aria-hidden="true"><span style={{ width: `${summary.total ? summary.done / summary.total * 100 : 0}%` }} /></span>
    <span className="sr-only">{summary.done} of {summary.total} tasks done</span>
  </span>;
}

export function projectMenu(board: BoardApi, project: Project): MenuEntry[] {
  if (project.archivedAt) return [
    { label: "Unarchive", icon: <ArchiveRestore size={15} aria-hidden="true" />, onSelect: () => board.patchProject(project, { archived: false }, "Project unarchived.") },
    "separator", { label: "Delete", icon: <Trash2 size={15} aria-hidden="true" />, danger: true, onSelect: () => board.deleteProject(project) },
  ];
  const group = board.groups[project.status], i = group.findIndex((p) => p.id === project.id);
  return [
    { label: "Details", icon: <PanelRight size={15} aria-hidden="true" />, onSelect: () => { board.select(project.id); board.openProject(project.id); } },
    { label: "Change status", icon: <CircleDot size={15} aria-hidden="true" />, children: projectGroups.map((status) => ({
      label: status, checked: status === project.status, disabled: status === project.status,
      onSelect: () => board.moveProject(project, { status }, `Moved to ${status}.`),
    })) },
    { label: "Move up", icon: <ArrowUp size={15} aria-hidden="true" />, disabled: i <= 0, onSelect: () => board.moveProject(project, { status: project.status, index: i - 1 }, "Order saved.") },
    { label: "Move down", icon: <ArrowDown size={15} aria-hidden="true" />, disabled: i >= group.length - 1, onSelect: () => board.moveProject(project, { status: project.status, index: i + 1 }, "Order saved.") },
    { label: "Archive", icon: <Archive size={15} aria-hidden="true" />, onSelect: () => board.patchProject(project, { archived: true }, "Project archived.") },
    "separator", { label: "Delete", icon: <Trash2 size={15} aria-hidden="true" />, danger: true, onSelect: () => board.deleteProject(project) },
  ];
}

function RowBody({ id, name, summary, emptyActive, icon }: { id: string; name: string; summary: Summary; emptyActive?: boolean; icon?: React.ReactNode }) {
  const board = useBoard();
  return <button type="button" className="project-row-main" data-project-row={id} aria-current={board.selectedKey === id ? "true" : undefined} onClick={() => board.select(id)}>
    <span className="project-row-title">{icon}<span className="project-row-name">{name}</span></span>
    <Progress summary={summary} />
    {emptyActive && <span className="row-meta is-empty-active"><AlertCircle size={12} aria-hidden="true" />No active tasks</span>}
    <DeadlineMeta next={summary.next} today={board.today} />
  </button>;
}

function QuickStatus({ project }: { project: Project }) {
  const board = useBoard();
  if (project.archivedAt || project.status === "Done") return null;
  const move = (status: Project["status"]) => (e: React.MouseEvent) => {
    e.stopPropagation();
    void board.moveProject(project, { status }, `Moved to ${status}.`);
  };
  return <span className="project-quick-switch">
    {(project.status === "Planned" || project.status === "Paused") && (
      <button type="button" className="quick-switch-btn" title="Move to Active" aria-label={`Move ${project.name} to Active`} onClick={move("Active")}>
        <Play size={12} aria-hidden="true" />
      </button>
    )}
    {project.status === "Active" && (
      <>
        <button type="button" className="quick-switch-btn" title="Move to Paused" aria-label={`Move ${project.name} to Paused`} onClick={move("Paused")}>
          <Pause size={12} aria-hidden="true" />
        </button>
        <button type="button" className="quick-switch-btn" title="Mark Done" aria-label={`Mark ${project.name} Done`} onClick={move("Done")}>
          <Check size={12} aria-hidden="true" />
        </button>
      </>
    )}
  </span>;
}

function ProjectRow({ project, dragging }: { project: Project; dragging: string | null }) {
  const board = useBoard();
  const archived = Boolean(project.archivedAt);
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id: `project:${project.id}`, data: { type: "project", project }, disabled: archived, transition: SORT_TRANSITION });
  const { setNodeRef: setTargetRef, isOver } = useDroppable({ id: `target:${project.id}`, data: { type: "target", key: project.id }, disabled: archived });
  const { onKeyDown, ...pointer } = listeners ?? {};
  const entries = projectMenu(board, project);
  const summary = board.summaries.get(project.id)!;
  const emptyActive = isEmptyActiveProject(project, summary);
  return <RightClickMenu entries={entries}>
    <li ref={(el) => { setNodeRef(el); setTargetRef(el); }} className="project-row" {...(archived ? {} : pointer)}
      data-selected={board.selectedKey === project.id} data-over={dragging === "task" && isOver} data-dragging={isDragging}
      data-empty-active={emptyActive ? "true" : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition: withFade(transition) }}>
      <RowBody id={project.id} name={project.name} summary={summary} emptyActive={emptyActive} icon={<Folder size={15} aria-hidden="true" className="project-row-icon" />} />
      <span className="row-tools">
        {!archived && <button type="button" className="icon-button grip" ref={setActivatorNodeRef} {...attributes} onKeyDown={onKeyDown as React.KeyboardEventHandler}
          aria-label={`Move ${project.name}`} title="Drag, or press Enter to move with the arrow keys"><GripVertical size={15} aria-hidden="true" /></button>}
        <MoreMenu label={`Actions for ${project.name}`} entries={entries} />
      </span>
      <QuickStatus project={project} />
    </li>
  </RightClickMenu>;
}

function Group({ status, projects, dragging }: { status: Project["status"]; projects: Project[]; dragging: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${status}`, data: { type: "group", status } });
  const [open, setOpen] = useState(status !== "Done");
  const headingId = `group-${status}`;
  return <section ref={setNodeRef} className="project-group" aria-labelledby={headingId} data-over={dragging === "project" && isOver}>
    <h2 id={headingId}>
      <button type="button" className="group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight size={14} aria-hidden="true" />{status}
      </button>
      <span className="group-count">{projects.length}</span>
    </h2>
    {open && <SortableContext items={projects.map((p) => `project:${p.id}`)} strategy={verticalListSortingStrategy}>
      <ul className="project-rows">{projects.map((p) => <ProjectRow key={p.id} project={p} dragging={dragging} />)}</ul>
    </SortableContext>}
  </section>;
}

function NoProjectRow({ dragging }: { dragging: string | null }) {
  const board = useBoard();
  const { setNodeRef, isOver } = useDroppable({ id: `target:${NO_PROJECT}`, data: { type: "target", key: NO_PROJECT } });
  return <ul className="project-rows no-project"><li ref={setNodeRef} className="project-row" data-selected={board.selectedKey === NO_PROJECT} data-over={dragging === "task" && isOver}>
    <RowBody id={NO_PROJECT} name="No project" summary={board.summaries.get(NO_PROJECT)!} icon={<Inbox size={15} aria-hidden="true" className="project-row-icon" />} />
  </li></ul>;
}

export function ProjectList({ creating, setCreating, dragging }: { creating: boolean; setCreating: (v: boolean) => void; dragging: string | null }) {
  const board = useBoard();
  const [name, setName] = useState("");
  async function create() {
    if (!name.trim()) return setCreating(false);
    if (await board.createProject(name)) { setName(""); setCreating(false); }
  }
  return <nav className="list-pane" aria-label="Projects" onKeyDown={(e) => {
    // ↑/↓ move the selection through the rows.
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-project-row]");
    if (!row || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-project-row]")];
    const next = rows[rows.indexOf(row) + (e.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    e.preventDefault(); next.focus(); board.select(next.dataset.projectRow!);
  }}>
    <div className="list-head">
      <h1>Projects</h1>
      <button type="button" className="icon-button" aria-label="New project" title="New project (Ctrl+N)" onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /></button>
    </div>
    {creating && <input className="list-create" aria-label="New project name" placeholder="Project name" autoFocus value={name} maxLength={200}
      onChange={(e) => setName(e.target.value)} onBlur={() => { if (!name.trim()) setCreating(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { setName(""); setCreating(false); } }} />}
    <NoProjectRow dragging={dragging} />
    {projectGroups.map((status) => <Group key={status} status={status} projects={board.groups[status]} dragging={dragging} />)}
  </nav>;
}
