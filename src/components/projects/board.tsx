"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CalendarDays, ChevronLeft, GripVertical, Star } from "lucide-react";
import type { Event, Project, Task } from "@/lib/db/schema";
import { NO_PROJECT, taskColumns, taskDeadline } from "@/lib/project-board";
import { dateInTimezone } from "@/lib/dates";
import { useBoard, type BoardApi } from "./projects-view";
import { MoreMenu, RightClickMenu, type MenuEntry } from "./item-menu";
import { InlineText } from "./inline-text";
import { projectMenu, shortDate } from "./project-list";

export function taskMenu(board: BoardApi, task: Task): MenuEntry[] {
  const column = (board.byProject.get(task.projectId ?? NO_PROJECT) ?? []).filter((t) => t.status === task.status);
  const i = column.findIndex((t) => t.id === task.id);
  const destinations = [{ id: null, name: "No project" }, ...board.groups.Active, ...board.groups.Planned, ...board.groups.Paused, ...board.groups.Done]
    .filter((p) => p.id !== task.projectId);
  const to = (status: Task["status"], index?: number) => ({ projectId: task.projectId, status, index });
  return [
    { label: "Open details", onSelect: () => board.openTask(task.id, document.querySelector(`[data-task-card="${task.id}"]`)) },
    { label: "Schedule", onSelect: () => board.scheduleTask(task.id) },
    task.status === "Done"
      ? { label: "Reopen", onSelect: () => board.moveTask(task.id, to("To do"), "Task reopened.") }
      : { label: "Complete", onSelect: () => board.completeTask(task, false) },
    { label: "Change status", children: taskColumns.map((status) => ({
      label: status, checked: status === task.status, disabled: status === task.status,
      onSelect: () => board.moveTask(task.id, to(status), `Moved to ${status}.`),
    })) },
    { label: "Move to project", children: destinations.map((p) => ({
      label: p.name, onSelect: () => board.moveTask(task.id, { projectId: p.id, status: task.status }, `Moved to ${p.name}.`),
    })) },
    { label: "Move up", disabled: i <= 0, onSelect: () => board.moveTask(task.id, to(task.status, i - 1), "Order saved.") },
    { label: "Move down", disabled: i >= column.length - 1, onSelect: () => board.moveTask(task.id, to(task.status, i + 1), "Order saved.") },
    "separator", { label: "Delete", danger: true, onSelect: () => board.deleteTask(task) },
  ];
}

function CheckButton({ task, done, reduce }: { task: Task; done: boolean; reduce: boolean }) {
  const board = useBoard();
  return <button type="button" className="check-button" data-done={done} aria-label={task.status === "Done" ? `Reopen ${task.title}` : `Complete ${task.title}`}
    onClick={() => task.status === "Done" ? board.moveTask(task.id, { projectId: task.projectId, status: "To do" }, "Task reopened.") : board.completeTask(task, reduce)}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" />
      <motion.path d="M6.2 10.4l2.6 2.6 5-5.4" initial={false} animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }} />
    </svg>
  </button>;
}

function TaskCard({ task, reduce }: { task: Task; reduce: boolean }) {
  const board = useBoard();
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id: `task:${task.id}`, data: { type: "task", task } });
  const { onKeyDown, ...pointer } = listeners ?? {};
  const done = task.status === "Done" || board.completing === task.id;
  const due = taskDeadline(task);
  const entries = taskMenu(board, task);
  return <motion.li layoutId={`task-${task.id}`} layout="position" className="task-item"
    transition={board.instant || reduce ? { duration: 0 } : { type: "spring", duration: 0.25, bounce: 0 }}>
    <RightClickMenu entries={entries}>
      <article ref={setNodeRef} {...pointer} className="task-card" data-task-card={task.id} data-done={done} data-dragging={isDragging}
        style={{ transform: CSS.Translate.toString(transform), transition }}>
        <CheckButton task={task} done={done} reduce={reduce} />
        <div className="task-card-body">
          <button type="button" className="task-card-title" data-task-link={task.id} onClick={(e) => board.openTask(task.id, e.currentTarget.closest("article"))}>{task.title}</button>
          {(due || task.important) && <span className="task-card-meta">
            {task.important && <span className="row-meta is-important"><Star size={12} aria-hidden="true" />Important</span>}
            {due && <span className={`row-meta deadline-task${due < board.today && task.status !== "Done" ? " is-overdue" : ""}`}>
              <CalendarDays size={12} aria-hidden="true" /><span className="sr-only">Due </span>{due < board.today && task.status !== "Done" ? "Overdue · " : ""}<time dateTime={due}>{shortDate(due)}</time></span>}
          </span>}
        </div>
        <span className="row-tools">
          <button type="button" className="icon-button grip" ref={setActivatorNodeRef} {...attributes} onKeyDown={onKeyDown as React.KeyboardEventHandler}
            aria-label={`Move ${task.title}`} title="Drag, or press Enter to move with the arrow keys"><GripVertical size={15} aria-hidden="true" /></button>
          <MoreMenu label={`Actions for ${task.title}`} entries={entries} />
        </span>
      </article>
    </RightClickMenu>
  </motion.li>;
}

