"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { AlertCircle, CalendarDays, Clock, Flag, Folder, Gauge, Repeat, Star, X } from "lucide-react";
import {
  buildEventRangeFromToken,
  parseCaptureInput,
  removeTokenFromInput,
  type CaptureProjectOption,
  type CaptureToken,
} from "@/lib/capture-parser";
import {
  DEFAULT_TASK_TYPE_MINUTES,
  formatMinutes,
  type TaskTypeMinutes,
} from "@/lib/capacity";
import { localToInstant } from "@/lib/dates";
import { taskHref } from "@/lib/links";
import type { RecurrenceRule } from "@/lib/recurrence";
import type { TaskType } from "@/services/tasks";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { RecurrencePicker } from "./recurrence-picker";
import { useWorkspace } from "./workspace-store";

type CaptureKind = "task" | "event" | "project";

const kinds: { kind: CaptureKind; label: string }[] = [
  { kind: "task", label: "Task" },
  { kind: "event", label: "Event" },
  { kind: "project", label: "Project" },
];

const messages: Record<CaptureKind, string> = {
  task: "Task captured.",
  event: "Event captured.",
  project: "Project created.",
};

const endpoints: Record<CaptureKind, string> = {
  task: "/api/tasks",
  event: "/api/events",
  project: "/api/projects",
};

const TASK_TYPES: TaskType[] = ["Instant", "Medium", "Deep"];

/**
 * Quick capture with deterministic tokens (#project, @date, @date HH:MM-HH:MM, !)
 * plus contextual structured controls under the title:
 * - Task: execution date, task type, recurrence, project
 * - Project: deadline (date + optional time)
 * - Event: date + start/end time (or all-day) + project
 */
