"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { taskHref } from "@/lib/links";

type CaptureKind = "task" | "project" | "event";
const kinds: { kind: CaptureKind; label: string }[] = [{ kind: "task", label: "Task" }, { kind: "project", label: "Project" }, { kind: "event", label: "Event" }];
const messages: Record<CaptureKind, string> = { task: "Task captured.", project: "Project created.", event: "Event captured." };
const endpoints: Record<CaptureKind, string> = { task: "/api/tasks", project: "/api/projects", event: "/api/events" };

/** Name-only capture. Events save immediately as all-day events on `initialDate` or today in `timezone`. */
export function QuickCapture({ timezone, initialDate = "", onSaved, onPendingChange, onOpen, onDone, inlineConfirmation = true }: {
  timezone?: string; initialDate?: string;
  onSaved?: () => void; onPendingChange?: (pending: boolean) => void; onOpen?: () => void;
  /** Called after a save; the Capture dialog closes on it. */
  onDone?: () => void; inlineConfirmation?: boolean;
}) {
  const [kind, setKind] = useState<CaptureKind>("task");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [openHref, setOpenHref] = useState("");
  const identity = useRef({ payload: "", id: "" });
  const titleInput = useRef<HTMLInputElement>(null);
  const id = useId(), router = useRouter();
  const available = timezone ? kinds : kinds.filter((k) => k.kind !== "event");
  function choose(next: CaptureKind) { setKind(next); setError(""); setSaved(false); titleInput.current?.focus(); }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const index = available.findIndex((k) => k.kind === kind);
    const next = available[(index + step + available.length) % available.length].kind;
    setKind(next); setError(""); setSaved(false);
    e.currentTarget.querySelector<HTMLElement>(`[data-kind=${next}]`)?.focus();
  }
  async function save(form: HTMLFormElement, title: string) {
    const payload = JSON.stringify({ kind, title });
    if (identity.current.payload !== payload) identity.current = { payload, id: crypto.randomUUID() };
    setPending(true); onPendingChange?.(true); setError(""); setSaved(false); setOpenHref("");
    try {
      const mutationId = identity.current.id;
      let body: Record<string, unknown>;
      if (kind === "event" && timezone) {
        const start = initialDate || Temporal.Now.plainDateISO(timezone).toString();
        body = { title, description: "", allDay: true, timezone, start, end: Temporal.PlainDate.from(start).add({ days: 1 }).toString(), projectId: null, taskId: null, location: "", mutationId };
      } else body = kind === "project" ? { name: title, mutationId } : { title, mutationId };
      const response = await fetch(endpoints[kind], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.fields?.title?.join(" ") || result.fields?.name?.join(" ") || result.error);
      form.reset(); identity.current = { payload: "", id: "" }; setSaved(true); onSaved?.();
      // Inbox is not in navigation, so a loose task is reachable from this notice.
      const href = kind === "task" && !result.projectId ? taskHref(result) : undefined;
      if (href) setOpenHref(href);
      notifyMutation(response, () => router.refresh(), { message: messages[kind], openHref: href });
      router.refresh(); onDone?.();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Your input is preserved."); }
    finally { setPending(false); onPendingChange?.(false); }
  }
  return <div className="quick-capture stack">
    <h2 className="sr-only">Quick capture</h2>
    <form className="quick-capture-form" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      await save(form, String(new FormData(form).get("title") || ""));
    }}>
      <div className="capture-kinds" role="radiogroup" aria-label="Type" onKeyDown={onKeyDown}>
        {available.map(({ kind: k, label }) => <Button key={k} type="button" role="radio" aria-checked={kind === k} data-kind={k} tabIndex={kind === k ? 0 : -1}
          variant={kind === k ? "default" : "outline"} disabled={pending} onClick={() => choose(k)}>{label}</Button>)}
      </div>
      <div className="field"><label className="sr-only" htmlFor={`${id}-title`}>{kind === "project" ? "Project name" : kind === "event" ? "Event title" : "Quick capture"}</label>
        <input ref={titleInput} id={`${id}-title`} name="title" maxLength={500} required disabled={pending} placeholder={kind === "project" ? "Name a project" : kind === "event" ? "Name an event" : "Capture a task"} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /></div>
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : kind === "task" ? "Capture task" : kind === "project" ? "Create project" : "Capture event"}</Button>
      {error && <p id={`${id}-error`} className="error-message" role="alert">{error}</p>}{saved && inlineConfirmation && <p role="status" className="muted"><span>{messages[kind]}</span>{kind === "task" && openHref && <> <Link className="text-primary" href={openHref} onClick={onOpen}>Open<span className="sr-only"> captured task</span></Link></>}</p>}
    </form>
  </div>;
}
