"use client";

import { Fragment, useSyncExternalStore } from "react";
import Link from "next/link";
import { Clock, Flag } from "lucide-react";
import type { TodayItem } from "@/lib/today";
import { NowLine } from "./now-line";

const tick = 30_000;
const subscribe = (notify: () => void) => {
  const id = setInterval(notify, tick);
  return () => clearInterval(id);
};
const useNow = () =>
  useSyncExternalStore(subscribe, () => Math.floor(Date.now() / tick) * tick, () => null);

/** Chronological schedule & deadlines strip for Today (events + project deadlines). */
export function TodayTimeline({
  items,
  timezone,
  dayStart,
  dayEnd,
}: {
  items: TodayItem[];
  timezone: string;
  dayStart: number;
  dayEnd: number;
}) {
  const now = useNow();
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  const bounds = (item: TodayItem) => [
    Math.max(Date.parse(item.start), dayStart),
    Math.min(Date.parse(item.end), dayEnd),
  ];
  const timed = items.filter((item) => !item.allDay);
  const showNow =
    now !== null &&
    timed.length > 0 &&
    now >= Math.min(...timed.map((item) => bounds(item)[0])) &&
    now <= Math.max(...timed.map((item) => bounds(item)[1]));
  const nowAt = showNow
    ? items.filter((item) => item.allDay || bounds(item)[0] <= now).length
    : -1;

  function time(item: TodayItem) {
    if (item.kind === "project-deadline") {
      return item.allDay ? "Deadline" : `Due ${clock.format(Date.parse(item.start))}`;
    }
    if (item.allDay) return "All day";
    const start = Date.parse(item.start);
    const end = Date.parse(item.end);
    if (start < dayStart && end > dayEnd) return "All day";
    if (start < dayStart) return `until ${clock.format(end)}`;
    if (end > dayEnd) return `from ${clock.format(start)}`;
    return `${clock.format(start)}–${clock.format(end)}`;
  }

  return (
    <section className="today-section" aria-labelledby="schedule-heading">
      <h2 id="schedule-heading">Schedule &amp; deadlines</h2>
      <ol className="today-list timeline">
        {items.map((item, index) => {
          const isDeadline = item.kind === "project-deadline";
          const Icon = isDeadline ? Flag : Clock;
          const href = isDeadline && item.projectId ? `/projects/${item.projectId}` : `/?event=${item.id}`;

          return (
            <Fragment key={item.id}>
              {index === nowAt && <NowLine label={clock.format(now!)} />}
              <li className="today-row-wrap">
                <div
                  className={`today-row timeline-row${item.done ? " is-past" : ""}${isDeadline ? " is-deadline" : ""}`}
                >
                  <span className="timeline-time">{time(item)}</span>
                  <Icon
                    className={`timeline-icon${isDeadline ? " timeline-icon-deadline" : ""}`}
                    size={15}
                    aria-hidden="true"
                  />
                  <div className="today-row-body">
                    <span className="sr-only">{isDeadline ? "Project deadline: " : "Event: "}</span>
                    <Link className="task-title" href={href} scroll={false}>
                      {item.title}
                    </Link>
                    {!isDeadline && item.projectName && (
                      <span className="today-meta">{item.projectName}</span>
                    )}
                    {isDeadline && <span className="deadline-pill">Project deadline</span>}
                  </div>
                </div>
              </li>
            </Fragment>
          );
        })}
        {nowAt === items.length && <NowLine label={clock.format(now!)} />}
      </ol>
    </section>
  );
}
