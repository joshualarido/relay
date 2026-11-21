"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, CalendarDays, Clock, ExternalLink, Folder, MapPin, X } from "lucide-react";
import { Temporal } from "temporal-polyfill";
import type { Event, Project, Task } from "@/lib/db/schema";
import { instantToLocal, localToInstant } from "@/lib/dates";
import { notifyMutation } from "./mutation-notice";
import { InlineText } from "./projects/inline-text";
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
  projects,
  timezone,
}: {
  event: Event | null;
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

  const current = localEvent;
  const isHttpLink = Boolean(current?.location && /^https?:\/\//i.test(current.location.trim()));

  function close() {
    setOpen(false);
    window.setTimeout(() => {
      const query = new URLSearchParams(search);
      query.delete("event");
      router.replace(`${path}${query.size ? `?${query}` : ""}`, { scroll: false });
    }, 155);
  }

  async function patch(fields: Record<string, unknown>, message: string) {
    if (!current) return false;
    setPending(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: current.revision, ...fields, mutationId: crypto.randomUUID() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save event.");
      setLocalEvent(result as Event);
      workspace?.setEvents((all) => all.map((e) => (e.id === current.id ? (result as Event) : e)));
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

  const activeProjects = projects.filter((p) => !p.archivedAt || p.id === current?.projectId);
  const duration = current ? formatDuration(current.start, current.end, current.allDay) : null;
  const startValue = current?.start
    ? current.allDay
      ? current.start
      : instantToLocal(current.start, current.timezone || timezone).slice(0, 16)
    : "";
  const endValue = current?.end
    ? current.allDay
      ? current.end
      : instantToLocal(current.end, current.timezone || timezone).slice(0, 16)
    : "";

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !pending) close(); }}>
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
                                  ? current.start
                                  : instantToLocal(current.start, timezone).slice(0, 10);
                                void patch(
                                  { start: d, end: Temporal.PlainDate.from(d).add({ days: 1 }).toString(), allDay: true },
                                  "Set to all day.",
                                );
                              } else {
                                const d = current.start.slice(0, 10);
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
                            key={`s-${current.id}-${current.start}-${current.allDay}`}
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
                            key={`e-${current.id}-${current.end}-${current.allDay}`}
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
                <button type="button" className="text-quiet inline-flex items-center gap-1.5" onClick={() => void archive()}>
                  <Archive size={14} aria-hidden="true" />
                  Archive
                </button>
                <span className="muted text-sm ml-auto">{relativeTime(current.updatedAt)}</span>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
