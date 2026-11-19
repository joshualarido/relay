"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReducedMotion } from "motion/react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Event, Project, Task } from "@/lib/db/schema";
import type { DeletionPreview } from "@/lib/lifecycle";
import { isShortcutBlocked } from "@/lib/screens";
import { dateInTimezone } from "@/lib/dates";
import { NO_PROJECT, groupProjects, planProjectMove, planTaskMove, summarize, tasksByProject, upcomingEvents, type Summary } from "@/lib/project-board";
import { notifyMutation } from "../mutation-notice";
import { useProjectCompletion } from "../project-completion";
import { useConfirmation } from "../confirm-dialog";
import { ProjectList } from "./project-list";
import { TaskBoard } from "./board";
import { DetailSheet } from "./detail-sheet";

type TaskTarget = { projectId: string | null; status: Task["status"]; index?: number };
type DragData =
  | { type: "task"; task: Task } | { type: "project"; project: Project }
  | { type: "column"; status: Task["status"] } | { type: "target"; key: string } | { type: "group"; status: Project["status"] };

export type BoardApi = ReturnType<typeof useBoardState>;
const BoardContext = createContext<BoardApi | null>(null);
export function useBoard() { return useContext(BoardContext)!; }

// Where the details sheet grows from, and where focus returns when it closes. Set when a sheet opens.
let sheetOrigin: { rect: DOMRect | null; focus: string | null } = { rect: null, focus: null };
/** Read the opening card's box once (it is cleared), or with `close`, the element to refocus. */
export function takeSheetOrigin(close = false) {
  const current = sheetOrigin;
  sheetOrigin = close ? { rect: null, focus: null } : { ...current, rect: null };
  return current;
}

const narrow = () => matchMedia("(max-width: 760px)").matches;
const projectKey = (projectId: string | null) => projectId ?? NO_PROJECT;

