"use client";

import "temporal-polyfill/global";
import { Temporal } from "temporal-polyfill";
import { projectHref } from "@/lib/links";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover } from "radix-ui";
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
import { dateInTimezone } from "@/lib/dates";
import { isShortcutBlocked } from "@/lib/screens";
import {
  buildEventResizeEnd,
  buildInlineEventPayload,
  buildProjectDropAction,
  buildTaskDropAction,
  defaultInlineTimedRange,
  isWorkingHour,
  nextCalendarDate,
  type ScheduleDropTarget,
} from "@/lib/calendar-schedule";
import { CalendarPlus, ChevronLeft, ChevronRight, CircleCheck, Clock, Flag, SlidersHorizontal, X } from "lucide-react";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { SchedulePanel, type ScheduleItem } from "./schedule-panel";

type Kind = "project" | "task" | "event";
const labels: Record<Kind, string> = { project: "Project deadline", task: "Task deadline", event: "Event" };
const colors: Record<Kind, string> = { project: "var(--project-deadline)", task: "var(--task-deadline)", event: "var(--event)" };
const icons = { project: Flag, task: CircleCheck, event: Clock };

const VIEWS = { Month: "dayGridMonth", Week: "timeGridWeek", Day: "timeGridDay", Agenda: "listMonth" } as const;
type ViewName = keyof typeof VIEWS;
const VIEW_PARAM_MAP: Record<string, ViewName> = {
  month: "Month",
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

type InlineEditorState = {
  allDay: boolean;
  start: string;
  end: string;
  x: number;
  y: number;
  returnFocus: HTMLElement | null;
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

function clampPopover(x: number, y: number, width = 300, height = 270) {
  if (typeof window === "undefined") return { x, y };
  const pad = 12;
  return {
    x: Math.max(pad, Math.min(x, window.innerWidth - width - pad)),
    y: Math.max(pad, Math.min(y, window.innerHeight - height - pad)),
  };
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
  date,
}: {
  projects: Project[];
  tasks: Task[];
  events: Event[];
  timezone: string;
  weekStart: number;
  date: string;
}) {
  const ref = useRef<CalendarRef>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scheduleBtnRef = useRef<HTMLButtonElement>(null);
  const inlineTitleRef = useRef<HTMLInputElement>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const router = useRouter();
  const params = useSearchParams();

  // Optimistic local collections synced with server props
  const [projects, setProjects] = useState(serverProjects);
  const [tasks, setTasks] = useState(serverTasks);
  const [events, setEvents] = useState(serverEvents);
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
  const [view, setView] = useState<ViewName>(paramView ?? "Month");
  const [activeDate, setActiveDate] = useState(date);
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState<Record<Kind, boolean>>({ project: true, task: true, event: true });
  const [error, setError] = useState("");

  // Inline create state
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");
  const [inlineStart, setInlineStart] = useState("");
  const [inlineEnd, setInlineEnd] = useState("");
  const [inlinePending, setInlinePending] = useState(false);
  const [inlineError, setInlineError] = useState("");

  // Schedule mode state
  const urlSchedule = params.get("schedule") === "1";
  const urlHighlightTask = urlSchedule ? params.get("task") : null;
  const [scheduleOpen, setScheduleOpen] = useState(urlSchedule);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(urlHighlightTask);
  const [keptTaskIds, setKeptTaskIds] = useState<Set<string>>(() => new Set());
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
    setInlineEditor(null);
    setScheduleError("");
    const fallbackRect = scheduleBtnRef.current?.getBoundingClientRect();
    setScheduleAnchor(
      anchor ??
        lastPointerRef.current ??
        (fallbackRect ? { x: fallbackRect.left - 240, y: fallbackRect.bottom + 8 } : null),
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
    requestAnimationFrame(() => scheduleBtnRef.current?.focus());
  }, [updateUrl, urlSchedule]);

  // Global S shortcut to toggle Schedule mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked(e)) return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (scheduleOpen) closeSchedule();
      else openSchedule();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scheduleOpen, openSchedule, closeSchedule]);

  // Auto-focus inline title when inline editor opens
  useEffect(() => {
    if (inlineEditor) {
      requestAnimationFrame(() => inlineTitleRef.current?.focus());
    }
  }, [inlineEditor]);

  const records = useMemo(
    () => [
      ...projects
        .filter((p) => p.deadline)
        .map((p) => ({
          kind: "project" as const,
          id: p.id,
          title: p.name,
          start: p.deadline!,
          end: undefined,
          allDay: true,
          revision: p.revision,
          done: false,
        })),
      ...tasks
        .filter((t) => t.dueDate || t.dueAt)
        .map((t) => ({
          kind: "task" as const,
          id: t.id,
          title: t.title,
          start: (t.dueDate ?? t.dueAt)!,
          end: undefined,
          allDay: Boolean(t.dueDate),
          revision: t.revision,
          done: t.status === "Done",
        })),
      ...events.map((e) => ({
        kind: "event" as const,
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        revision: e.revision,
        done: false,
      })),
    ],
    [projects, tasks, events],
  );

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
        const isAllDay = kind === "event" ? (record as Event).allDay : kind === "project" ? true : Boolean((record as Task).dueDate);
        const start = isAllDay ? info.event.startStr.slice(0, 10) : info.event.start!.toISOString();
        const input =
          kind === "event"
            ? { reschedule: true, start }
            : kind === "project"
              ? { deadline: start }
              : isAllDay
                ? { dueDate: start }
                : { dueAt: start };
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
      const freshProject = item.kind === "project" ? cur.projects.find((p) => p.id === item.id) ?? item.project : null;

      const action =
        item.kind === "task"
          ? buildTaskDropAction(freshTask!, target, timezone)
          : buildProjectDropAction(freshProject!, target);

      if (!action) {
        setScheduleAnnouncement("Projects can only be dropped onto a day or all-day row.");
        return;
      }

      const prevEvents = cur.events;
      const prevTasks = cur.tasks;
      const prevProjects = cur.projects;
      const optimisticId = `optimistic-${crypto.randomUUID()}`;

      // Optimistic update
      if (action.endpoint === "/api/events") {
        const nowIso = new Date().toISOString();
        const optimisticEvent: Event = {
          id: optimisticId,
          ownerId: freshTask!.ownerId,
          title: action.payload.title,
          description: "",
          start: action.payload.start,
          end: action.payload.end,
          allDay: false,
          timezone: action.payload.timezone,
          projectId: null,
          taskId: action.payload.taskId,
          location: "",
          deletedAt: null,
          deletionOperationId: null,
          revision: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setEvents((prev) => {
          const next = [...prev, optimisticEvent];
          latestRef.current = { ...latestRef.current, events: next };
          return next;
        });
        if (keepInPanel) {
          setKeptTaskIds((prev) => new Set(prev).add(item.id));
        } else {
          setKeptTaskIds((prev) => {
            if (!prev.has(item.id)) return prev;
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
          if (highlightedTaskId === item.id) setHighlightedTaskId(null);
        }
      } else if ("dueDate" in action.payload) {
        const dueDate = action.payload.dueDate;
        setTasks((prev) => {
          const next = prev.map((t) =>
            t.id === item.id ? { ...t, dueDate, dueAt: null, timezone: null } : t,
          );
          latestRef.current = { ...latestRef.current, tasks: next };
          return next;
        });
        if (!keepInPanel) {
          setDismissedTaskIds((prev) => new Set(prev).add(item.id));
          if (highlightedTaskId === item.id) setHighlightedTaskId(null);
        }
      } else if ("deadline" in action.payload) {
        const deadline = action.payload.deadline;
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === item.id ? { ...p, deadline } : p));
          latestRef.current = { ...latestRef.current, projects: next };
          return next;
        });
      }

      setBusyCount((c) => c + 1);
      try {
        await enqueueRecord(action.entityKey, async () => {
          // Re-read latest revision inside serialized queue for PATCHes
          let bodyPayload: Record<string, unknown> = { ...action.payload, mutationId: crypto.randomUUID() };
          if (action.endpoint.startsWith("/api/tasks/")) {
            const latestTask = latestRef.current.tasks.find((t) => t.id === item.id);
            if (latestTask) bodyPayload = { ...bodyPayload, expectedRevision: latestTask.revision };
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

          if (action.endpoint === "/api/events") {
            setEvents((prev) => {
              const next = prev.map((e) => (e.id === optimisticId ? (result as Event) : e));
              latestRef.current = { ...latestRef.current, events: next };
              return next;
            });
            setScheduleAnnouncement(`Scheduled "${item.title}" as a 1-hour event.`);
            notifyMutation(response, () => router.refresh(), { message: `Scheduled "${item.title}".` });
          } else if ("dueDate" in action.payload) {
            setTasks((prev) => {
              const next = prev.map((t) => (t.id === item.id ? (result as Task) : t));
              latestRef.current = { ...latestRef.current, tasks: next };
              return next;
            });
            setScheduleAnnouncement(`Set due date for "${item.title}" to ${action.payload.dueDate}.`);
            notifyMutation(response, () => router.refresh(), { message: `Due date set for "${item.title}".` });
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
    [enqueueRecord, highlightedTaskId, router, timezone],
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
    (clientX: number, clientY: number, itemKind: ScheduleItem["kind"]): { target: ScheduleDropTarget; box: HighlightBox } | null => {
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
              if (itemKind === "project") return null; // Project onto time slot not allowed
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
        lastHit = hitTestCalendar(ev.clientX, ev.clientY, item.kind);
        setHoverHighlight(lastHit ? lastHit.box : null);
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!dragging) {
          // Treat as tap/click to pick up (or cancel if already picked)
          if (pickedItem?.kind === item.kind && pickedItem.id === item.id) handlePickItem(null);
          else handlePickItem(item);
          return;
        }
        setDragGhost(null);
        setHoverHighlight(null);
        const hit = hitTestCalendar(ev.clientX, ev.clientY, item.kind) ?? lastHit;
        if (hit) {
          void placeItem(item, hit.target, { keepInPanel: ev.shiftKey });
        } else if (item.kind === "project") {
          setScheduleAnnouncement("Projects can only be dropped onto a day or all-day row.");
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

    const hit = hitTestCalendar(e.clientX, e.clientY, pickedItem?.kind ?? "task");
    if (!hit) return;

    if (scheduleOpen) {
      if (pickedItem) {
        void placeItem(pickedItem, hit.target, { keepInPanel: e.shiftKey });
        if (!e.shiftKey) {
          setPickedItem(null);
          setKeyboardSlot(null);
        }
      }
      return;
    }

    const pos = clampPopover(e.clientX + 8, e.clientY + 8);
    const returnFocus = clickTarget?.closest<HTMLElement>("[data-date]") ?? frameRef.current;

    if (hit.target.kind === "day") {
      const start = hit.target.date;
      const end = nextCalendarDate(start);
      setInlineTitle("");
      setInlineStart(start);
      setInlineEnd(end);
      setInlineError("");
      setInlineEditor({ allDay: true, start, end, x: pos.x, y: pos.y, returnFocus });
    } else {
      const range = defaultInlineTimedRange(hit.target.startInstant, timezone);
      setInlineTitle("");
      setInlineStart(range.start);
      setInlineEnd(range.end);
      setInlineError("");
      setInlineEditor({ allDay: false, start: range.start, end: range.end, x: pos.x, y: pos.y, returnFocus });
    }
  }

  function closeInlineEditor() {
    const returnEl = inlineEditor?.returnFocus ?? frameRef.current;
    setInlineEditor(null);
    setInlineError("");
    requestAnimationFrame(() => returnEl?.focus());
  }

  async function saveInlineEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!inlineEditor || inlinePending) return;
    if (!inlineTitle.trim()) {
      setInlineError("Enter an event title.");
      return;
    }
    setInlinePending(true);
    setInlineError("");
    try {
      const payload = buildInlineEventPayload({
        title: inlineTitle,
        allDay: inlineEditor.allDay,
        start: inlineStart,
        end: inlineEnd,
        timezone,
      });
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, mutationId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create event.");
      setEvents((prev) => {
        const next = [...prev, result as Event];
        latestRef.current = { ...latestRef.current, events: next };
        return next;
      });
      setInlineEditor(null);
      notifyMutation(response, () => router.refresh(), { message: `Created "${(result as Event).title}".` });
      router.refresh();
    } catch (failure) {
      setInlineError(
        failure instanceof RangeError
          ? "Invalid or ambiguous local time in this timezone."
          : failure instanceof Error
            ? failure.message
            : "Could not create event.",
      );
    } finally {
      setInlinePending(false);
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
          <form
            className="calendar-date"
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("date"));
              ref.current?.getApi().gotoDate(value);
              setActiveDate(value);
              updateUrl((q) => q.set("date", value));
            }}
          >
            <label className="sr-only" htmlFor="calendar-date">Go to date</label>
            <input id="calendar-date" name="date" type="date" defaultValue={date} required />
            <Button type="submit" variant="outline">Go</Button>
          </form>

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
          editable={true}
          eventDurationEditable={true}
          dayMaxEvents={false}
          eventAllow={eventAllow}
          events={records
            .filter((r) => enabled[r.kind])
            .map((r) => ({
              id: `${r.kind}:${r.id}`,
              title: r.title,
              start: r.start,
              end: r.end,
              allDay: r.allDay,
              durationEditable: r.kind === "event",
              color: "transparent",
              contrastColor: "var(--foreground)",
              extendedProps: { kind: r.kind, id: r.id, done: r.done },
            }))}
          eventDrop={(info) => {
            void handleEventDrop(info);
          }}
          eventResize={(info) => {
            void handleEventResize(info);
          }}
          eventContent={(info) => {
            const kind = info.event.extendedProps.kind as Kind;
            const id = info.event.extendedProps.id as string;
            const Icon = icons[kind];
            return (
              <Link
                href={href(kind, id)}
                scroll={false}
                draggable={false}
                className="calendar-record"
                data-calendar-record={`${kind}:${id}`}
                data-task-link={kind === "task" ? id : undefined}
                style={{ "--record-color": colors[kind], opacity: info.event.extendedProps.done ? 0.6 : 1 } as React.CSSProperties}
                aria-label={`${labels[kind]}: ${info.event.title}`}
              >
                <Icon size={12} aria-hidden="true" />
                <span aria-hidden="true">
                  {info.timeText && <time suppressHydrationWarning>{info.timeText}</time>}
                  {info.event.title}
                </span>
              </Link>
            );
          }}
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

      {inlineEditor && (
        <div
          className="inline-event-popover"
          role="dialog"
          aria-label="Quick create event"
          style={{ left: `${inlineEditor.x}px`, top: `${inlineEditor.y}px` }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              closeInlineEditor();
            }
          }}
        >
          <div className="inline-event-header">
            <h3>{inlineEditor.allDay ? "New all-day event" : "New event"}</h3>
            <button type="button" className="icon-button" aria-label="Cancel inline event" onClick={closeInlineEditor}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <form className="stack" onSubmit={saveInlineEvent}>
            <div className="field">
              <label htmlFor="inline-event-title" className="sr-only">Event title</label>
              <input
                ref={inlineTitleRef}
                id="inline-event-title"
                name="title"
                placeholder="Event title"
                value={inlineTitle}
                onChange={(e) => setInlineTitle(e.target.value)}
                required
                maxLength={500}
                disabled={inlinePending}
              />
            </div>
            <div className="inline-event-times">
              <div className="field">
                <label htmlFor="inline-event-start">Start</label>
                <input
                  id="inline-event-start"
                  type={inlineEditor.allDay ? "date" : "datetime-local"}
                  value={inlineStart}
                  onChange={(e) => setInlineStart(e.target.value)}
                  required
                  disabled={inlinePending}
                />
              </div>
              <div className="field">
                <label htmlFor="inline-event-end">End</label>
                <input
                  id="inline-event-end"
                  type={inlineEditor.allDay ? "date" : "datetime-local"}
                  value={inlineEnd}
                  onChange={(e) => setInlineEnd(e.target.value)}
                  required
                  disabled={inlinePending}
                />
              </div>
            </div>
            {inlineError && (
              <p role="alert" className="error-message text-sm">
                {inlineError}
              </p>
            )}
            <div className="inline-event-actions">
              <Button type="button" variant="outline" onClick={closeInlineEditor} disabled={inlinePending}>
                Cancel
              </Button>
              <Button type="submit" disabled={inlinePending}>
                {inlinePending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </div>
      )}

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

      {dragGhost && (
        <div
          className="schedule-drag-ghost"
          style={{ left: `${dragGhost.x + 12}px`, top: `${dragGhost.y + 12}px` }}
          aria-hidden="true"
        >
          {dragGhost.item.title}
        </div>
      )}
    </div>
  );
}
