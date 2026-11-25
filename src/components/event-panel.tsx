"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, CalendarDays, Clock, ExternalLink, Folder, MapPin, Repeat, Trash2, X } from "lucide-react";
import { Temporal } from "temporal-polyfill";
import type { Event, Project, Task } from "@/lib/db/schema";
import type { DeletionPreview } from "@/lib/lifecycle";
import { dateOnlySchema, instantToLocal, localToInstant } from "@/lib/dates";
import { eventAnchorDate, formatRecurrenceSummary, occurrenceRangeForDate } from "@/lib/recurrence";
import { notifyMutation } from "./mutation-notice";
import { InlineText } from "./projects/inline-text";
import { RecurrencePicker } from "./recurrence-picker";
import { useConfirmation, useRecurrenceScopeDialog } from "./confirm-dialog";
import { useWorkspace } from "./workspace-store";

function formatDuration(start: string, end: string, allDay: boolean): string | null {
  if (!start || !end) return null;
  if (allDay) {
    const days = Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end)).days;
    return days === 1 ? "All day" : `${days} days`;
  }
  const mins = Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (diff < 1) return "Updated just now";
  if (diff < 60) return `Updated ${diff}m ago`;
  const hrs = Math.floor(diff / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  return `Updated ${Math.floor(hrs / 24)}d ago`;
}

