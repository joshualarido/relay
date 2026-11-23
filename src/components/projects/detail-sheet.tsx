"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Dialog } from "radix-ui";
import { animate, useReducedMotion } from "motion/react";
import { Star, X } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import { instantToLocal, localToInstant } from "@/lib/dates";
import { NO_PROJECT, projectGroups, taskColumns } from "@/lib/project-board";
import { DEFAULT_TASK_TYPE_MINUTES } from "@/lib/capacity";
import { DurationField } from "../duration-field";
import { RecurrencePicker } from "../recurrence-picker";
import { useWorkspace } from "../workspace-store";
import { takeSheetOrigin, useBoard } from "./projects-view";
import { InlineText } from "./inline-text";

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return <div className="sheet-field"><span className="sheet-label" id={`seg-${label}`}>{label}</span>
    <div className="view-switch" role="group" aria-labelledby={`seg-${label}`}>
      {options.map((o) => <button type="button" key={o} aria-pressed={o === value} onClick={() => o !== value && onChange(o)}>{o}</button>)}
    </div></div>;
}

function TaskDetails({ task }: { task: Task }) {
  const board = useBoard();
  const workspace = useWorkspace();
  const projects = board.projects.filter((p) => !p.archivedAt || p.id === task.projectId);
  return <>
    <Dialog.Title asChild><h2 className="sheet-title"><InlineText value={task.title} label="task title" required onSave={(title) => board.patchTask(task, { title }, "Task renamed.")} /></h2></Dialog.Title>
    <Dialog.Description className="sr-only">Task details. Changes save as you make them.</Dialog.Description>
    <Segmented label="Status" options={taskColumns} value={task.status} onChange={(status) => board.moveTask(task.id, { projectId: task.projectId, status }, `Moved to ${status}.`)} />
    <Segmented label="Type" options={["Instant", "Medium", "Deep"] as const} value={task.taskType} onChange={(taskType) => board.patchTask(task, { taskType }, `Type set to ${taskType}.`)} />
    <div className="sheet-field"><label className="sheet-label" htmlFor="sheet-duration">Duration</label>
      <DurationField
        id="sheet-duration"
        key={task.id}
        value={task.durationMinutes ?? null}
        defaultMinutes={(workspace?.taskTypeMinutes ?? DEFAULT_TASK_TYPE_MINUTES)[task.taskType]}
        onCommit={(durationMinutes) => void board.patchTask(task, { durationMinutes }, durationMinutes ? "Duration set." : "Duration reset to the type default.")}
      /></div>
    <div className="sheet-field"><label className="sheet-label" htmlFor="sheet-project">Project</label>
      <select id="sheet-project" value={task.projectId ?? NO_PROJECT} onChange={(e) => {
        const projectId = e.target.value === NO_PROJECT ? null : e.target.value;
        void board.moveTask(task.id, { projectId, status: task.status }, `Moved to ${projects.find((p) => p.id === projectId)?.name ?? "No project"}.`);
      }}>
        <option value={NO_PROJECT}>No project</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.archivedAt ? " (archived)" : ""}</option>)}
      </select></div>
    <div className="sheet-field"><label className="sheet-label" htmlFor="sheet-exec-date">Execution date</label>
      <input id="sheet-exec-date" type="date" key={`${task.id}-${task.executionDate}`} defaultValue={task.executionDate ?? ""} onBlur={(e) => {
        const executionDate = e.target.value || null;
        if (executionDate !== task.executionDate) void board.patchTask(task, { executionDate }, executionDate ? "Execution date set." : "Execution date cleared.");
      }} /></div>
    <div className="sheet-field"><span className="sheet-label">Repeat</span>
      <RecurrencePicker
        value={task.recurrenceRule ?? null}
        onChange={(recurrenceRule) => void board.patchTask(task, { recurrenceRule }, recurrenceRule ? "Recurrence updated." : "Recurrence removed.")}
      />
    </div>
    <div className="sheet-field"><span className="sheet-label">Important</span>
      <button type="button" className="toggle-button" aria-pressed={Boolean(task.important)} onClick={() => board.patchTask(task, { important: !task.important }, task.important ? "Unmarked important." : "Marked important.")}>
        <Star size={15} aria-hidden="true" />{task.important ? "Important" : "Mark important"}</button></div>
    <div className="sheet-field"><span className="sheet-label">Notes</span>
      <InlineText className="sheet-notes" value={task.description} label="task notes" multiline placeholder="Add notes"
        onSave={(description) => board.patchTask(task, { description }, "Notes saved.")} /></div>
    {task.completedAt && <p className="muted text-sm">Completed <time dateTime={task.completedAt}>{new Date(task.completedAt).toLocaleString("en-GB", { timeZone: board.timezone, dateStyle: "medium", timeStyle: "short" })}</time></p>}
    <div className="sheet-actions">
      <Link className="text-quiet" href={`/calendar?schedule=1&task=${task.id}`}>Schedule</Link>
      <button type="button" className="text-quiet" onClick={() => board.archiveTask(task)}>Archive task</button>
    </div>
  </>;
}

