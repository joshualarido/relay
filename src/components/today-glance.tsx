"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { ArrowRight, CircleCheck, Clock, Flag, SlidersHorizontal } from "lucide-react";
import { formatMinutes, taskMinutes } from "@/lib/capacity";
import type { TodayTimeline } from "@/lib/today";
import { Button } from "./ui/button";

const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/** At-a-glance strip on Today: usable time capacity budget, remaining count, and the next task in the queue. */
export function TodayGlance({ day, timezone, projectNames = {} }: { day: TodayTimeline; timezone: string; projectNames?: Record<string, string> }) {
  const router = useRouter();
  const { remaining, total, next } = day.summary;
  const { capacity } = day;
  const overbooked = capacity.overbookedMinutes > 0;
  // Done bar: completed work as a share of the same scale as the planned bar.
  const scale = Math.max(capacity.usableMinutes, capacity.plannedMinutes, 1);
  const plannedPct = Math.min(100, (capacity.plannedMinutes / scale) * 100);
  const donePct = Math.min(100, (capacity.completedMinutes / scale) * 100);
  // Tasks have no clock time: "next" is simply the first open task in today's queue.
  const nextTask = day.tasks.find((t) => t.status !== "Done") ?? null;

  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(capacity.window.enabled);
  const [start, setStart] = useState(capacity.window.start);
  const [end, setEnd] = useState(capacity.window.end);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nextAt = next
    ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(
        new Date(next.at),
      )
    : undefined;

  async function saveOverride(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/working-hours/${day.today}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, start, end }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update working hours.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update working hours.");
    } finally {
      setSaving(false);
    }
  }

  async function resetOverride() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/working-hours/${day.today}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not reset working hours.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset working hours.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="today-glance" aria-label="Today at a glance">
      <div className={`glance-card glance-capacity${overbooked ? " is-overbooked" : ""}`}>
        <div className="glance-capacity-head">
          <p className="glance-label">
            Usable time
            {capacity.window.enabled
              ? ` · ${capacity.window.start}–${capacity.window.end}`
              : " · Day off"}
          </p>
          <Popover.Root
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (nextOpen) {
                setEnabled(capacity.window.enabled);
                setStart(capacity.window.start);
                setEnd(capacity.window.end);
                setError("");
              }
            }}
          >
            <Popover.Trigger asChild>
              <button
                type="button"
                className="glance-edit-hours"
                aria-label="Adjust today's working hours"
                title="Adjust today's working hours"
              >
                <SlidersHorizontal size={13} aria-hidden="true" />
                {capacity.window.isOverride ? "Custom" : "Hours"}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="popover-surface working-hours-popover" align="end" sideOffset={6}>
                <form className="stack" onSubmit={saveOverride}>
                  <p className="font-semibold text-sm">Today&apos;s working hours</p>
                  <label className="checkbox-row text-sm">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      disabled={saving}
                    />
                    <span>Working day</span>
                  </label>
                  {enabled && (
                    <div className="working-hours-times">
                      <label className="field">
                        <span>Start</span>
                        <input
                          type="time"
                          value={start}
                          onChange={(e) => setStart(e.target.value)}
                          required
                          disabled={saving}
                        />
                      </label>
                      <label className="field">
                        <span>End</span>
                        <input
                          type="time"
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                          required
                          disabled={saving}
                        />
                      </label>
                    </div>
                  )}
                  {error && (
                    <p role="alert" className="error-message text-sm">
                      {error}
                    </p>
                  )}
                  <div className="form-actions">
                    {capacity.window.isOverride && (
                      <Button type="button" variant="ghost" disabled={saving} onClick={resetOverride}>
                        Reset default
                      </Button>
                    )}
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </form>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <p className="glance-value">
          <strong>{formatMinutes(capacity.plannedMinutes)}</strong>
          <span> of {formatMinutes(capacity.usableMinutes)} usable</span>
          {overbooked && (
            <span className="glance-overbooked-tag"> · +{formatMinutes(capacity.overbookedMinutes)} over</span>
          )}
        </p>

        <div
          className="glance-bar"
          role="progressbar"
          aria-label={`${formatMinutes(capacity.plannedMinutes)} planned of ${formatMinutes(capacity.usableMinutes)} usable`}
          aria-valuemin={0}
          aria-valuemax={Math.max(1, capacity.usableMinutes)}
          aria-valuenow={Math.min(capacity.plannedMinutes, capacity.usableMinutes)}
        >
          <span className="glance-bar-planned" style={{ width: `${plannedPct}%` }} />
          <span className="glance-bar-done" style={{ width: `${donePct}%` }} />
        </div>

        <p className="glance-submeta">
          {total > 0 ? `${remaining} of ${total} left` : "No tasks queued"}
          {capacity.eventMinutes > 0 && ` · ${formatMinutes(capacity.eventMinutes)} in events`}
        </p>
      </div>

      {nextTask ? (
        <div className="glance-card glance-next">
          <p className="glance-label">
            <CircleCheck size={13} aria-hidden="true" /> Next up
          </p>
          <Link href={`/?task=${nextTask.id}`} scroll={false} className="glance-next-title glance-next-link">{nextTask.title}</Link>
          <p className="glance-submeta">
            <span className="task-type-pill" data-task-type={nextTask.taskType}>{nextTask.taskType} · {formatMinutes(taskMinutes(nextTask, day.taskTypeMinutes))}</span>
            {nextTask.projectId && projectNames[nextTask.projectId] && <span> {projectNames[nextTask.projectId]}</span>}
          </p>
          {next && (
            <Link href={next.href} scroll={false} className="glance-next-in">
              {next.kind === "project-deadline" ? <Flag size={13} aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
              {next.kind === "project-deadline" ? "Deadline" : "Then"} {nextAt}: {next.title} · in {duration(next.minutes)}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      ) : next ? (
        <Link href={next.href} scroll={false} className="glance-card glance-next">
          <p className="glance-label">
            {next.kind === "project-deadline" ? (
              <Flag size={13} aria-hidden="true" />
            ) : (
              <Clock size={13} aria-hidden="true" />
            )}{" "}
            {next.kind === "project-deadline" ? "Deadline" : "Next up"}
            {nextAt && <> · {nextAt}</>}
          </p>
          <p className="glance-next-title">{next.title}</p>
          <p className="glance-next-in">
            in {duration(next.minutes)} <ArrowRight size={14} aria-hidden="true" />
          </p>
        </Link>
      ) : (
        <div className="glance-card glance-next">
          <p className="glance-label">
            <Clock size={13} aria-hidden="true" /> Next up
          </p>
          <p className="glance-next-title glance-muted">{day.tasks.length ? "Queue cleared" : "Nothing queued today"}</p>
        </div>
      )}
    </section>
  );
}