export function EventPanel({
  event,
  occurrenceDate,
  projects,
  timezone,
}: {
  event: Event | null;
  occurrenceDate?: string;
  projects: Project[];
  tasks: Task[];
  timezone: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const workspace = useWorkspace();
  const [localEvent, setLocalEvent] = useState(event);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const { askScope, scopeDialog } = useRecurrenceScopeDialog();
  const { confirm, confirmation } = useConfirmation();

  const current = localEvent;
  const isHttpLink = Boolean(current?.location && /^https?:\/\//i.test(current.location.trim()));
  const rawOccurrence = occurrenceDate ?? search.get("occurrence") ?? undefined;
  const effectiveOccurrenceDate =
    current?.recurrenceRule && current.start
      ? rawOccurrence && dateOnlySchema.safeParse(rawOccurrence).success
        ? rawOccurrence
        : eventAnchorDate(current, timezone)
      : undefined;

  function close() {
    setOpen(false);
    window.setTimeout(() => {
      const query = new URLSearchParams(search);
      query.delete("event");
      query.delete("occurrence");
      router.replace(`${path}${query.size ? `?${query}` : ""}`, { scroll: false });
    }, 155);
  }

  async function patch(fields: Record<string, unknown>, message: string, options?: { seriesOnly?: boolean }) {
    if (!current) return false;
    let scope: "single" | "series" | undefined;
    if (current.recurrenceRule && effectiveOccurrenceDate && !options?.seriesOnly) {
      setPrompting(true);
      const choice = await askScope({
        title: "Edit recurring event",
        description: "Apply this change to just this occurrence or the whole series?",
        singleLabel: "This occurrence",
        seriesLabel: "Whole series",
      });
      setPrompting(false);
      if (!choice) return false;
      scope = choice;
    }

    setPending(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        expectedRevision: current.revision,
        ...fields,
        mutationId: crypto.randomUUID(),
      };
      if (scope) {
        body.scope = scope;
        if (effectiveOccurrenceDate) body.occurrenceDate = effectiveOccurrenceDate;
      }
      const res = await fetch(`/api/events/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save event.");

      if (scope === "single") {
        const { event: detached, series } = result as { event: Event; series: Event };
        setLocalEvent(detached);
        workspace?.setEvents((all) => [
          ...all.map((e) => (e.id === series.id ? series : e)),
          detached,
        ]);
        const query = new URLSearchParams(search);
        query.set("event", detached.id);
        query.delete("occurrence");
        window.history.replaceState(null, "", `${path}${query.size ? `?${query}` : ""}`);
      } else {
        setLocalEvent(result as Event);
        workspace?.setEvents((all) => all.map((e) => (e.id === current.id ? (result as Event) : e)));
      }
      notifyMutation(res, () => router.refresh(), { message });
      router.refresh();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save event.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    if (!current) return;
    workspace?.setEvents((all) => all.filter((e) => e.id !== current.id));
    close();
    try {
      const res = await fetch(`/api/events/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: current.revision, archived: true, mutationId: crypto.randomUUID() }),
      });
      if (res.ok) {
        notifyMutation(res, () => router.refresh(), { message: "Event archived." });
        router.refresh();
      }
    } catch {}
  }

  async function remove() {
    if (!current) return;
    setError("");
    if (current.recurrenceRule && effectiveOccurrenceDate) {
      setPrompting(true);
      const choice = await askScope({
        title: "Delete recurring event",
        description: "Delete only this occurrence or the whole series?",
        singleLabel: "This occurrence",
        seriesLabel: "Whole series",
        destructive: true,
      });
      setPrompting(false);
      if (!choice) return;
      setPending(true);
      try {
        if (choice === "single") {
          const res = await fetch(`/api/events/${current.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: current.revision,
              scope: "single",
              deleteOccurrence: true,
              occurrenceDate: effectiveOccurrenceDate,
              mutationId: crypto.randomUUID(),
            }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Could not delete occurrence.");
          workspace?.setEvents((all) => all.map((e) => (e.id === current.id ? (result as Event) : e)));
          close();
          notifyMutation(res, () => router.refresh(), { message: "Occurrence deleted." });
          router.refresh();
          return;
        }
        const previewRes = await fetch(`/api/events/${current.id}/deletion`);
        const preview = (await previewRes.json()) as DeletionPreview & { error?: string };
        if (!previewRes.ok) throw new Error(preview.error || "Could not prepare deletion.");
        const res = await fetch(`/api/events/${current.id}/deletion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...preview, mutationId: crypto.randomUUID() }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Could not delete event series.");
        const deletedIds = new Set(preview.records.map((r) => r.id));
        workspace?.setEvents((all) => all.filter((e) => !deletedIds.has(e.id)));
        close();
        notifyMutation(res, () => router.refresh(), { message: "Event series deleted." });
        router.refresh();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not delete event.");
      } finally {
        setPending(false);
      }
      return;
    }

    setPrompting(true);
    const ok = await confirm({
      title: "Delete event?",
      action: "Delete",
      description: `"${current.title}" is deleted. You can undo this.`,
    });
    setPrompting(false);
    if (!ok) return;
    setPending(true);
    try {
      const previewRes = await fetch(`/api/events/${current.id}/deletion`);
      const preview = (await previewRes.json()) as DeletionPreview & { error?: string };
      if (!previewRes.ok) throw new Error(preview.error || "Could not prepare deletion.");
      const res = await fetch(`/api/events/${current.id}/deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...preview, mutationId: crypto.randomUUID() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not delete event.");
      workspace?.setEvents((all) => all.filter((e) => e.id !== current.id));
      close();
      notifyMutation(res, () => router.refresh(), { message: "Event deleted." });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete event.");
    } finally {
      setPending(false);
    }
  }

  const activeProjects = projects.filter((p) => !p.archivedAt || p.id === current?.projectId);
  const displayRange =
    current && current.start && current.end && effectiveOccurrenceDate
      ? occurrenceRangeForDate(current, effectiveOccurrenceDate, timezone)
      : { start: current?.start ?? "", end: current?.end ?? "" };
  const duration = current ? formatDuration(displayRange.start, displayRange.end, current.allDay) : null;
  const startValue = displayRange.start
    ? current?.allDay
      ? displayRange.start
      : instantToLocal(displayRange.start, current?.timezone || timezone).slice(0, 16)
    : "";
  const endValue = displayRange.end
    ? current?.allDay
      ? displayRange.end
      : instantToLocal(displayRange.end, current?.timezone || timezone).slice(0, 16)
    : "";

  return (
    <>
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !pending && !prompting) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="detail-sheet" aria-describedby={undefined}>
          <Dialog.Close className="icon-button sheet-close" aria-label="Close event details" disabled={pending}>
            <X size={18} aria-hidden="true" />
          </Dialog.Close>

          {!current ? (
            <p className="muted">Event not found.</p>
          ) : (
            <>
              <div className="detail-header">
                <div className="detail-kicker">
                  <span className="detail-badge detail-badge-event">
                    <Clock size={12} aria-hidden="true" />
                    Event
                  </span>
                  {current.recurrenceRule && (
                    <span className="recurrence-pill">
                      <Repeat size={11} aria-hidden="true" />
                      {formatRecurrenceSummary(current.recurrenceRule)}
                    </span>
                  )}
                  {duration && <span className="detail-duration">{duration}</span>}
                  {isHttpLink && (
                    <a
                      href={current.location.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="detail-join-link"
                    >
                      Open link
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </div>
                <Dialog.Title asChild>
                  <h2 className="sheet-title">
                    <InlineText
                      value={current.title}
                      label="event title"
                      required
                      onSave={(title) => patch({ title }, "Event renamed.")}
                    />
                  </h2>
                </Dialog.Title>
              </div>

              <div className="detail-props">
                <div className="detail-prop-row">
                  <span className="detail-prop-label">
                    <CalendarDays size={14} aria-hidden="true" />
                    When
                  </span>
                  <div className="detail-prop-value stack" style={{ gap: 8 }}>
                    {!current.start ? (
                      <span className="muted text-sm">Unscheduled — drag from Schedule (S)</span>
                    ) : (
                      <>
                        <label className="checkbox-label text-sm">
                          <input
                            type="checkbox"
                            checked={current.allDay}
                            disabled={pending}
                            onChange={(e) => {
                              const nextAllDay = e.target.checked;
                              if (nextAllDay) {
                                const d = current.allDay
                                  ? displayRange.start
                                  : instantToLocal(displayRange.start, current.timezone || timezone).slice(0, 10);
                                void patch(
                                  { start: d, end: Temporal.PlainDate.from(d).add({ days: 1 }).toString(), allDay: true },
                                  "Set to all day.",
                                );
                              } else {
                                const d = displayRange.start.slice(0, 10);
                                void patch(
                                  {
                                    start: localToInstant(`${d}T09:00`, timezone),
                                    end: localToInstant(`${d}T10:00`, timezone),
                                    allDay: false,
                                    timezone,
                                  },
                                  "Set to timed event.",
                                );
                              }
                            }}
                          />
                          All day
                        </label>
                        <div className="detail-time-inputs">
                          <input
                            aria-label="Event start"
                            type={current.allDay ? "date" : "datetime-local"}
                            key={`s-${current.id}-${displayRange.start}-${current.allDay}`}
                            defaultValue={startValue}
                            disabled={pending}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (!val || val === startValue) return;
                              const nextStart = current.allDay ? val : localToInstant(val, current.timezone || timezone);
                              void patch({ start: nextStart }, "Start updated.");
                            }}
                          />
                          <input
                            aria-label="Event end"
                            type={current.allDay ? "date" : "datetime-local"}
                            key={`e-${current.id}-${displayRange.end}-${current.allDay}`}
                            defaultValue={endValue}
                            disabled={pending}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (!val || val === endValue) return;
                              const nextEnd = current.allDay ? val : localToInstant(val, current.timezone || timezone);
                              void patch({ end: nextEnd }, "End updated.");
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="detail-prop-row">
                  <span className="detail-prop-label">
                    <Repeat size={14} aria-hidden="true" />
                    Repeat
                  </span>
                  <div className="detail-prop-value">
                    <RecurrencePicker
                      value={current.recurrenceRule ?? null}
                      disabled={pending}
                      compact
                      onChange={(recurrenceRule) =>
                        void patch(
                          { recurrenceRule },
                          recurrenceRule ? "Recurrence updated." : "Recurrence removed.",
                          { seriesOnly: true },
                        )
                      }
                    />
                  </div>
                </div>

                <div className="detail-prop-row">
                  <label className="detail-prop-label" htmlFor="event-sheet-project">
                    <Folder size={14} aria-hidden="true" />
                    Project
                  </label>
                  <div className="detail-prop-value">
                    <select
                      id="event-sheet-project"
                      value={current.projectId ?? ""}
                      disabled={pending}
                      onChange={(e) => {
                        const projectId = e.target.value || null;
                        void patch({ projectId }, projectId ? "Project linked." : "Project unlinked.");
                      }}
                    >
                      <option value="">No project</option>
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="detail-prop-row">
                  <span className="detail-prop-label">
                    <MapPin size={14} aria-hidden="true" />
                    Location
                  </span>
                  <div className="detail-prop-value">
                    <InlineText
                      value={current.location}
                      label="event location"
                      placeholder="Add location or meeting link"
                      onSave={(location) => patch({ location }, "Location saved.")}
                    />
                  </div>
                </div>
              </div>

              <div className="detail-notes-section">
                <span className="sheet-label">Notes</span>
                <InlineText
                  className="sheet-notes"
                  value={current.description}
                  label="event notes"
                  multiline
                  placeholder="Add notes…"
                  onSave={(description) => patch({ description }, "Notes saved.")}
                />
              </div>

              {error && (
                <p role="alert" className="error-message text-sm">
                  {error}
                </p>
              )}

              <div className="sheet-actions detail-footer">
                <button type="button" className="text-quiet inline-flex items-center gap-1.5" disabled={pending} onClick={() => void archive()}>
                  <Archive size={14} aria-hidden="true" />
                  Archive
                </button>
                <button type="button" className="text-danger inline-flex items-center gap-1.5" disabled={pending} onClick={() => void remove()}>
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
                <span className="muted text-sm ml-auto">{relativeTime(current.updatedAt)}</span>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {scopeDialog}
    {confirmation}
    </>
  );
}
