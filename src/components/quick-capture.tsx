"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { AlertCircle, CalendarDays, Clock, Folder, Star, X } from "lucide-react";
import {
  buildEventRangeFromToken,
  parseCaptureInput,
  removeTokenFromInput,
  type CaptureProjectOption,
  type CaptureToken,
} from "@/lib/capture-parser";
import { taskHref } from "@/lib/links";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { useWorkspace } from "./workspace-store";

type CaptureKind = "task" | "event";

const kinds: { kind: CaptureKind; label: string }[] = [
  { kind: "task", label: "Task" },
  { kind: "event", label: "Event" },
];

const messages: Record<CaptureKind, string> = {
  task: "Task captured.",
  event: "Event captured.",
};

const endpoints: Record<CaptureKind, string> = {
  task: "/api/tasks",
  event: "/api/events",
};

/** One-line capture with deterministic tokens (#project, @date, @date HH:MM-HH:MM, !). */
export function QuickCapture({
  timezone,
  weekStart = 1,
  projects: propProjects = [],
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
  initialValue?: string;
  onSaved?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onOpen?: () => void;
  /** Called after a save; the Capture dialog closes on it. */
  onDone?: () => void;
  inlineConfirmation?: boolean;
}) {
  const workspace = useWorkspace();
  const projects = workspace?.projects ?? propProjects;
  const [rawInput, setRawInput] = useState(initialValue);
  const [manualKind, setManualKind] = useState<CaptureKind | null>(null);
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

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      choose(kind === "task" ? "event" : "task");
    }
  }

  function removeChip(token: CaptureToken) {
    const updated = removeTokenFromInput(rawInput, token);
    setRawInput(updated);
    if (token.kind === "timeRange" && manualKind === null) {
      // Automatically falls back to task via parsed.impliedKind
    }
    setError("");
    titleInput.current?.focus();
  }

  async function save() {
    const cleanTitle = parsed.title;
    if (!cleanTitle) {
      setError(kind === "event" ? "Enter an event title." : "Enter a task title.");
      titleInput.current?.focus();
      return;
    }

    const today = Temporal.Now.plainDateISO(timezone).toString();
    const bodyBase =
      kind === "event"
        ? parsed.timeRange
          ? (() => {
              const { start, end } = buildEventRangeFromToken(
                parsed.timeRange.date,
                parsed.timeRange.startTime,
                parsed.timeRange.endTime,
                timezone,
              );
              return {
                title: cleanTitle,
                description: "",
                allDay: false,
                timezone,
                start,
                end,
                projectId: parsed.projectId,
                taskId: null,
                location: "",
              };
            })()
          : (() => {
              const date = parsed.dueDate ?? today;
              return {
                title: cleanTitle,
                description: "",
                allDay: true,
                timezone,
                start: date,
                end: Temporal.PlainDate.from(date).add({ days: 1 }).toString(),
                projectId: parsed.projectId,
                taskId: null,
                location: "",
              };
            })()
        : {
            title: cleanTitle,
            projectId: parsed.projectId,
            dueDate: parsed.dueDate ?? parsed.timeRange?.date ?? null,
            important: parsed.important ? true : null,
          };

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
            result.error ||
            "Could not save. Your input is preserved.",
        );
      }

      if (kind === "task") {
        workspace?.setTasks((prev) =>
          prev.some((t) => t.id === result.id) ? prev : [...prev, result],
        );
      } else {
        workspace?.setEvents((prev) =>
          prev.some((ev) => ev.id === result.id) ? prev : [...prev, result],
        );
      }

      setRawInput("");
      setManualKind(null);
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

        <div className="field">
          <label className="sr-only" htmlFor={`${id}-title`}>
            {kind === "event" ? "Event title" : "Quick capture"}
          </label>
          <input
            ref={titleInput}
            id={`${id}-title`}
            name="title"
            value={rawInput}
            onChange={(e) => {
              setRawInput(e.target.value);
              if (error) setError("");
              if (saved) setSaved(false);
            }}
            onKeyDown={onInputKeyDown}
            maxLength={500}
            required
            disabled={pending}
            autoComplete="off"
            placeholder={
              kind === "event"
                ? "Event title · @fri 14:00-15:00 #project"
                : "Task title · #project @fri !"
            }
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : kind === "event" ? "Capture event" : "Capture task"}
        </Button>

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