export function QuickCapture({
  timezone,
  weekStart = 1,
  projects: propProjects = [],
  taskTypeMinutes = DEFAULT_TASK_TYPE_MINUTES,
  initialValue = "",
  onSaved,
  onPendingChange,
  onOpen,
  onDone,
  inlineConfirmation = true,
}: {
  timezone: string;
  weekStart?: number;
  projects?: CaptureProjectOption[];
  taskTypeMinutes?: TaskTypeMinutes;
  initialValue?: string;
  onSaved?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onOpen?: () => void;
  onDone?: () => void;
  inlineConfirmation?: boolean;
}) {
  const workspace = useWorkspace();
  const projects = workspace?.projects ?? propProjects;
  const todayStr = useMemo(() => Temporal.Now.plainDateISO(timezone).toString(), [timezone]);
  const tomorrowStr = useMemo(
    () => Temporal.PlainDate.from(todayStr).add({ days: 1 }).toString(),
    [todayStr],
  );

  const [rawInput, setRawInput] = useState(initialValue);
  const [manualKind, setManualKind] = useState<CaptureKind | null>(null);

  // Task fields under title
  const [taskType, setTaskType] = useState<TaskType>("Medium");
  const [manualExecDate, setManualExecDate] = useState<string | null>(null);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);
  const [manualProjectId, setManualProjectId] = useState<string | null | undefined>(undefined);

  // Project fields under title
  const [manualProjectDeadlineDate, setManualProjectDeadlineDate] = useState<string | null>(null);
  const [projectDeadlineTime, setProjectDeadlineTime] = useState("");

  // Event fields under title
  const [manualEventDate, setManualEventDate] = useState<string | null>(null);
  const [manualEventStart, setManualEventStart] = useState("09:00");
  const [manualEventEnd, setManualEventEnd] = useState("10:00");
  const [eventAllDay, setEventAllDay] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [openHref, setOpenHref] = useState("");
  const identity = useRef({ payload: "", id: "" });
  const titleInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const router = useRouter();

  const parsed = useMemo(
    () => parseCaptureInput(rawInput, { projects, timezone, weekStart }),
    [rawInput, projects, timezone, weekStart],
  );

  const kind: CaptureKind = manualKind ?? parsed.impliedKind;

  // Effective values combining structured controls with parsed tokens
  const effectiveProjectId = manualProjectId !== undefined ? manualProjectId : parsed.projectId;
  const effectiveExecDate = manualExecDate !== null ? manualExecDate : (parsed.dueDate ?? "");
  const effectiveProjectDeadlineDate =
    manualProjectDeadlineDate !== null ? manualProjectDeadlineDate : (parsed.dueDate ?? "");
  const effectiveEventDate =
    manualEventDate !== null
      ? manualEventDate
      : (parsed.timeRange?.date ?? parsed.dueDate ?? todayStr);
  const effectiveEventStart = parsed.timeRange?.startTime ?? manualEventStart;
  const effectiveEventEnd = parsed.timeRange?.endTime ?? manualEventEnd;

  function choose(next: CaptureKind) {
    setManualKind(next);
    setError("");
    setSaved(false);
    titleInput.current?.focus();
  }

  function onRadioKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const home = e.key === "Home";
    const end = e.key === "End";
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step && !home && !end) return;
    e.preventDefault();
    const index = kinds.findIndex((k) => k.kind === kind);
    const next = (
      home
        ? kinds[0]
        : end
          ? kinds[kinds.length - 1]
          : kinds[(index + step + kinds.length) % kinds.length]
    ).kind;
    setManualKind(next);
    setError("");
    setSaved(false);
    e.currentTarget.querySelector<HTMLElement>(`[data-kind=${next}]`)?.focus();
  }

  // Tab on an empty title cycles Task -> Event -> Project; once there is text,
  // Tab moves on into the property fields so they stay keyboard-reachable.
  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (rawInput.trim()) return;
    e.preventDefault();
    const idx = kinds.findIndex((k) => k.kind === kind);
    choose(kinds[(idx + 1) % kinds.length].kind);
  }

  function removeChip(token: CaptureToken) {
    const updated = removeTokenFromInput(rawInput, token);
    setRawInput(updated);
    setError("");
    titleInput.current?.focus();
  }

  async function save() {
    const cleanTitle = kind === "project" && !parsed.dueDate ? rawInput.trim() : parsed.title;
    if (!cleanTitle) {
      setError(
        kind === "project"
          ? "Enter a project name."
          : kind === "event"
            ? "Enter an event title."
            : "Enter a task title.",
      );
      titleInput.current?.focus();
      return;
    }

    let bodyBase: Record<string, unknown>;

    if (kind === "project") {
      if (effectiveProjectDeadlineDate && projectDeadlineTime) {
        const deadlineAt = localToInstant(`${effectiveProjectDeadlineDate}T${projectDeadlineTime}`, timezone);
        bodyBase = {
          name: cleanTitle,
          deadline: null,
          deadlineAt,
          deadlineTimezone: timezone,
        };
      } else {
        bodyBase = {
          name: cleanTitle,
          deadline: effectiveProjectDeadlineDate || null,
          deadlineAt: null,
          deadlineTimezone: null,
        };
      }
    } else if (kind === "event") {
      if (!effectiveEventDate) {
        setError("Choose a date for the event.");
        return;
      }
      if (eventAllDay && !parsed.timeRange) {
        bodyBase = {
          title: cleanTitle,
          description: "",
          allDay: true,
          timezone,
          start: effectiveEventDate,
          end: Temporal.PlainDate.from(effectiveEventDate).add({ days: 1 }).toString(),
          projectId: effectiveProjectId,
          taskId: null,
          location: "",
        };
      } else {
        const { start, end } = buildEventRangeFromToken(
          effectiveEventDate,
          effectiveEventStart,
          effectiveEventEnd,
          timezone,
        );
        bodyBase = {
          title: cleanTitle,
          description: "",
          allDay: false,
          timezone,
          start,
          end,
          projectId: effectiveProjectId,
          taskId: null,
          location: "",
        };
      }
    } else {
      // Task: time-agnostic execution date + task type + optional recurrence
      const execDate = effectiveExecDate || (recurrenceRule ? todayStr : null);
      bodyBase = {
        title: cleanTitle,
        projectId: effectiveProjectId,
        taskType,
        executionDate: execDate,
        recurrenceRule,
        important: parsed.important ? true : null,
      };
    }

    const payloadKey = JSON.stringify({ kind, bodyBase });
    if (identity.current.payload !== payloadKey) {
      identity.current = { payload: payloadKey, id: crypto.randomUUID() };
    }

    setPending(true);
    onPendingChange?.(true);
    setError("");
    setSaved(false);
    setOpenHref("");

    try {
      const mutationId = identity.current.id;
      const response = await fetch(endpoints[kind], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bodyBase, mutationId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.fields?.title?.join(" ") ||
            result.fields?.start?.join(" ") ||
            result.fields?.end?.join(" ") ||
            result.fields?.deadlineAt?.join(" ") ||
            result.error ||
            "Could not save. Your input is preserved.",
        );
      }

      if (kind === "task") {
        workspace?.setTasks((prev) =>
          prev.some((t) => t.id === result.id) ? prev : [...prev, result],
        );
      } else if (kind === "project") {
        workspace?.setProjects((prev) =>
          prev.some((p) => p.id === result.id) ? prev : [...prev, result],
        );
      } else {
        workspace?.setEvents((prev) =>
          prev.some((ev) => ev.id === result.id) ? prev : [...prev, result],
        );
      }

      setRawInput("");
      setManualKind(null);
      setManualExecDate(null);
      setRecurrenceRule(null);
      setManualProjectId(undefined);
      setManualProjectDeadlineDate(null);
      setProjectDeadlineTime("");
      setManualEventDate(null);
      identity.current = { payload: "", id: "" };
      setSaved(true);
      onSaved?.();

      const href = kind === "task" ? taskHref(result) : undefined;
      if (href) setOpenHref(href);
      notifyMutation(response, () => router.refresh(), {
        message: messages[kind],
        openHref: href,
      });
      router.refresh();
      onDone?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save. Your input is preserved.",
      );
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <div className="quick-capture stack">
      <h2 className="sr-only">Quick capture</h2>
      <form
        className="quick-capture-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await save();
        }}
      >
        <div className="capture-mode-row">
          <div
            className="view-switch capture-toggle"
            role="radiogroup"
            aria-label="Type"
            onKeyDown={onRadioKeyDown}
          >
            {kinds.map(({ kind: k, label }) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                data-kind={k}
                tabIndex={kind === k ? 0 : -1}
                disabled={pending}
                onClick={() => choose(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="capture-tab-hint">
            <kbd>Tab</kbd> switch
          </span>
        </div>

        <div className="field capture-title">
          <label className="sr-only" htmlFor={`${id}-title`}>
            {kind === "project" ? "Project name" : kind === "event" ? "Event title" : "Quick capture"}
          </label>
          <input
            ref={titleInput}
            id={`${id}-title`}
            name="title"
            value={rawInput}
            onKeyDown={onInputKeyDown}
            onChange={(e) => {
              setRawInput(e.target.value);
              if (error) setError("");
              if (saved) setSaved(false);
            }}
            maxLength={500}
            required
            disabled={pending}
            autoComplete="off"
            placeholder={
              kind === "project"
                ? "Project name"
                : kind === "event"
                  ? "Event title"
                  : "What needs doing?"
            }
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>

        {/* Contextual properties under the title — same layout as the task detail panel */}
        <div className="detail-props capture-props">
          {kind === "task" && (
            <>
              <div className="detail-prop-row">
                <label className="detail-prop-label" htmlFor={`${id}-exec-date`}>
                  <CalendarDays size={14} aria-hidden="true" />
                  Date
                </label>
                <div className="detail-prop-value capture-inline">
                  <div className="view-switch" role="group" aria-label="Quick date">
                    <button type="button" aria-pressed={effectiveExecDate === todayStr} disabled={pending} onClick={() => setManualExecDate(effectiveExecDate === todayStr ? "" : todayStr)}>
                      Today
                    </button>
                    <button type="button" aria-pressed={effectiveExecDate === tomorrowStr} disabled={pending} onClick={() => setManualExecDate(effectiveExecDate === tomorrowStr ? "" : tomorrowStr)}>
                      Tomorrow
                    </button>
                  </div>
                  <input
                    id={`${id}-exec-date`}
                    type="date"
                    value={effectiveExecDate}
                    disabled={pending}
                    onChange={(e) => setManualExecDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="detail-prop-row">
                <span className="detail-prop-label" id={`${id}-type-label`}>
                  <Gauge size={14} aria-hidden="true" />
                  Type
                </span>
                <div className="detail-prop-value">
                  <div className="view-switch" role="group" aria-labelledby={`${id}-type-label`}>
                    {TASK_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={taskType === t}
                        disabled={pending}
                        onClick={() => setTaskType(t)}
                      >
                        {t} <span className="capture-type-minutes">{formatMinutes(taskTypeMinutes[t])}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="detail-prop-row">
                <span className="detail-prop-label">
                  <Repeat size={14} aria-hidden="true" />
                  Repeat
                </span>
                <div className="detail-prop-value">
                  <RecurrencePicker value={recurrenceRule} onChange={setRecurrenceRule} disabled={pending} compact />
                </div>
              </div>
            </>
          )}

          {kind === "project" && (
            <div className="detail-prop-row">
              <label className="detail-prop-label" htmlFor={`${id}-proj-deadline`}>
                <Flag size={14} aria-hidden="true" />
                Deadline
              </label>
              <div className="detail-prop-value capture-inline">
                <input
                  id={`${id}-proj-deadline`}
                  type="date"
                  value={effectiveProjectDeadlineDate}
                  disabled={pending}
                  onChange={(e) => setManualProjectDeadlineDate(e.target.value)}
                />
                <input
                  type="time"
                  aria-label="Deadline time (optional)"
                  value={projectDeadlineTime}
                  disabled={pending || !effectiveProjectDeadlineDate}
                  onChange={(e) => setProjectDeadlineTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {kind === "event" && (
            <>
              <div className="detail-prop-row">
                <label className="detail-prop-label" htmlFor={`${id}-ev-date`}>
                  <CalendarDays size={14} aria-hidden="true" />
                  Date
                </label>
                <div className="detail-prop-value capture-inline">
                  <input
                    id={`${id}-ev-date`}
                    type="date"
                    value={effectiveEventDate}
                    disabled={pending}
                    onChange={(e) => setManualEventDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="detail-prop-row">
                <span className="detail-prop-label">
                  <Clock size={14} aria-hidden="true" />
                  Time
                </span>
                <div className="detail-prop-value capture-inline">
                  {!eventAllDay && (
                    <>
                      <input
                        type="time"
                        aria-label="Start time"
                        value={effectiveEventStart}
                        disabled={pending}
                        onChange={(e) => setManualEventStart(e.target.value)}
                      />
                      <span className="muted" aria-hidden="true">–</span>
                      <input
                        type="time"
                        aria-label="End time"
                        value={effectiveEventEnd}
                        disabled={pending}
                        onChange={(e) => setManualEventEnd(e.target.value)}
                      />
                    </>
                  )}
                  <label className="checkbox-row text-sm">
                    <input
                      type="checkbox"
                      checked={eventAllDay}
                      disabled={pending}
                      onChange={(e) => setEventAllDay(e.target.checked)}
                    />
                    <span>All day</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {kind !== "project" && projects.length > 0 && (
            <div className="detail-prop-row">
              <label className="detail-prop-label" htmlFor={`${id}-project`}>
                <Folder size={14} aria-hidden="true" />
                Project
              </label>
              <div className="detail-prop-value">
                <select
                  id={`${id}-project`}
                  value={effectiveProjectId ?? ""}
                  disabled={pending}
                  onChange={(e) => setManualProjectId(e.target.value || null)}
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="capture-footer">
          {parsed.tokens.length > 0 && (
            <ul className="capture-chips" aria-label="Detected tokens">
              {parsed.tokens.map((token) => (
                <li
                  key={token.id}
                  className={`capture-chip capture-chip-${token.kind}${token.kind === "project" && !token.matched ? " is-unknown" : ""}`}
                >
                  {token.kind === "project" &&
                    (token.matched ? (
                      <Folder size={13} aria-hidden="true" />
                    ) : (
                      <AlertCircle size={13} aria-hidden="true" />
                    ))}
                  {token.kind === "date" && <CalendarDays size={13} aria-hidden="true" />}
                  {token.kind === "timeRange" && <Clock size={13} aria-hidden="true" />}
                  {token.kind === "important" && <Star size={13} aria-hidden="true" />}
                  <span>{token.label}</span>
                  <button
                    type="button"
                    className="capture-chip-remove"
                    aria-label={`Remove ${token.label}`}
                    disabled={pending}
                    onClick={() => removeChip(token)}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving..."
              : kind === "project"
                ? "Create project"
                : kind === "event"
                  ? "Capture event"
                  : "Capture task"}
          </Button>
        </div>

        {parsed.unknownProjects.length > 0 && (
          <p className="capture-hint muted text-sm" role="status">
            No project matching #{parsed.unknownProjects[0]} — saves under No project.
          </p>
        )}

        {error && (
          <p id={`${id}-error`} className="error-message" role="alert">
            {error}
          </p>
        )}

        {saved && inlineConfirmation && (
          <p role="status" className="muted">
            <span>{messages[kind]}</span>
            {kind === "task" && openHref && (
              <>
                {" "}
                <Link className="text-primary" href={openHref} onClick={onOpen}>
                  Open<span className="sr-only"> captured task</span>
                </Link>
              </>
            )}
          </p>
        )}
      </form>
    </div>
  );
}