function useBoardState({ projects: serverProjects, tasks: serverTasks, events, timezone, now }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [projects, setProjectsState] = useState(serverProjects);
  const [tasks, setTasksState] = useState(serverTasks);
  const [synced, setSynced] = useState({ serverProjects, serverTasks });
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  // Drag commits land without a layout animation (the card is already where it was dropped); menu and check moves animate.
  const [instant, setInstant] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [projectSheet, setProjectSheet] = useState(false);
  const { reviewCompletion, confirmation: completionDialog } = useProjectCompletion();
  const { confirm, confirmation: confirmDialog } = useConfirmation();
  // Saves run one at a time, each planned from the latest state (with the revisions the previous save returned).
  const latest = useRef({ projects: serverProjects, tasks: serverTasks });
  const server = useRef({ projects: serverProjects, tasks: serverTasks });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => { latest.current = { projects, tasks }; }, [projects, tasks]);
  useEffect(() => { server.current = { projects: serverProjects, tasks: serverTasks }; }, [serverProjects, serverTasks]);

  // Fresh server data replaces local state, except while saves are in flight (their own refresh follows).
  if (!busy && (synced.serverProjects !== serverProjects || synced.serverTasks !== serverTasks)) {
    setSynced({ serverProjects, serverTasks }); setProjectsState(serverProjects); setTasksState(serverTasks);
  }
  function setTasks(next: Task[] | ((all: Task[]) => Task[])) {
    const value = typeof next === "function" ? next(latest.current.tasks) : next;
    latest.current = { ...latest.current, tasks: value }; setTasksState(value);
  }
  function setProjects(next: Project[] | ((all: Project[]) => Project[])) {
    const value = typeof next === "function" ? next(latest.current.projects) : next;
    latest.current = { ...latest.current, projects: value }; setProjectsState(value);
  }
  function enqueue<R>(job: () => Promise<R>): Promise<R> {
    const run = queue.current.then(job);
    queue.current = run.catch(() => undefined);
    return run;
  }

  const groups = useMemo(() => groupProjects(projects), [projects]);
  const byProject = useMemo(() => tasksByProject(tasks), [tasks]);
  const summaries = useMemo(() => {
    const map = new Map<string, Summary>([[NO_PROJECT, summarize(null, byProject.get(NO_PROJECT) ?? [])]]);
    for (const p of projects) map.set(p.id, summarize(p, p.archivedAt ? [] : byProject.get(p.id) ?? []));
    return map;
  }, [projects, byProject]);

  const param = params.get("project");
  const valid = param === NO_PROJECT || projects.some((p) => p.id === param);
  const selectedKey = param && valid ? param : groups.Active[0]?.id ?? groups.Planned[0]?.id ?? groups.Paused[0]?.id ?? NO_PROJECT;
  const selected = projects.find((p) => p.id === selectedKey) ?? null;
  const level = param && valid ? "board" : "list";
  const sheetTask = tasks.find((t) => t.id === params.get("task")) ?? null;

  function setQuery(update: (q: URLSearchParams) => void, push = false) {
    const q = new URLSearchParams(location.search);
    update(q);
    window.history[push ? "pushState" : "replaceState"](null, "", `${location.pathname}${q.size ? `?${q}` : ""}`);
  }
  function select(key: string) {
    setProjectSheet(false);
    // On a phone the board is a second level, so the system back gesture returns to the list.
    setQuery((q) => { q.set("project", key); q.delete("task"); }, narrow() && level === "list");
  }
  const backToList = () => setQuery((q) => { q.delete("project"); q.delete("task"); });
  function openTask(id: string, origin?: Element | null) {
    sheetOrigin = { rect: origin?.getBoundingClientRect() ?? null, focus: `[data-task-link="${id}"]` };
    setProjectSheet(false);
    setQuery((q) => { q.set("project", projectKey(tasks.find((t) => t.id === id)?.projectId ?? null)); q.set("task", id); });
  }
  function openProject(id = selectedKey, origin?: Element | null) {
    sheetOrigin = { rect: origin?.getBoundingClientRect() ?? null, focus: `[data-project-row="${id}"]` };
    setQuery((q) => q.delete("task"));
    setProjectSheet(true);
  }
  function closeSheet() { setProjectSheet(false); setQuery((q) => q.delete("task")); }

  function merge<T extends { id: string }>(set: (next: (all: T[]) => T[]) => void, records: T | T[]) {
    const list = Array.isArray(records) ? records : [records];
    const byId = new Map(list.map((r) => [r.id, r]));
    set((items) => [...items.map((i) => byId.get(i.id) ?? i), ...list.filter((r) => !items.some((i) => i.id === r.id))]);
  }

  /** One save: optimistic state is already applied; failure rolls back to the last server state with an inline error. */
  async function send<R>(path: string, method: "POST" | "PATCH", body: object, message: string, apply?: (result: R) => void): Promise<R | null> {
    setBusy((n) => n + 1); setError("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, mutationId: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save. Nothing was changed.");
      apply?.(result);
      notifyMutation(response, () => router.refresh(), { message });
      return result as R;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not connect. Nothing was changed.");
      setProjects(server.current.projects); setTasks(server.current.tasks);
      return null;
    } finally { setBusy((n) => n - 1); router.refresh(); }
  }

  const moveTask = (id: string, to: TaskTarget, message: string, drag = false) => enqueue(async () => {
    const plan = planTaskMove(latest.current.tasks, id, to);
    if (!plan) return;
    setInstant(drag); setTasks(plan.next);
    await send<Task[]>("/api/tasks/reorder", "POST", { id, projectId: to.projectId, status: to.status, orderedIds: plan.orderedIds, expectedRevisions: plan.expectedRevisions },
      message, (saved) => merge(setTasks, saved));
  });
  async function completeTask(task: Task, reduce: boolean) {
    if (completing) return;
    // The check draws and the title strikes through before the card moves into Done.
    setCompleting(task.id);
    if (!reduce) await new Promise((done) => setTimeout(done, 220));
    setCompleting(null);
    await moveTask(task.id, { projectId: task.projectId, status: "Done", index: 0 }, "Task completed.");
  }
  const moveProject = (project: Project, to: { status: Project["status"]; index?: number }, message: string, drag = false) => enqueue(async () => {
    let completionPreview;
    if (to.status === "Done" && project.status !== "Done") {
      try { completionPreview = await reviewCompletion(project.id, project.name); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load the completion preview."); return; }
      if (completionPreview === null) return;
    }
    const plan = planProjectMove(latest.current.projects, project.id, to);
    if (!plan) return;
    setInstant(drag); setProjects((all) => all.map((p) => plan.next.find((n) => n.id === p.id) ?? p));
    await send<Project[]>("/api/projects/reorder", "POST", { id: project.id, status: to.status, orderedIds: plan.orderedIds, expectedRevisions: plan.expectedRevisions, completionPreview },
      message, (saved) => merge(setProjects, saved));
  });
  const createTask = (key: string, status: Task["status"], title: string) => enqueue(async () => {
    const position = latest.current.tasks.filter((t) => (t.projectId ?? NO_PROJECT) === key && t.status === status).length;
    setInstant(false);
    return Boolean(await send<Task>("/api/tasks", "POST", { title, projectId: key === NO_PROJECT ? null : key, status, position }, "Task added.", (t) => merge(setTasks, t)));
  });
  async function createProject(name: string) {
    const created = await enqueue(() => send<Project>("/api/projects", "POST",
      { name, status: "Planned", position: latest.current.projects.filter((p) => p.status === "Planned" && !p.archivedAt).length }, "Project created.", (p) => merge(setProjects, p)));
    if (created) select(created.id);
    return Boolean(created);
  }
  const patchTask = (task: Task, fields: Partial<Task>, message: string) => enqueue(async () => {
    const current = latest.current.tasks.find((t) => t.id === task.id) ?? task;
    setInstant(false); setTasks((all) => all.map((t) => t.id === task.id ? { ...t, ...fields } : t));
    return Boolean(await send<Task>(`/api/tasks/${task.id}`, "PATCH", { expectedRevision: current.revision, ...fields }, message, (t) => merge(setTasks, t)));
  });
  const patchProject = (project: Project, fields: Partial<Pick<Project, "name" | "description" | "deadline">> | { archived: boolean }, message: string) => enqueue(async () => {
    const current = latest.current.projects.find((p) => p.id === project.id) ?? project;
    if (!("archived" in fields)) setProjects((all) => all.map((p) => p.id === project.id ? { ...p, ...fields } : p));
    return Boolean(await send<Project>(`/api/projects/${project.id}`, "PATCH", { expectedRevision: current.revision, ...fields }, message, (p) => merge(setProjects, p)));
  });
  const remove = (entityType: "task" | "project", id: string, name: string) => enqueue(() => removeNow(entityType, id, name));
  async function removeNow(entityType: "task" | "project", id: string, name: string) {
    let preview: DeletionPreview;
    try {
      const response = await fetch(`/api/${entityType}s/${id}/deletion`);
      preview = await response.json();
      if (!response.ok) throw new Error((preview as unknown as { error: string }).error);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load the deletion preview."); return; }
    const others = preview.records.filter((r) => r.id !== id);
    if (!await confirm({
      title: entityType === "task" ? "Delete task?" : "Delete project?", action: "Delete",
      description: others.length ? `"${name}" and these linked records are deleted together. You can undo this.` : `"${name}" is deleted. You can undo this.`,
      details: others.length ? <ul className="preview-list">{others.map((r) => <li key={r.id}><span>{r.label}</span><span className="muted">{r.entityType}</span></li>)}</ul> : undefined,
    })) return;
    const done = await send("/api/" + entityType + "s/" + id + "/deletion", "POST", preview, entityType === "task" ? "Task deleted." : "Project deleted.");
    if (!done) return;
    closeSheet();
    if (entityType === "task") setTasks((all) => all.filter((t) => t.id !== id));
    else { setProjects((all) => all.filter((p) => p.id !== id)); if (selectedKey === id) setQuery((q) => q.delete("project")); }
  }

  return {
    projects, tasks, groups, byProject, summaries, events: upcomingEvents(events, tasks, selectedKey, now, timezone),
    timezone, today: dateInTimezone(now, timezone), selectedKey, selected, level, sheetTask, projectSheet, pending: busy > 0, error, setError, instant, completing,
    select, backToList, openTask, openProject, closeSheet, moveTask, completeTask, moveProject, createTask, createProject, patchTask, patchProject,
    deleteTask: (t: Task) => remove("task", t.id, t.title), deleteProject: (p: Project) => remove("project", p.id, p.name),
    dialogs: <>{completionDialog}{confirmDialog}</>,
  };
}

type Props = { projects: Project[]; tasks: Task[]; events: Event[]; timezone: string; now: string };

/** Projects: the project list and the selected project's task board, one drag context across both panes. */
export function ProjectsView(props: Props) {
  const board = useBoardState(props);
  const reduce = useReducedMotion();
  const [active, setActive] = useState<DragData | null>(null);
  const [creating, setCreating] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "n" && !isShortcutBlocked(e)) {
        e.preventDefault(); setCreating(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Only drop targets that fit what is being dragged; the pointer wins, keyboard drags use the nearest corner.
  const collision: CollisionDetection = (args) => {
    const type = (args.active.data.current as DragData | undefined)?.type;
    const allowed = type === "task" ? ["task", "column", "target"] : ["project", "group"];
    const droppableContainers = args.droppableContainers.filter((c) => allowed.includes((c.data.current as DragData | undefined)?.type ?? ""));
    const scoped = { ...args, droppableContainers };
    const hits = pointerWithin(scoped);
    if (hits.length) return [...hits].sort((a, b) => Number(["column", "group"].includes(String(a.data?.droppableContainer.data.current?.type)))
      - Number(["column", "group"].includes(String(b.data?.droppableContainer.data.current?.type))));
    return args.pointerCoordinates ? [] : closestCorners(scoped);
  };

  function onDragEnd({ active: a, over }: DragEndEvent) {
    setActive(null);
    const from = a.data.current as DragData, to = over?.data.current as DragData | undefined;
    if (!to) return;
    if (from.type === "task") {
      const task = from.task;
      let target: TaskTarget | null = null;
      if (to.type === "task") {
        const column = (board.byProject.get(projectKey(to.task.projectId)) ?? []).filter((t) => t.status === to.task.status);
        target = { projectId: to.task.projectId, status: to.task.status, index: column.findIndex((t) => t.id === to.task.id) };
      } else if (to.type === "column") target = { projectId: task.projectId, status: to.status };
      else if (to.type === "target") {
        const projectId = to.key === NO_PROJECT ? null : to.key;
        if (projectId === task.projectId) return;
        target = { projectId, status: task.status };
        const name = board.projects.find((p) => p.id === projectId)?.name ?? "No project";
        return void board.moveTask(task.id, target, `Moved to ${name}.`, true);
      }
      if (!target) return;
      const column = (board.byProject.get(projectKey(target.projectId)) ?? []).filter((t) => t.status === target.status);
      if (target.status === task.status && (target.index ?? column.length - 1) === column.findIndex((t) => t.id === task.id)) return;
      void board.moveTask(task.id, target, target.status === task.status ? "Order saved." : `Moved to ${target.status}.`, true);
    } else if (from.type === "project") {
      const project = from.project;
      let status: Project["status"], index: number | undefined;
      if (to.type === "project") { status = to.project.status; index = board.groups[status].findIndex((p) => p.id === to.project.id); }
      else if (to.type === "group") status = to.status;
      else return;
      if (status === project.status && (index ?? board.groups[status].length - 1) === board.groups[status].findIndex((p) => p.id === project.id)) return;
      void board.moveProject(project, { status, index }, status === project.status ? "Order saved." : `Moved to ${status}.`, true);
    }
  }

  return <BoardContext.Provider value={board}>
    <DndContext id="projects" sensors={sensors} collisionDetection={collision} onDragStart={({ active: a }: DragStartEvent) => setActive(a.data.current as DragData)}
      onDragCancel={() => setActive(null)} onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions: { draggable: "To pick up, press Space or Enter. Use the arrow keys to move, Enter to drop, Escape to cancel." } }}>
      <div className="projects-split" data-level={board.level} data-dragging={active?.type ?? undefined}>
        <ProjectList creating={creating} setCreating={setCreating} dragging={active?.type ?? null} />
        <TaskBoard dragging={active?.type ?? null} reduce={Boolean(reduce)} />
      </div>
      <DragOverlay dropAnimation={null}>
        {active?.type === "task" ? <div className="task-card is-overlay"><span className="task-card-title">{active.task.title}</span></div>
          : active?.type === "project" ? <div className="project-row is-overlay"><span className="project-row-name">{active.project.name}</span></div> : null}
      </DragOverlay>
    </DndContext>
    <DetailSheet />
    {board.dialogs}
  </BoardContext.Provider>;
}
