"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, Clock, Flag, GripVertical, Search, X } from "lucide-react";
import type { Event, Project, Task } from "@/lib/db/schema";
import { groupUnscheduledTasks, listDatelessProjects, listUnscheduledEvents } from "@/lib/calendar-schedule";

export type ScheduleItem =
  | { kind: "project"; source: "project"; id: string; title: string; project: Project }
  | { kind: "task"; source: "unscheduled-task"; id: string; title: string; task: Task }
  | { kind: "event"; source: "unscheduled-event"; id: string; title: string; event: Event };

function clampPanel(x: number, y: number, width = 320, height = 480) {
  if (typeof window === "undefined") return { x, y };
  const pad = 16;
  return {
    x: Math.max(pad, Math.min(x, window.innerWidth - width - pad)),
    y: Math.max(pad, Math.min(y, window.innerHeight - height - pad)),
  };
}

export function SchedulePanel({
  open,
  onClose,
  projects,
  tasks,
  events,
  highlightedTaskId,
  keptTaskIds,
  pickedItem,
  onPickItem,
  onPointerDragStart,
  anchorPos,
  announcement,
  error,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  tasks: Task[];
  events: Event[];
  timezone: string;
  highlightedTaskId: string | null;
  keptTaskIds: ReadonlySet<string>;
  pickedItem: ScheduleItem | null;
  onPickItem: (item: ScheduleItem | null) => void;
  onPointerDragStart: (item: ScheduleItem, event: React.PointerEvent<HTMLButtonElement>) => void;
  anchorPos: { x: number; y: number } | null;
  announcement: string;
  error: string;
}) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [userMovedSelection, setUserMovedSelection] = useState(false);
  const [openSections, setOpenSections] = useState({ projects: true, tasks: true, events: true });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined") return null;
    const width = 320;
    const height = Math.min(500, window.innerHeight - 32);
    const startX = anchorPos ? anchorPos.x + 12 : window.innerWidth - width - 32;
    const startY = anchorPos ? anchorPos.y + 12 : 96;
    return clampPanel(startX, startY, width, height);
  });
  const [prevAnchor, setPrevAnchor] = useState(anchorPos);
  if (anchorPos && anchorPos !== prevAnchor) {
    setPrevAnchor(anchorPos);
    if (typeof window !== "undefined") {
      const width = 320;
      const height = Math.min(500, window.innerHeight - 32);
      setPos(clampPanel(anchorPos.x + 12, anchorPos.y + 12, width, height));
    }
  }
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const includeTaskIds = useMemo(() => {
    const set = new Set<string>(keptTaskIds);
    if (highlightedTaskId) set.add(highlightedTaskId);
    return set;
  }, [highlightedTaskId, keptTaskIds]);

  const datelessProjects = useMemo(() => listDatelessProjects(projects, query), [projects, query]);
  const unscheduledTaskGroups = useMemo(
    () => groupUnscheduledTasks(tasks, projects, events, { query, includeTaskIds }),
    [tasks, projects, events, query, includeTaskIds],
  );
  const unscheduledEvents = useMemo(() => listUnscheduledEvents(events, query), [events, query]);
  const unscheduledTaskCount = useMemo(
    () => unscheduledTaskGroups.reduce((n, g) => n + g.tasks.length, 0),
    [unscheduledTaskGroups],
  );
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const flatItems = useMemo<ScheduleItem[]>(() => {
    const items: ScheduleItem[] = [];
    if (openSections.projects) {
      for (const project of datelessProjects) {
        items.push({ kind: "project", source: "project", id: project.id, title: project.name, project });
      }
    }
    if (openSections.tasks) {
      for (const g of unscheduledTaskGroups) {
        for (const task of g.tasks) items.push({ kind: "task", source: "unscheduled-task", id: task.id, title: task.title, task });
      }
    }
    if (openSections.events) {
      for (const event of unscheduledEvents) {
        items.push({ kind: "event", source: "unscheduled-event", id: event.id, title: event.title, event });
      }
    }
    return items;
  }, [openSections, datelessProjects, unscheduledTaskGroups, unscheduledEvents]);

  const highlightedIndex = highlightedTaskId
    ? flatItems.findIndex((item) => item.kind === "task" && item.id === highlightedTaskId)
    : -1;
  const effectiveIndex = !userMovedSelection && highlightedIndex >= 0 ? highlightedIndex : activeIndex;
  const safeIndex = flatItems.length === 0 ? -1 : Math.min(effectiveIndex, flatItems.length - 1);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.focus();
      if (highlightedTaskId) {
        panelRef.current
          ?.querySelector<HTMLElement>(`[data-schedule-item="task:${CSS.escape(highlightedTaskId)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, highlightedTaskId]);

  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches) return;
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const onMove = (ev: PointerEvent) => {
      setPos(clampPanel(ev.clientX - offsetX, ev.clientY - offsetY, rect.width, rect.height));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (pickedItem) onPickItem(null);
      else onClose();
      return;
    }
    if (pickedItem) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setUserMovedSelection(true);
        setActiveIndex((prev) => (prev + 1) % flatItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setUserMovedSelection(true);
        setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      }
    } else if (e.key === "Enter" && safeIndex >= 0 && flatItems[safeIndex]) {
      e.preventDefault();
      onPickItem(flatItems[safeIndex]);
    }
  }

  if (!open) return null;

  let runningIndex = 0;

  return (
    <motion.aside
      ref={panelRef}
      tabIndex={-1}
      className="schedule-panel"
      role="region"
      aria-label="Schedule panel"
      data-schedule-panel="true"
      initial={reduce ? false : { opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: reduce ? 0 : 0.15, ease: "easeOut" }}
      style={pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : undefined}
      onKeyDown={onPanelKeyDown}
    >
      <div className="schedule-panel-header" onPointerDown={onHeaderPointerDown}>
        <span className="schedule-panel-grip" aria-hidden="true">
          <GripVertical size={15} />
        </span>
        <h2>Schedule</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close schedule mode"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="schedule-search">
        <Search size={14} className="schedule-search-icon" aria-hidden="true" />
        <label htmlFor="schedule-search-input" className="sr-only">
          Filter unscheduled items
        </label>
        <input
          ref={searchRef}
          id="schedule-search-input"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setUserMovedSelection(true);
            setActiveIndex(0);
          }}
          placeholder="Filter tasks, events, projects"
          autoComplete="off"
        />
      </div>

      {pickedItem && (
        <div className="schedule-picked-bar" role="status">
          <span>
            Placing: <strong>{pickedItem.title}</strong>
          </span>
          <button type="button" className="text-quiet" onClick={() => onPickItem(null)}>
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="error-message schedule-error">
          {error}
        </p>
      )}

      <div className="schedule-lists">
        {/* 1) Projects without a deadline */}
        <section className="schedule-section" aria-label="Projects without a deadline">
          <button
            type="button"
            className="schedule-section-toggle"
            aria-expanded={openSections.projects}
            onClick={() => setOpenSections((s) => ({ ...s, projects: !s.projects }))}
          >
            <ChevronRight size={13} aria-hidden="true" />
            <span>Projects without a deadline</span>
            <span className="schedule-section-count">{datelessProjects.length}</span>
          </button>
          {openSections.projects && (
            datelessProjects.length === 0 ? (
              <p className="muted text-sm schedule-empty">All projects have deadlines.</p>
            ) : (
              <ul className="schedule-list">
                <AnimatePresence initial={false}>
                  {datelessProjects.map((project) => {
                    const idx = runningIndex++;
                    const item: ScheduleItem = { kind: "project", source: "project", id: project.id, title: project.name, project };
                    const isPicked = pickedItem?.kind === "project" && pickedItem.id === project.id;
                    return (
                      <motion.li
                        key={project.id}
                        layout={!reduce}
                        initial={false}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
                      >
                        <button
                          type="button"
                          className="schedule-item"
                          data-schedule-item={`project:${project.id}`}
                          data-picked={isPicked ? "true" : undefined}
                          data-selected={idx === safeIndex ? "true" : undefined}
                          onMouseEnter={() => { setUserMovedSelection(true); setActiveIndex(idx); }}
                          onFocus={() => { setUserMovedSelection(true); setActiveIndex(idx); }}
                          onPointerDown={(e) => onPointerDragStart(item, e)}
                        >
                          <Flag size={13} aria-hidden="true" className="schedule-item-project-icon" />
                          <span className="schedule-item-title">{project.name}</span>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )
          )}
        </section>

        {/* 2) Unscheduled tasks */}
        <section className="schedule-section" aria-label="Unscheduled tasks">
          <button
            type="button"
            className="schedule-section-toggle"
            aria-expanded={openSections.tasks}
            onClick={() => setOpenSections((s) => ({ ...s, tasks: !s.tasks }))}
          >
            <ChevronRight size={13} aria-hidden="true" />
            <span>Unscheduled tasks</span>
            <span className="schedule-section-count">{unscheduledTaskCount}</span>
          </button>
          {openSections.tasks && (
            unscheduledTaskGroups.length === 0 ? (
              <p className="muted text-sm schedule-empty">No unscheduled tasks.</p>
            ) : (
              <ul className="schedule-list">
                <AnimatePresence initial={false}>
                  {unscheduledTaskGroups.flatMap((group) =>
                    group.tasks.map((task) => {
                      const idx = runningIndex++;
                      const item: ScheduleItem = { kind: "task", source: "unscheduled-task", id: task.id, title: task.title, task };
                      const isPicked = pickedItem?.kind === "task" && pickedItem.id === task.id;
                      const isHighlighted = highlightedTaskId === task.id;
                      return (
                        <motion.li
                          key={task.id}
                          layout={!reduce}
                          initial={false}
                          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
                          transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
                        >
                          <button
                            type="button"
                            className="schedule-item"
                            data-schedule-item={`task:${task.id}`}
                            data-highlighted={isHighlighted ? "true" : undefined}
                            data-picked={isPicked ? "true" : undefined}
                            data-selected={idx === safeIndex ? "true" : undefined}
                            onMouseEnter={() => { setUserMovedSelection(true); setActiveIndex(idx); }}
                            onFocus={() => { setUserMovedSelection(true); setActiveIndex(idx); }}
                            onPointerDown={(e) => onPointerDragStart(item, e)}
                          >
                            <GripVertical size={13} aria-hidden="true" className="schedule-item-grip" />
                            <span className="schedule-item-body">
                              <span className="schedule-item-title">{task.title}</span>
                              <span className="schedule-item-project">{group.name}</span>
                            </span>
                          </button>
                        </motion.li>
                      );
                    }),
                  )}
                </AnimatePresence>
              </ul>
            )
          )}
        </section>

        {/* 3) Unscheduled events */}
        <section className="schedule-section" aria-label="Unscheduled events">
          <button
            type="button"
            className="schedule-section-toggle"
            aria-expanded={openSections.events}
            onClick={() => setOpenSections((s) => ({ ...s, events: !s.events }))}
          >
            <ChevronRight size={13} aria-hidden="true" />
            <span>Unscheduled events</span>
            <span className="schedule-section-count">{unscheduledEvents.length}</span>
          </button>
          {openSections.events && (
            unscheduledEvents.length === 0 ? (
              <p className="muted text-sm schedule-empty">No unscheduled events.</p>
            ) : (
              <ul className="schedule-list">
                <AnimatePresence initial={false}>
                  {unscheduledEvents.map((ev) => {
                    const idx = runningIndex++;
                    const item: ScheduleItem = { kind: "event", source: "unscheduled-event", id: ev.id, title: ev.title, event: ev };
                    const isPicked = pickedItem?.kind === "event" && pickedItem.id === ev.id;
                    const projectName = ev.projectId ? projectMap.get(ev.projectId) : null;
                    return (
                      <motion.li
                        key={ev.id}
                        layout={!reduce}
                        initial={false}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
                      >
                        <button
                          type="button"
                          className="schedule-item"
                          data-schedule-item={`event:${ev.id}`}
                          data-picked={isPicked ? "true" : undefined}
                          data-selected={idx === safeIndex ? "true" : undefined}
                          onMouseEnter={() => { setUserMovedSelection(true); setActiveIndex(idx); }}
                          onFocus={() => { setUserMovedSelection(true); setActiveIndex(idx); }}
                          onPointerDown={(e) => onPointerDragStart(item, e)}
                        >
                          <Clock size={13} aria-hidden="true" className="schedule-item-grip" />
                          <span className="schedule-item-body">
                            <span className="schedule-item-title">{ev.title}</span>
                            {projectName && <span className="schedule-item-project">{projectName}</span>}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )
          )}
        </section>
      </div>

      <div className="sr-only" aria-live="polite" role="status">{announcement}</div>
    </motion.aside>
  );
}
