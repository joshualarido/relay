"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarDays, Flag, GripVertical, Search, X } from "lucide-react";
import type { Event, Project, Task } from "@/lib/db/schema";
import { dateInTimezone } from "@/lib/dates";
import { groupUnscheduledTasks, listDatelessProjects } from "@/lib/calendar-schedule";

export type ScheduleItem =
  | { kind: "task"; id: string; title: string; task: Task }
  | { kind: "project"; id: string; title: string; project: Project };

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

function clampPanel(x: number, y: number, width = 320, height = 440) {
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
  timezone,
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
  const [activeIndex, setActiveIndex] = useState(() => {
    if (!highlightedTaskId) return 0;
    return 0;
  });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined") return null;
    const width = 320;
    const height = Math.min(480, window.innerHeight - 32);
    const startX = anchorPos ? anchorPos.x + 12 : window.innerWidth - width - 32;
    const startY = anchorPos ? anchorPos.y + 12 : 96;
    return clampPanel(startX, startY, width, height);
  });
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const includeTaskIds = useMemo(() => {
    const set = new Set<string>(keptTaskIds);
    if (highlightedTaskId) set.add(highlightedTaskId);
    return set;
  }, [highlightedTaskId, keptTaskIds]);

  const taskGroups = useMemo(
    () => groupUnscheduledTasks(tasks, projects, events, { query, includeTaskIds }),
    [tasks, projects, events, query, includeTaskIds],
  );
  const datelessProjects = useMemo(
    () => listDatelessProjects(projects, query),
    [projects, query],
  );

  const flatItems = useMemo<ScheduleItem[]>(() => {
    const items: ScheduleItem[] = [];
    for (const g of taskGroups) {
      for (const task of g.tasks) items.push({ kind: "task", id: task.id, title: task.title, task });
    }
    for (const project of datelessProjects) {
      items.push({ kind: "project", id: project.id, title: project.name, project });
    }
    return items;
  }, [taskGroups, datelessProjects]);

  const highlightedIndex = highlightedTaskId
    ? flatItems.findIndex((item) => item.kind === "task" && item.id === highlightedTaskId)
    : -1;
  const [userMovedSelection, setUserMovedSelection] = useState(false);
  const effectiveIndex = !userMovedSelection && highlightedIndex >= 0 ? highlightedIndex : activeIndex;
  const safeIndex = flatItems.length === 0 ? -1 : Math.min(effectiveIndex, flatItems.length - 1);

  // Focus search input and scroll highlighted task into view on mount
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      searchRef.current?.focus();
      if (highlightedTaskId) {
        panelRef.current?.querySelector<HTMLElement>(`[data-schedule-item="task:${highlightedTaskId}"]`)?.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, highlightedTaskId]);

  if (!open) return null;

  function startPanelDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    if (window.matchMedia("(max-width: 760px)").matches) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    const onMove = (ev: PointerEvent) => {
      setPos(clampPanel(ev.clientX - offsetX, ev.clientY - offsetY, width, height));
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLElement>) {
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
        setActiveIndex((safeIndex + 1) % flatItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatItems.length > 0) {
        setUserMovedSelection(true);
        setActiveIndex((safeIndex - 1 + flatItems.length) % flatItems.length);
      }
    } else if (e.key === "Enter" && safeIndex >= 0) {
      e.preventDefault();
      onPickItem(flatItems[safeIndex]);
    }
  }

  let runningIndex = 0;

  return (
    <aside
      ref={panelRef}
      className="schedule-panel"
      role="region"
      aria-label="Schedule panel"
      data-schedule-open="true"
      style={pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="schedule-panel-header" onPointerDown={startPanelDrag}>
        <span className="schedule-panel-grip" aria-hidden="true"><GripVertical size={15} /></span>
        <h2>Schedule</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close schedule panel"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="schedule-search">
        <Search size={14} aria-hidden="true" className="schedule-search-icon" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Filter unscheduled work"
          placeholder="Search tasks and projects"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
        />
      </div>

      {pickedItem && (
        <div className="schedule-picked-bar">
          <span>Placing: <strong>{pickedItem.title}</strong></span>
          <button type="button" className="text-quiet" onClick={() => onPickItem(null)}>Cancel</button>
        </div>
      )}

      {error && <p role="alert" className="error-message schedule-error">{error}</p>}

      <div className="schedule-lists">
        <section className="schedule-section" aria-label="Unscheduled tasks">
          <h3>Unscheduled tasks</h3>
          {taskGroups.length === 0 ? (
            <p className="muted text-sm schedule-empty">No unscheduled tasks.</p>
          ) : (
            taskGroups.map((group) => (
              <div key={group.key} className="schedule-group">
                <h4 className="schedule-group-title">{group.name}</h4>
                <ul className="schedule-list">
                  <AnimatePresence initial={false}>
                    {group.tasks.map((task) => {
                      const idx = runningIndex++;
                      const item: ScheduleItem = { kind: "task", id: task.id, title: task.title, task };
                      const due = task.dueDate ?? (task.dueAt ? dateInTimezone(task.dueAt, timezone) : null);
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
                            onMouseEnter={() => setActiveIndex(idx)}
                            onFocus={() => setActiveIndex(idx)}
                            onPointerDown={(e) => onPointerDragStart(item, e)}
                          >
                            <GripVertical size={13} aria-hidden="true" className="schedule-item-grip" />
                            <span className="schedule-item-title">{task.title}</span>
                            {due && (
                              <span className="schedule-item-due">
                                <CalendarDays size={11} aria-hidden="true" />
                                <time dateTime={due}>{shortDate(due)}</time>
                              </span>
                            )}
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            ))
          )}
        </section>

        <section className="schedule-section" aria-label="Projects without a deadline">
          <h3>Projects without a deadline</h3>
          {datelessProjects.length === 0 ? (
            <p className="muted text-sm schedule-empty">All active projects have deadlines.</p>
          ) : (
            <ul className="schedule-list">
              <AnimatePresence initial={false}>
                {datelessProjects.map((project) => {
                  const idx = runningIndex++;
                  const item: ScheduleItem = { kind: "project", id: project.id, title: project.name, project };
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
                        onMouseEnter={() => setActiveIndex(idx)}
                        onFocus={() => setActiveIndex(idx)}
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
          )}
        </section>
      </div>

      <div className="sr-only" aria-live="polite" role="status">{announcement}</div>
    </aside>
  );
}