function Count({ n }: { n: number }) {
  return <span className="group-count"><AnimatePresence mode="popLayout" initial={false}>
    <motion.span key={n} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 6, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>{n}</motion.span>
  </AnimatePresence></span>;
}

function AddTask({ status }: { status: Task["status"] }) {
  const board = useBoard();
  const [title, setTitle] = useState("");
  return <input className="column-add" aria-label={`Add task to ${status}`} placeholder="+ Add task" value={title} maxLength={500}
    onChange={(e) => setTitle(e.target.value)}
    onKeyDown={async (e) => {
      if (e.key === "Escape") { setTitle(""); e.currentTarget.blur(); }
      if (e.key !== "Enter" || !title.trim()) return;
      e.preventDefault();
      // Saved literally; the field stays focused for the next one.
      if (await board.createTask(board.selectedKey, status, title)) setTitle("");
    }} />;
}

function Column({ status, tasks, dragging, reduce }: { status: Task["status"]; tasks: Task[]; dragging: string | null; reduce: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { type: "column", status } });
  const id = `column-${status.replace(" ", "-").toLowerCase()}`;
  return <section ref={setNodeRef} className="task-column" aria-labelledby={id} data-over={dragging === "task" && isOver}>
    <h2 id={id}>{status}<Count n={tasks.length} /></h2>
    <SortableContext items={tasks.map((t) => `task:${t.id}`)} strategy={verticalListSortingStrategy}>
      <ul className="task-list">{tasks.map((t) => <TaskCard key={t.id} task={t} reduce={reduce} />)}</ul>
    </SortableContext>
    <AddTask status={status} />
  </section>;
}

function DeadlineField({ project }: { project: Project }) {
  const board = useBoard();
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  if (!editing) return <button type="button" className="inline-text board-meta" aria-label="Edit project deadline" onClick={() => { cancelled.current = false; setEditing(true); }}>
    <CalendarDays size={14} aria-hidden="true" className="deadline-project" />{project.deadline ? <>Deadline <time dateTime={project.deadline}>{shortDate(project.deadline)}</time></> : "Add deadline"}
  </button>;
  return <input type="date" className="inline-input board-date" aria-label="Project deadline" autoFocus defaultValue={project.deadline ?? ""}
    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setEditing(false); } if (e.key === "Enter") e.currentTarget.blur(); }}
    onBlur={(e) => {
      setEditing(false);
      const value = e.target.value || null;
      if (!cancelled.current && value !== project.deadline) void board.patchProject(project, { deadline: value }, value ? "Deadline set." : "Deadline cleared.");
    }} />;
}

function eventWhen(e: Event, timezone: string) {
  if (e.allDay) return shortDate(e.start);
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(e.start));
}

export function TaskBoard({ dragging, reduce }: { dragging: string | null; reduce: boolean }) {
  const board = useBoard();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const project = board.selected;
  const tasks = board.byProject.get(board.selectedKey) ?? [];
  const summary = board.summaries.get(board.selectedKey)!;
  return <section className="board-pane" aria-label={project?.name ?? "No project"}
    // Narrow screens: swipe right to return to the project list.
    onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
    onTouchEnd={(e) => {
      const start = touch.current; touch.current = null;
      if (!start || dragging || board.level !== "board" || !matchMedia("(max-width: 760px)").matches) return;
      const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y;
      if (dx > 80 && Math.abs(dy) < 50) board.backToList();
    }}>
    <button type="button" className="board-back" onClick={board.backToList}><ChevronLeft size={18} aria-hidden="true" />Projects</button>
    <header className="board-head">
      <div className="board-title-row">
        <h2 className="board-title">{project
          ? <InlineText value={project.name} label="project name" required onSave={(name) => board.patchProject(project, { name }, "Project renamed.")} />
          : "No project"}</h2>
        <span className="board-progress">{summary.done} of {summary.total} done</span>
        {project && <MoreMenu label={`Actions for ${project.name}`} entries={projectMenu(board, project)} />}
      </div>
      {project && <>
        <InlineText className="board-description" value={project.description} label="project description" multiline placeholder="Add a description"
          onSave={(description) => board.patchProject(project, { description }, "Description saved.")} />
        <div className="board-meta-row">
          <DeadlineField key={project.id} project={project} />
          <span className="board-meta">{project.archivedAt ? "Archived" : project.status}</span>
        </div>
      </>}
    </header>
    {board.events.length > 0 && <ul className="event-strip" aria-label="Upcoming events">{board.events.map((e) =>
      <li key={e.id}><Link href={`/calendar?event=${e.id}&date=${e.allDay ? e.start : dateInTimezone(e.start, board.timezone)}`}>
        <CalendarClock size={14} aria-hidden="true" /><span className="event-title">{e.title}</span><span className="muted">{eventWhen(e, board.timezone)}</span>
      </Link></li>)}</ul>}
    {board.error && <p role="alert" className="error-message board-error">{board.error}</p>}
    <div className="task-columns">{taskColumns.map((status) =>
      <Column key={`${board.selectedKey}-${status}`} status={status} tasks={tasks.filter((t) => t.status === status)} dragging={dragging} reduce={reduce} />)}</div>
  </section>;
}