function ProjectDetails({ project }: { project: Project }) {
  const board = useBoard();
  const timedLocal = project.deadlineAt
    ? instantToLocal(project.deadlineAt, project.deadlineTimezone ?? board.timezone)
    : "";
  const currentDate = timedLocal ? timedLocal.slice(0, 10) : (project.deadline ?? "");
  const currentTime = timedLocal ? timedLocal.slice(11, 16) : "";

  function saveDeadline(nextDate: string, nextTime: string) {
    if (!nextDate) {
      if (project.deadline || project.deadlineAt) {
        void board.patchProject(project, { deadline: null, deadlineAt: null, deadlineTimezone: null }, "Deadline cleared.");
      }
      return;
    }
    if (nextTime) {
      const deadlineAt = localToInstant(`${nextDate}T${nextTime}`, board.timezone);
      void board.patchProject(project, { deadline: null, deadlineAt, deadlineTimezone: board.timezone }, "Deadline set.");
    } else {
      void board.patchProject(project, { deadline: nextDate, deadlineAt: null, deadlineTimezone: null }, "Deadline set.");
    }
  }

  return <>
    <Dialog.Title asChild><h2 className="sheet-title"><InlineText value={project.name} label="project name" required onSave={(name) => board.patchProject(project, { name }, "Project renamed.")} /></h2></Dialog.Title>
    <Dialog.Description className="sr-only">Project details. Changes save as you make them.</Dialog.Description>
    {!project.archivedAt && <Segmented label="Status" options={projectGroups} value={project.status} onChange={(status) => board.moveProject(project, { status }, `Moved to ${status}.`)} />}
    <div className="sheet-field">
      <label className="sheet-label" htmlFor="sheet-deadline">Deadline</label>
      <div className="sheet-deadline-inputs">
        <input id="sheet-deadline" type="date" key={`${project.id}-${currentDate}`} defaultValue={currentDate} onBlur={(e) => {
          const nextDate = e.target.value;
          if (nextDate !== currentDate) saveDeadline(nextDate, currentTime);
        }} />
        <input aria-label="Deadline time (optional)" type="time" key={`${project.id}-${currentTime}`} defaultValue={currentTime} disabled={!currentDate} onBlur={(e) => {
          const nextTime = e.target.value;
          if (nextTime !== currentTime) saveDeadline(currentDate, nextTime);
        }} />
      </div>
    </div>
    <div className="sheet-field"><span className="sheet-label">Description</span>
      <InlineText className="sheet-notes" value={project.description} label="project description" multiline placeholder="Add a description"
        onSave={(description) => board.patchProject(project, { description }, "Description saved.")} /></div>
    <div className="sheet-actions">
      <button type="button" className="text-quiet" onClick={() => board.patchProject(project, { archived: !project.archivedAt }, project.archivedAt ? "Project unarchived." : "Project archived.")}>
        {project.archivedAt ? "Unarchive project" : "Archive project"}</button>
      <button type="button" className="text-danger" onClick={() => board.deleteProject(project)}>Delete project</button>
    </div>
  </>;
}

/** Details for a task or project: a side sheet on desktop, a bottom sheet on phones. Grows out of the card that opened it. */
export function DetailSheet() {
  const board = useBoard();
  const reduce = useReducedMotion();
  const task = board.sheetTask, project = !task && board.projectSheet ? board.selected : null;
  // Shared-element open: start at the card's box and settle into the sheet (a FLIP on transform).
  const grow = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const { rect: origin } = takeSheetOrigin();
    if (!origin || reduce) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.transformOrigin = "0 0";
    animate(el, {
      transform: [`translate(${origin.left - r.left}px, ${origin.top - r.top}px) scale(${origin.width / r.width}, ${origin.height / r.height})`, "translate(0px, 0px) scale(1, 1)"],
      opacity: [0.5, 1],
    }, { duration: 0.24, ease: [0.2, 0, 0, 1] });
  }, [reduce]);
  return <Dialog.Root open={Boolean(task || project)} onOpenChange={(open) => { if (!open) board.closeSheet(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="sheet-overlay" />
      <Dialog.Content ref={grow} className="detail-sheet" onCloseAutoFocus={(e) => {
        e.preventDefault();
        const { focus } = takeSheetOrigin(true);
        ((focus && document.querySelector<HTMLElement>(focus)) || document.getElementById("main"))?.focus();
      }}>
        <Dialog.Close className="icon-button sheet-close" aria-label="Close details"><X size={18} aria-hidden="true" /></Dialog.Close>
        {task ? <TaskDetails key={task.id} task={task} /> : project ? <ProjectDetails key={project.id} project={project} /> : null}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
