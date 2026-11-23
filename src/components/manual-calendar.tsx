"use client";

import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { projectHref } from "@/lib/links";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover } from "radix-ui";
import { AnimatePresence } from "motion/react";
import FullCalendar, {
  type CalendarRef,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import dayGrid from "@fullcalendar/react/daygrid";
import timeGrid from "@fullcalendar/react/timegrid";
import list from "@fullcalendar/react/list";
import interaction from "@fullcalendar/react/interaction";
import classic from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import type { Event, Project, Task } from "@/lib/db/schema";
import {
  computeDayCapacity,
  DEFAULT_TASK_TYPE_MINUTES,
  DEFAULT_WORKING_HOURS,
  formatMinutes,
  resolveDayWorkingWindow,
  type DayWorkingWindow,
  type TaskTypeMinutes,
  type WeeklyWorkingHours,
} from "@/lib/capacity";
import { dateInTimezone } from "@/lib/dates";
import { projectRecurringDates } from "@/lib/recurrence";
import { isShortcutBlocked } from "@/lib/screens";
import {
  addMinutesInstant,
  buildEventDropAction,
  buildEventResizeEnd,
  buildProjectDropAction,
  buildTaskDropAction,
  isWorkingHour,
  type ScheduleDropTarget,
} from "@/lib/calendar-schedule";
import { CalendarPlus, ChevronLeft, ChevronRight, CircleCheck, Clock, Flag, Repeat, SlidersHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { SchedulePanel, type ScheduleItem } from "./schedule-panel";
import { useWorkspace } from "./workspace-store";
import { DragMomentum } from "./drag-momentum";

type Kind = "project" | "task" | "event";
const labels: Record<Kind, string> = { project: "Project deadline", task: "Task deadline", event: "Event" };
const colors: Record<Kind, string> = { project: "var(--project-deadline)", task: "var(--task-medium)", event: "var(--event)" };
const taskTypeColors: Record<Task["taskType"], string> = {
  Instant: "var(--task-instant)",
  Medium: "var(--task-medium)",
  Deep: "var(--task-deep)",
};
const icons = { project: Flag, task: CircleCheck, event: Clock };

const VIEWS = { Month: "dayGridMonth", Week: "timeGridWeek", Day: "timeGridDay", Agenda: "listMonth" } as const;
type ViewName = keyof typeof VIEWS;
const VIEW_PARAM_MAP: Record<string, ViewName> = {
  month: "Month",
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

type HighlightBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  label?: string;
};

type KeyboardSlot =
  | { kind: "day"; date: string }
  | { kind: "time"; date: string; minutes: number };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatSlotTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}:00`;
}

function localSlotToInstant(date: string, timeStr: string, timezone: string): string {
  const hhmm = timeStr.slice(0, 5);
  return Temporal.PlainDateTime.from(`${date}T${hhmm}`)
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant()
    .toString();
}

export function ManualCalendar({
  projects: serverProjects,
  tasks: serverTasks,
  events: serverEvents,
  timezone,
  weekStart,
  workingHours = DEFAULT_WORKING_HOURS,
  taskTypeMinutes = DEFAULT_TASK_TYPE_MINUTES,
  workingHoursOverrides = {},
  date,
}: {
  projects: Project[];
  tasks: Task[];
  events: Event[];
  timezone: string;
  weekStart: number;
  workingHours?: WeeklyWorkingHours;
  taskTypeMinutes?: TaskTypeMinutes;
  workingHoursOverrides?: Record<string, DayWorkingWindow>;
  date: string;
}) {
  const ref = useRef<CalendarRef>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scheduleBtnRef = useRef<HTMLButtonElement>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const workspace = useWorkspace();

  // Optimistic local collections synced with server props and shared workspace store
  const [projects, setProjectsState] = useState(workspace?.projects ?? serverProjects);
  const [tasks, setTasksState] = useState(workspace?.tasks ?? serverTasks);
  const [events, setEventsState] = useState(workspace?.events ?? serverEvents);
  const setProjects = useCallback<React.Dispatch<React.SetStateAction<Project[]>>>(
    (updater) => {
      setProjectsState(updater);
      workspace?.setProjects(updater);
    },
    [workspace],
  );
  const setTasks = useCallback<React.Dispatch<React.SetStateAction<Task[]>>>(
    (updater) => {
      setTasksState(updater);
      workspace?.setTasks(updater);
    },
    [workspace],
  );
  const setEvents = useCallback<React.Dispatch<React.SetStateAction<Event[]>>>(
    (updater) => {
      setEventsState(updater);
      workspace?.setEvents(updater);
    },
    [workspace],
  );
  const [synced, setSynced] = useState({ serverProjects, serverTasks, serverEvents });
  const [busyCount, setBusyCount] = useState(0);
  const latestRef = useRef({ projects: serverProjects, tasks: serverTasks, events: serverEvents });
  const recordQueues = useRef(new Map<string, Promise<unknown>>());

  useEffect(() => {
    latestRef.current = { projects, tasks, events };
  }, [projects, tasks, events]);

  if (
    busyCount === 0 &&
    (synced.serverProjects !== serverProjects ||
      synced.serverTasks !== serverTasks ||
      synced.serverEvents !== serverEvents)
  ) {
    setSynced({ serverProjects, serverTasks, serverEvents });
    setProjects(serverProjects);
    setTasks(serverTasks);
    setEvents(serverEvents);
  }

  const enqueueRecord = useCallback(<R,>(key: string, job: () => Promise<R>): Promise<R> => {
    const prev = recordQueues.current.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    recordQueues.current.set(key, next);
    void next.catch(() => undefined).finally(() => {
      if (recordQueues.current.get(key) === next) recordQueues.current.delete(key);
    });
    return next;
  }, []);

  // View & date state
  const paramView = VIEW_PARAM_MAP[(params.get("view") ?? "").toLowerCase()];
  const [view, setView] = useState<ViewName>(paramView ?? "Week");
  const [activeDate, setActiveDate] = useState(date);
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState<Record<Kind, boolean>>({ project: true, task: true, event: true });
  const [error, setError] = useState("");

  // Schedule mode state
  const urlSchedule = params.get("schedule") === "1";
  const urlHighlightTask = urlSchedule ? params.get("task") : null;
  const [scheduleOpen, setScheduleOpen] = useState(urlSchedule);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(urlHighlightTask);
  const [keptTaskIds] = useState<Set<string>>(() => new Set());
  const [dismissedTaskIds, setDismissedTaskIds] = useState<Set<string>>(() => new Set());
  const [pickedItem, setPickedItem] = useState<ScheduleItem | null>(null);
  const [keyboardSlot, setKeyboardSlot] = useState<KeyboardSlot | null>(null);
  const [dragGhost, setDragGhost] = useState<{ item: ScheduleItem; x: number; y: number } | null>(null);
  const [hoverHighlight, setHoverHighlight] = useState<HighlightBox | null>(null);
  const [scheduleAnchor, setScheduleAnchor] = useState<{ x: number; y: number } | null>(null);
  const [scheduleAnnouncement, setScheduleAnnouncement] = useState("");
  const [scheduleError, setScheduleError] = useState("");

  const updateUrl = useCallback((mutate: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(window.location.search);
    mutate(q);
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
  }, []);

  const changeView = useCallback(
    (next: ViewName) => {
      setView(next);
      ref.current?.getApi().changeView(VIEWS[next]);
      updateUrl((q) => q.set("view", next.toLowerCase()));
    },
    [updateUrl],
  );

  // Default to Agenda on narrow screens (<= 760px) when no explicit ?view= param is set
  const initializedView = useRef(false);
  useEffect(() => {
    if (initializedView.current) return;
    initializedView.current = true;
    if (!paramView && window.matchMedia("(max-width: 760px)").matches) {
      const frame = requestAnimationFrame(() => {
        setView("Agenda");
        ref.current?.getApi().changeView(VIEWS.Agenda);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [paramView]);

  // Track last pointer position for opening Schedule panel near cursor
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  // Sync URL ?schedule=1&task=<id> when navigated from Today or Projects
  const [prevUrlScheduleKey, setPrevUrlScheduleKey] = useState(`${urlSchedule}:${urlHighlightTask ?? ""}`);
  const currentUrlScheduleKey = `${urlSchedule}:${urlHighlightTask ?? ""}`;
  if (currentUrlScheduleKey !== prevUrlScheduleKey) {
    setPrevUrlScheduleKey(currentUrlScheduleKey);
    if (urlSchedule) {
      setScheduleOpen(true);
      setHighlightedTaskId(urlHighlightTask);
    }
  }

  const openSchedule = useCallback((anchor?: { x: number; y: number } | null) => {
    setScheduleError("");
    const fallbackRect = scheduleBtnRef.current?.getBoundingClientRect();
    setScheduleAnchor(
      anchor
        ? { ...anchor }
        : lastPointerRef.current
          ? { ...lastPointerRef.current }
          : fallbackRect
            ? { x: fallbackRect.left - 240, y: fallbackRect.bottom + 8 }
            : null,
    );
    setScheduleOpen(true);
  }, []);

  const closeSchedule = useCallback(() => {
    setScheduleOpen(false);
    setPickedItem(null);
    setKeyboardSlot(null);
    setDragGhost(null);
    setHoverHighlight(null);
    setScheduleError("");
    setHighlightedTaskId(null);
    setDismissedTaskIds(new Set());
    updateUrl((q) => {
      q.delete("schedule");
      if (q.has("task") && urlSchedule) q.delete("task");
    });
    requestAnimationFrame(() => scheduleBtnRef.current?.focus({ preventScroll: true }));
  }, [updateUrl, urlSchedule]);

  // Global S shortcut always opens or moves Schedule mode to the cursor; clicking away closes it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked(e)) return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      openSchedule(lastPointerRef.current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSchedule]);

  // Clicking outside the Schedule panel closes it (unless dragging or in tap-to-place mode).
  useEffect(() => {
    if (!scheduleOpen || pickedItem || dragGhost) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".schedule-panel")) return;
      if (scheduleBtnRef.current?.contains(target)) return;
      closeSchedule();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [scheduleOpen, pickedItem, dragGhost, closeSchedule]);

  // Exit animation for FullCalendar's "+more" popover: it unmounts instantly, so animate a clone out.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        r.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement) || !node.classList.contains("calendar-more-popover") || node.classList.contains("is-closing")) return;
          const ghost = node.cloneNode(true) as HTMLElement;
          ghost.classList.add("is-closing");
          ghost.setAttribute("aria-hidden", "true");
          (r.target as Node).appendChild(ghost);
          window.setTimeout(() => ghost.remove(), 140);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const records = useMemo(() => {
    const rangeStart = Temporal.PlainDate.from(activeDate).subtract({ days: 7 }).toString();
    const rangeEnd = Temporal.PlainDate.from(activeDate).add({ days: 45 }).toString();

    const projectRecords = projects
      .filter((p) => Boolean(p.deadline || p.deadlineAt))
      .map((p) => ({
        kind: "project" as const,
        display: "project" as Kind,
        linkId: p.id,
        id: p.id,
        title: p.name,
        start: p.deadlineAt ?? p.deadline!,
        end: p.deadlineAt ? addMinutesInstant(p.deadlineAt, 30) : undefined,
        allDay: !p.deadlineAt,
        revision: p.revision,
        done: p.status === "Done",
        taskType: undefined as Task["taskType"] | undefined,
        recurring: false,
        virtual: false,
      }));

    const realTaskRecords = tasks
      .filter((t) => Boolean(t.executionDate))
      .map((t) => ({
        kind: "task" as const,
        display: "task" as Kind,
        linkId: t.id,
        id: t.id,
        title: t.title,
        start: t.executionDate!,
        end: undefined,
        allDay: true,
        revision: t.revision,
        done: t.status === "Done",
        taskType: t.taskType,
        recurring: Boolean(t.recurrenceRule),
        virtual: false,
      }));

    const virtualTaskRecords = tasks.flatMap((t) => {
      if (t.status === "Done" || !t.recurrenceRule || !t.executionDate) return [];
      const dates = projectRecurringDates(t.recurrenceRule, t.executionDate, rangeStart, rangeEnd, 30);
      return dates.map((d) => ({
        kind: "task" as const,
        display: "task" as Kind,
        linkId: t.id,
        id: `${t.id}::virtual::${d}`,
        title: t.title,
        start: d,
        end: undefined,
        allDay: true,
        revision: t.revision,
        done: false,
        taskType: t.taskType,
        recurring: true,
        virtual: true,
      }));
    });

    const eventRecords = events
      .filter((e) => !e.taskId && Boolean(e.start && e.end))
      .map((e) => ({
        kind: "event" as const,
        display: "event" as Kind,
        linkId: e.id,
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        revision: e.revision,
        done: false,
        taskType: undefined as Task["taskType"] | undefined,
        recurring: false,
        virtual: false,
      }));

    return [...projectRecords, ...realTaskRecords, ...virtualTaskRecords, ...eventRecords];
  }, [projects, tasks, events, activeDate]);

  function href(kind: Kind, id: string) {
    if (kind === "project") return projectHref(id);
    const query = new URLSearchParams(params);
    query.delete("task");
    query.delete("event");
    query.delete("schedule");
    query.set(kind === "event" ? "event" : "task", id);
    return `/calendar?${query}`;
  }

  // Direct drag-move (optimistic, serialized per record, Undo toast, revert on failure)
  async function handleEventDrop(info: EventDropInfo) {
    const [kind, id] = info.event.id.split(":") as [Kind, string];
    if (!kind || !id) {
      info.revert();
      return;
    }
    const key = `${kind}:${id}`;
    setError("");
    setBusyCount((c) => c + 1);
    try {
      await enqueueRecord(key, async () => {
        const cur = latestRef.current;
        const record =
          kind === "event"
            ? cur.events.find((e) => e.id === id)
            : kind === "project"
              ? cur.projects.find((p) => p.id === id)
              : cur.tasks.find((t) => t.id === id);
        if (!record) {
          info.revert();
          return;
        }
        const isAllDay =
          kind === "event" ? (record as Event).allDay : kind === "task" ? true : info.event.allDay;
        const start = isAllDay ? info.event.startStr.slice(0, 10) : info.event.start!.toISOString();
        let input: Record<string, unknown>;
        if (kind === "event") input = { reschedule: true, start };
        else if (kind === "project") {
          input = isAllDay
            ? { deadline: start, deadlineAt: null, deadlineTimezone: null }
            : { deadline: null, deadlineAt: start, deadlineTimezone: timezone };
        } else {
          // Tasks are time-agnostic: moving a task on the calendar sets its executionDate.
          input = { executionDate: start };
        }
        const endpoint = `/api/${kind === "project" ? "projects" : kind === "event" ? "events" : "tasks"}/${id}`;
        const response = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, expectedRevision: record.revision, mutationId: crypto.randomUUID() }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save schedule.");
        if (kind === "event") {
          setEvents((prev) => {
            const next = prev.map((e) => (e.id === id ? (result as Event) : e));
            latestRef.current = { ...latestRef.current, events: next };
            return next;
          });
        } else if (kind === "project") {
          setProjects((prev) => {
            const next = prev.map((p) => (p.id === id ? (result as Project) : p));
            latestRef.current = { ...latestRef.current, projects: next };
            return next;
          });
        } else {
          setTasks((prev) => {
            const next = prev.map((t) => (t.id === id ? (result as Task) : t));
            latestRef.current = { ...latestRef.current, tasks: next };
            return next;
          });
        }
        notifyMutation(response, () => router.refresh(), { message: `${labels[kind]} moved.` });
        router.refresh();
      });
    } catch (failure) {
      info.revert();
      setError(failure instanceof Error ? failure.message : "Could not save. The original dates have been restored.");
    } finally {
      setBusyCount((c) => Math.max(0, c - 1));
    }
  }

  // Event-only edge resize
  async function handleEventResize(info: EventResizeDoneInfo) {
    const [kind, id] = info.event.id.split(":") as [Kind, string];
    if (kind !== "event" || !id) {
      info.revert();
      return;
    }
    const key = `event:${id}`;
    setError("");
    setBusyCount((c) => c + 1);
    try {
      await enqueueRecord(key, async () => {
        const current = latestRef.current.events.find((e) => e.id === id);
        if (!current) {
          info.revert();
          return;
        }
        const nextEnd = buildEventResizeEnd(current, {
          endStr: info.event.endStr,
          endDate: info.event.end,
        });
        if (!nextEnd) {
          info.revert();
          return;
        }
        const response = await fetch(`/api/events/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            end: nextEnd,
            expectedRevision: current.revision,
            mutationId: crypto.randomUUID(),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not resize event.");
        setEvents((prev) => {
          const next = prev.map((e) => (e.id === id ? (result as Event) : e));
          latestRef.current = { ...latestRef.current, events: next };
          return next;
        });
        notifyMutation(response, () => router.refresh(), { message: "Event resized." });
        router.refresh();
      });
    } catch (failure) {
      info.revert();
      setError(failure instanceof Error ? failure.message : "Could not resize event. The original duration was restored.");
    } finally {
      setBusyCount((c) => Math.max(0, c - 1));
    }
  }

  // Shared Schedule mode placement handler (pointer drag, keyboard, touch)
  const placeItem = useCallback(
    async (item: ScheduleItem, target: ScheduleDropTarget, options?: { keepInPanel?: boolean }) => {
      const keepInPanel = Boolean(options?.keepInPanel);
      setScheduleError("");
      setError("");

      const cur = latestRef.current;
      const freshTask = item.kind === "task" ? cur.tasks.find((t) => t.id === item.id) ?? item.task : null;
      const freshEvent = item.kind === "event" ? cur.events.find((e) => e.id === item.id) ?? item.event : null;
      const freshProject = item.kind === "project" ? cur.projects.find((p) => p.id === item.id) ?? item.project : null;

      const action =
        item.kind === "task"
          ? buildTaskDropAction(freshTask!, target)
          : item.kind === "event"
            ? buildEventDropAction(freshEvent!, target, timezone)
            : buildProjectDropAction(freshProject!, target);

      if (!action) {
        setScheduleAnnouncement(
          item.kind === "task"
            ? "Tasks can only be dropped onto a day (no time blocks)."
            : "Projects can only be dropped onto a day or all-day row.",
        );
        return;
      }

      const prevEvents = cur.events;
      const prevTasks = cur.tasks;
      const prevProjects = cur.projects;

      // Optimistic update
      if ("executionDate" in action.payload) {
        const { executionDate } = action.payload;
        setTasks((prev) => {
          const next = prev.map((t) =>
            t.id === item.id ? { ...t, executionDate } : t,
          );
          latestRef.current = { ...latestRef.current, tasks: next };
          return next;
        });
        if (!keepInPanel) {
          setDismissedTaskIds((prev) => new Set(prev).add(item.id));
          if (highlightedTaskId === item.id) setHighlightedTaskId(null);
        }
      } else if ("start" in action.payload) {
        const { start, end, allDay, timezone: tz } = action.payload;
        setEvents((prev) => {
          const next = prev.map((e) => (e.id === item.id ? { ...e, start, end, allDay, timezone: tz } : e));
          latestRef.current = { ...latestRef.current, events: next };
          return next;
        });
      } else if ("deadline" in action.payload) {
        const deadline = action.payload.deadline;
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === item.id ? { ...p, deadline, deadlineAt: null, deadlineTimezone: null } : p));
          latestRef.current = { ...latestRef.current, projects: next };
          return next;
        });
      }

      setBusyCount((c) => c + 1);
      try {
        await enqueueRecord(action.entityKey, async () => {
          let bodyPayload: Record<string, unknown> = { ...action.payload, mutationId: crypto.randomUUID() };
          if (action.endpoint.startsWith("/api/tasks/")) {
            const latestTask = latestRef.current.tasks.find((t) => t.id === item.id);
            if (latestTask) bodyPayload = { ...bodyPayload, expectedRevision: latestTask.revision };
          } else if (action.endpoint.startsWith("/api/events/")) {
            const latestEvent = latestRef.current.events.find((e) => e.id === item.id);
            if (latestEvent) bodyPayload = { ...bodyPayload, expectedRevision: latestEvent.revision };
          } else if (action.endpoint.startsWith("/api/projects/")) {
            const latestProject = latestRef.current.projects.find((p) => p.id === item.id);
            if (latestProject) bodyPayload = { ...bodyPayload, expectedRevision: latestProject.revision };
          }

          const response = await fetch(action.endpoint, {
            method: action.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not schedule item.");

          if ("executionDate" in action.payload) {
            setTasks((prev) => {
              const next = prev.map((t) => (t.id === item.id ? (result as Task) : t));
              latestRef.current = { ...latestRef.current, tasks: next };
              return next;
            });
            setScheduleAnnouncement(`Scheduled "${item.title}".`);
            notifyMutation(response, () => router.refresh(), { message: `Scheduled "${item.title}".` });
          } else if ("start" in action.payload) {
            setEvents((prev) => {
              const next = prev.map((e) => (e.id === item.id ? (result as Event) : e));
              latestRef.current = { ...latestRef.current, events: next };
              return next;
            });
            setScheduleAnnouncement(`Scheduled "${item.title}".`);
            notifyMutation(response, () => router.refresh(), { message: `Scheduled "${item.title}".` });
          } else if ("deadline" in action.payload) {
            setProjects((prev) => {
              const next = prev.map((p) => (p.id === item.id ? (result as Project) : p));
              latestRef.current = { ...latestRef.current, projects: next };
              return next;
            });
            setScheduleAnnouncement(`Set deadline for "${item.title}" to ${action.payload.deadline}.`);
            notifyMutation(response, () => router.refresh(), { message: `Deadline set for "${item.title}".` });
          }
          router.refresh();
        });
      } catch (failure) {
        // Roll back optimistic state and keep item in panel
        setEvents(prevEvents);
        setTasks(prevTasks);
        setProjects(prevProjects);
        latestRef.current = { projects: prevProjects, tasks: prevTasks, events: prevEvents };
        setDismissedTaskIds((prev) => {
          if (!prev.has(item.id)) return prev;
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        const msg = failure instanceof Error ? failure.message : "Could not save schedule. Rolled back.";
        setScheduleError(msg);
        setScheduleAnnouncement(msg);
      } finally {
        setBusyCount((c) => Math.max(0, c - 1));
      }
    },
    [enqueueRecord, highlightedTaskId, router, setEvents, setProjects, setTasks, timezone],
  );

  // Pick up an item (keyboard or tap-to-place)
  const handlePickItem = useCallback(
    (item: ScheduleItem | null) => {
      setPickedItem(item);
      if (!item) {
        setKeyboardSlot(null);
        setScheduleAnnouncement("Placement cancelled.");
        return;
      }
      let nextView = view;
      // On narrow screens, switch Agenda -> Day when picking up so slots & all-day row are tappable
      if (view === "Agenda") {
        nextView = "Day";
        changeView("Day");
      }
      const startSlot: KeyboardSlot =
        item.kind === "project" || nextView === "Month"
          ? { kind: "day", date: activeDate }
          : { kind: "time", date: activeDate, minutes: 10 * 60 };
      setKeyboardSlot(startSlot);
      setScheduleAnnouncement(
        `Picked up "${item.title}". Use arrow keys or tap a slot to place, Enter to confirm, Escape to cancel.`,
      );
    },
    [activeDate, changeView, view],
  );

  // Hit-test FullCalendar DOM by bounding geometry (works across pointer-events: none / layered TimeGrid tables)
  const hitTestCalendar = useCallback(
    (clientX: number, clientY: number, dayOnly: boolean): { target: ScheduleDropTarget; box: HighlightBox } | null => {
      const frame = frameRef.current;
      if (!frame) return null;

      // Ignore points covered by the floating Schedule panel or inline editor
      const topEls = document.elementsFromPoint(clientX, clientY);
      if (topEls.some((el) => el.classList.contains("schedule-panel") || el.classList.contains("inline-event-popover"))) {
        return null;
      }

      const frameRect = frame.getBoundingClientRect();
      if (
        clientX < frameRect.left ||
        clientX > frameRect.right ||
        clientY < frameRect.top ||
        clientY > frameRect.bottom
      ) {
        return null;
      }

      // 1) Check TimeGrid timed slots (Week / Day views)
      const cols = frame.querySelectorAll<HTMLElement>(".calendar-time-col[data-date]");
      if (cols.length > 0) {
        let hitCol: { el: HTMLElement; rect: DOMRect } | null = null;
        for (const col of cols) {
          const r = col.getBoundingClientRect();
          if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            hitCol = { el: col, rect: r };
            break;
          }
        }
        if (hitCol) {
          const slots = frame.querySelectorAll<HTMLElement>(".calendar-slot-lane[data-time]");
          for (const slot of slots) {
            const sr = slot.getBoundingClientRect();
            if (clientY >= sr.top && clientY <= sr.bottom) {
              if (dayOnly) return null; // Projects and dateless-task deadline drops only allow day/all-day rows
              const d = hitCol.el.getAttribute("data-date")!;
              const t = slot.getAttribute("data-time")!;
              return {
                target: { kind: "time", startInstant: localSlotToInstant(d, t, timezone) },
                box: {
                  left: hitCol.rect.left - frameRect.left + frame.scrollLeft,
                  top: sr.top - frameRect.top + frame.scrollTop,
                  width: hitCol.rect.width,
                  height: sr.height * 2,
                },
              };
            }
          }
        }
      }

      // 2) Check day cells (Month grid + Week/Day all-day row)
      const dayCells = frame.querySelectorAll<HTMLElement>(".calendar-day-cell[data-date]");
      for (const dayEl of dayCells) {
        const rect = dayEl.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          const d = dayEl.getAttribute("data-date")!;
          return {
            target: { kind: "day", date: d },
            box: {
              left: rect.left - frameRect.left + frame.scrollLeft,
              top: rect.top - frameRect.top + frame.scrollTop,
              width: rect.width,
              height: rect.height,
            },
          };
        }
      }
      return null;
    },
    [timezone],
  );

  // Pointer drag from Schedule panel items (click/tap < 6px toggles pick-up; drag >= 6px drags onto calendar)
  const handleSchedulePointerDown = useCallback(
    (item: ScheduleItem, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;
      let lastHit: { target: ScheduleDropTarget; box: HighlightBox } | null = null;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) >= 6) {
          dragging = true;
          setPickedItem(null);
          setKeyboardSlot(null);
        }
        if (!dragging) return;
        setDragGhost({ item, x: ev.clientX, y: ev.clientY });
        const dayOnly = item.kind === "project" || item.kind === "task";
        lastHit = hitTestCalendar(ev.clientX, ev.clientY, dayOnly);
        setHoverHighlight(lastHit ? lastHit.box : null);
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!dragging) {
          // Treat as tap/click to pick up (or cancel if already picked)
          if (pickedItem?.source === item.source && pickedItem.id === item.id) handlePickItem(null);
          else handlePickItem(item);
          return;
        }
        setDragGhost(null);
        setHoverHighlight(null);
        const dayOnly = item.kind === "project" || item.kind === "task";
        const hit = hitTestCalendar(ev.clientX, ev.clientY, dayOnly) ?? lastHit;
        if (hit) {
          void placeItem(item, hit.target, { keepInPanel: ev.shiftKey });
        } else if (dayOnly) {
          setScheduleAnnouncement(
            item.kind === "task"
              ? "Tasks can only be dropped onto a day or all-day row."
              : "Projects can only be dropped onto a day or all-day row.",
          );
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [handlePickItem, hitTestCalendar, pickedItem, placeItem],
  );

  // Keyboard ghost placement (capture phase so ScreenShortcuts never hijacks arrows/Enter/Esc)
  useEffect(() => {
    if (!scheduleOpen || !pickedItem || !keyboardSlot) return;

    function onKeyDown(e: KeyboardEvent) {
      if (!pickedItem || !keyboardSlot) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape", "1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        return;
      }

      if (e.key === "Escape") {
        handlePickItem(null);
        return;
      }

      if (e.key === "Enter") {
        const target: ScheduleDropTarget =
          keyboardSlot.kind === "day"
            ? { kind: "day", date: keyboardSlot.date }
            : { kind: "time", startInstant: localSlotToInstant(keyboardSlot.date, formatSlotTime(keyboardSlot.minutes), timezone) };
        void placeItem(pickedItem, target, { keepInPanel: e.shiftKey });
        if (!e.shiftKey) {
          setPickedItem(null);
          setKeyboardSlot(null);
        }
        return;
      }

      const moveDate = (deltaDays: number) => {
        const nextDate = Temporal.PlainDate.from(keyboardSlot.date).add({ days: deltaDays }).toString();
        setKeyboardSlot((prev) => (prev ? { ...prev, date: nextDate } : null));
        setScheduleAnnouncement(`${pickedItem.title} target: ${nextDate}`);
        const api = ref.current?.getApi();
        if (api) {
          const start = api.view.activeStart;
          const end = api.view.activeEnd;
          const targetDate = new Date(`${nextDate}T12:00:00Z`);
          if (targetDate < start || targetDate >= end) api.gotoDate(nextDate);
        }
      };

      if (e.key === "ArrowLeft") moveDate(-1);
      else if (e.key === "ArrowRight") moveDate(1);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const dir = e.key === "ArrowDown" ? 1 : -1;
        if (view === "Month") {
          moveDate(dir * 7);
        } else if (pickedItem.kind === "task") {
          setKeyboardSlot((prev) => {
            if (!prev) return null;
            if (prev.kind === "day") {
              if (dir > 0) {
                setScheduleAnnouncement(`${pickedItem.title} target: ${prev.date} 09:00`);
                return { kind: "time", date: prev.date, minutes: 9 * 60 };
              }
              return prev;
            }
            const nextMin = prev.minutes + dir * 30;
            if (nextMin < 0) {
              setScheduleAnnouncement(`${pickedItem.title} target: ${prev.date} all-day`);
              return { kind: "day", date: prev.date };
            }
            const clamped = Math.min(23 * 60 + 30, nextMin);
            setScheduleAnnouncement(`${pickedItem.title} target: ${prev.date} ${formatSlotTime(clamped).slice(0, 5)}`);
            return { kind: "time", date: prev.date, minutes: clamped };
          });
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [scheduleOpen, pickedItem, keyboardSlot, view, timezone, placeItem, handlePickItem]);

  // Measure highlight box for keyboard ghost outside of render
  const [keyboardHighlight, setKeyboardHighlight] = useState<HighlightBox | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = frameRef.current;
      if (!scheduleOpen || !pickedItem || !keyboardSlot || !container) {
        setKeyboardHighlight(null);
        return;
      }
      const frameRect = container.getBoundingClientRect();
      if (keyboardSlot.kind === "day") {
        const cell = container.querySelector<HTMLElement>(`.calendar-day-cell[data-date="${keyboardSlot.date}"]`);
        if (!cell) {
          setKeyboardHighlight(null);
          return;
        }
        const r = cell.getBoundingClientRect();
        setKeyboardHighlight({
          left: r.left - frameRect.left + container.scrollLeft,
          top: r.top - frameRect.top + container.scrollTop,
          width: r.width,
          height: r.height,
          label: pickedItem.title,
        });
        return;
      }
      const col = container.querySelector<HTMLElement>(`.calendar-time-col[data-date="${keyboardSlot.date}"]`);
      const slot = container.querySelector<HTMLElement>(`.calendar-slot-lane[data-time="${formatSlotTime(keyboardSlot.minutes)}"]`);
      if (!col || !slot) {
        setKeyboardHighlight(null);
        return;
      }
      const colRect = col.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      setKeyboardHighlight({
        left: colRect.left - frameRect.left + container.scrollLeft,
        top: slotRect.top - frameRect.top + container.scrollTop,
        width: colRect.width,
        height: slotRect.height * 2,
        label: pickedItem.title,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [scheduleOpen, pickedItem, keyboardSlot, view, title]);

  const activeHighlight = hoverHighlight ?? keyboardHighlight;

  // Track pointer down on the calendar frame to distinguish plain clicks from event drags/resizes
  const frameDownRef = useRef<{ x: number; y: number } | null>(null);

  function handleFrameClick(e: React.MouseEvent<HTMLDivElement>) {
    const down = frameDownRef.current;
    frameDownRef.current = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6) return;

    const clickTarget = e.target as HTMLElement | null;
    if (clickTarget?.closest(".calendar-record, a, button")) return;

    if (!scheduleOpen || !pickedItem) return;

    const hit = hitTestCalendar(
      e.clientX,
      e.clientY,
      pickedItem.kind === "project",
    );
    if (!hit) return;

    void placeItem(pickedItem, hit.target, { keepInPanel: e.shiftKey });
    if (!e.shiftKey) {
      setPickedItem(null);
      setKeyboardSlot(null);
    }
  }

  const hiddenFilterCount = (["event", "task", "project"] as const).filter((k) => !enabled[k]).length;
  const panelTasks = useMemo(
    () => tasks.filter((t) => !dismissedTaskIds.has(t.id)),
    [tasks, dismissedTaskIds],
  );

  const dayCellClass = useCallback(
    (info: { isToday: boolean }) => (info.isToday ? "calendar-day-cell calendar-today" : "calendar-day-cell"),
    [],
  );
  const dayLaneClass = useCallback(() => "calendar-time-col", []);
  const slotLaneClass = useCallback(
    (info: { time?: { milliseconds: number } }) => {
      const ms = info.time?.milliseconds ?? 0;
      const hour = Math.floor(ms / 3_600_000);
      return scheduleOpen && !isWorkingHour(hour)
        ? "calendar-slot-lane calendar-off-hours"
        : "calendar-slot-lane";
    },
    [scheduleOpen],
  );
  const eventAllow = useCallback((span: { allDay: boolean }, moving: { allDay: boolean } | null) => span.allDay === moving?.allDay, []);
  const eventAfterClass = useCallback(
    (info: { isEndResizable: boolean }) => (info.isEndResizable ? "calendar-event-resizer" : ""),
    [],
  );

  function syncNavDate() {
    const api = ref.current?.getApi();
    if (!api) return;
    const nextDate = dateInTimezone(api.getDate().toISOString(), timezone);
    setActiveDate(nextDate);
    updateUrl((q) => q.set("date", nextDate));
  }

  return (
    <div className="section stack">
      <div className="calendar-controls">
        <div className="view-switch" role="group" aria-label="Calendar view">
          {(Object.keys(VIEWS) as ViewName[]).map((name) => (
            <Button key={name} variant="ghost" aria-pressed={view === name} onClick={() => changeView(name)}>
              {name}
            </Button>
          ))}
        </div>

        <div className="calendar-toolbar-right">
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="outline" aria-label="Filter calendar">
                <SlidersHorizontal size={15} aria-hidden="true" />
                <span>Filter{hiddenFilterCount > 0 ? ` (${3 - hiddenFilterCount}/3)` : ""}</span>
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="calendar-filter-popover" align="end" sideOffset={6}>
                <p className="calendar-filter-heading">Show on calendar</p>
                {(["event", "task", "project"] as const).map((kind) => {
                  const Icon = icons[kind];
                  return (
                    <label key={kind} className="checkbox-label calendar-filter-option">
                      <input
                        type="checkbox"
                        checked={enabled[kind]}
                        onChange={(e) => setEnabled({ ...enabled, [kind]: e.target.checked })}
                        aria-label={`Show ${labels[kind].toLowerCase()}`}
                      />
                      <Icon size={13} aria-hidden="true" style={{ color: colors[kind] }} />
                      <span>{labels[kind]}</span>
                    </label>
                  );
                })}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <Button
            ref={scheduleBtnRef}
            variant="outline"
            title="Schedule mode (S)"
            aria-pressed={scheduleOpen}
            onClick={(e) => {
              if (scheduleOpen) closeSchedule();
              else openSchedule({ x: e.clientX, y: e.clientY });
            }}
          >
            <CalendarPlus size={15} aria-hidden="true" />
            <span>Schedule</span>
            <kbd className="calendar-kbd-hint">S</kbd>
          </Button>
        </div>
      </div>

      <div className="calendar-controls items-center">
        <h2 aria-live="polite">{title}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            aria-label="Previous period"
            onClick={() => {
              ref.current?.getApi().prev();
              syncNavDate();
            }}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            variant="outline"
            aria-label="Next period"
            onClick={() => {
              ref.current?.getApi().next();
              syncNavDate();
            }}
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              ref.current?.getApi().today();
              syncNavDate();
            }}
          >
            Today
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      <div
        ref={frameRef}
        className="calendar-frame"
        data-schedule-mode={scheduleOpen ? "true" : undefined}
        data-view={view}
        aria-busy={busyCount > 0}
        role="region"
        aria-label="Calendar grid; scroll horizontally on narrow screens"
        tabIndex={0}
        onPointerDown={(e) => { frameDownRef.current = { x: e.clientX, y: e.clientY }; }}
        onClick={handleFrameClick}
      >
        <FullCalendar
          ref={ref}
          plugins={[dayGrid, timeGrid, list, interaction, classic]}
          initialView={VIEWS[view]}
          initialDate={date}
          timeZone={timezone}
          firstDay={weekStart}
          headerToolbar={false}
          datesSet={(info) => setTitle(info.view.title)}
          height="auto"
          navLinks={true}
          navLinkDayClick={(dayDate) => {
            const iso = dateInTimezone(dayDate.toISOString(), timezone);
            const api = ref.current?.getApi();
            api?.gotoDate(iso);
            api?.changeView(VIEWS.Day, iso);
            setView("Day");
            setActiveDate(iso);
            updateUrl((q) => {
              q.set("view", "day");
              q.set("date", iso);
            });
          }}
          editable={true}
          eventDurationEditable={true}
          dayMaxEvents={5}
          popoverClass="calendar-more-popover"
          eventAllow={eventAllow}
          events={records
            .filter((r) => enabled[r.display])
            .map((r) => ({
              id: `${r.kind}:${r.id}`,
              title: r.title,
              start: r.start,
              end: r.end,
              allDay: r.allDay,
              editable: !r.virtual,
              durationEditable: r.kind === "event",
              color: "transparent",
              contrastColor: "var(--foreground)",
              extendedProps: {
                kind: r.kind,
                id: r.id,
                display: r.display,
                linkId: r.linkId,
                taskType: r.taskType,
                done: r.done,
                recurring: r.recurring,
                virtual: r.virtual,
              },
            }))}
          dayHeaderContent={(arg) => {
            if (view === "Month") return arg.text;
            const iso = dateInTimezone(arg.date.toISOString(), timezone);
            const win = resolveDayWorkingWindow(iso, workingHours, workingHoursOverrides[iso]);
            const cap = computeDayCapacity({
              date: iso,
              timezone,
              window: win,
              events,
              tasks,
              taskTypeMinutes,
            });
            const over = cap.overbookedMinutes > 0;
            return (
              <div className="calendar-day-header-stack">
                <span>{arg.text}</span>
                <span
                  className={`calendar-capacity-pill${over ? " is-overbooked" : ""}${!win.enabled ? " is-off" : ""}`}
                  title={
                    win.enabled
                      ? `${formatMinutes(cap.plannedMinutes)} planned / ${formatMinutes(cap.usableMinutes)} usable (${win.hours}h day)`
                      : "Day off"
                  }
                >
                  {win.enabled
                    ? `${formatMinutes(cap.plannedMinutes)}/${formatMinutes(cap.usableMinutes)}`
                    : "Off"}
                </span>
              </div>
            );
          }}
          eventDrop={(info) => {
            void handleEventDrop(info);
          }}
          eventResize={(info) => {
            void handleEventResize(info);
          }}
          eventContent={(info) => {
            const kind = info.event.extendedProps.display as Kind;
            const id = info.event.extendedProps.linkId as string;
            const taskType = info.event.extendedProps.taskType as Task["taskType"] | undefined;
            const recurring = Boolean(info.event.extendedProps.recurring);
            const virtual = Boolean(info.event.extendedProps.virtual);
            const recordColor = taskType ? taskTypeColors[taskType] : colors[kind];
            const Icon = icons[kind];
            return (
              <Link
                href={href(kind, id)}
                scroll={false}
                draggable={false}
                className={`calendar-record${virtual ? " is-virtual" : ""}`}
                data-calendar-record={`${kind}:${id}`}
                data-task-link={kind === "task" ? id : undefined}
                style={{ "--record-color": recordColor, opacity: info.event.extendedProps.done ? 0.6 : virtual ? 0.72 : 1 } as React.CSSProperties}
                aria-label={`${labels[kind]}${taskType ? ` (${taskType})` : ""}: ${info.event.title}`}
              >
                <span className="calendar-record-meta" aria-hidden="true">
                  <Icon size={12} />
                  {recurring && <Repeat size={11} />}
                  <time suppressHydrationWarning>{info.event.allDay ? "Day" : info.timeText}</time>
                </span>
                <span className="calendar-record-title" aria-hidden="true">{info.event.title}</span>
                {taskType && <span className="calendar-record-tag" aria-hidden="true">{taskType}</span>}
              </Link>
            );
          }}
          nowIndicator={true}
          nowIndicatorLineClass="cal-now-line"
          nowIndicatorDotClass="cal-now-dot"
          nowIndicatorHeaderClass="cal-now-label"
          listDayClass="agenda-day"
          listDayHeaderClass="agenda-day-header"
          listItemEventClass={(i) => (i.event.allDay ? "agenda-item" : "agenda-item is-timed")}
          listItemEventBeforeClass="agenda-item-before"
          listItemEventInnerClass="agenda-item-inner"
          listDayFormat={{ year: "numeric", month: "long", day: "numeric" }}
          listDayAltFormat={{ weekday: "long" }}
          listDayHeaderContent={(h) => (
            <span className="agenda-day-label">
              {h.text}
              {h.level === 0 && h.isToday && <span className="agenda-today-pill">Today</span>}
            </span>
          )}
          dayCellClass={dayCellClass}
          dayLaneClass={dayLaneClass}
          slotLaneClass={slotLaneClass}
          eventAfterClass={eventAfterClass}
        />

        {activeHighlight && (
          <div
            className="schedule-drop-highlight"
            data-schedule-ghost="true"
            style={{
              left: `${activeHighlight.left}px`,
              top: `${activeHighlight.top}px`,
              width: `${activeHighlight.width}px`,
              height: `${activeHighlight.height}px`,
            }}
            aria-hidden="true"
          >
            {activeHighlight.label && <span>{activeHighlight.label}</span>}
          </div>
        )}
      </div>

      <AnimatePresence>
        {scheduleOpen && (
          <SchedulePanel
            key={`schedule-${highlightedTaskId ?? "default"}`}
            open={scheduleOpen}
            onClose={closeSchedule}
            projects={projects}
            tasks={panelTasks}
            events={events}
            timezone={timezone}
            highlightedTaskId={highlightedTaskId}
            keptTaskIds={keptTaskIds}
            pickedItem={pickedItem}
            onPickItem={handlePickItem}
            onPointerDragStart={handleSchedulePointerDown}
            anchorPos={scheduleAnchor}
            announcement={scheduleAnnouncement}
            error={scheduleError}
          />
        )}
      </AnimatePresence>

      {dragGhost && (
        <div
          className="schedule-drag-ghost-wrap"
          style={{ left: `${dragGhost.x + 12}px`, top: `${dragGhost.y + 12}px` }}
          aria-hidden="true"
        >
          <DragMomentum>
            <div className="schedule-drag-ghost">{dragGhost.item.title}</div>
          </DragMomentum>
        </div>
      )}
    </div>
  );
}
