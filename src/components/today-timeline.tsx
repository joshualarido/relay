"use client";

import { Fragment, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, SquareCheck } from "lucide-react";
import type { TodayItem } from "@/lib/today";
import { TaskComplete } from "./task-complete";
import { NowLine } from "./now-line";
import { SwipeableTaskRow } from "./swipeable-task-row";
import { pushTaskTomorrow, toggleTaskDone } from "./today-due-list";

const tick = 30_000;
const subscribe = (notify: () => void) => {
  const id = setInterval(notify, tick);
  return () => clearInterval(id);
};
// Stable within each 30 s window, so React sees one value per tick; null on the server (the line appears after hydration).
const useNow = () =>
  useSyncExternalStore(subscribe, () => Math.floor(Date.now() / tick) * tick, () => null);

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
  const router = useRouter();
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
    if (item.allDay) return "All day";
    const start = Date.parse(item.start);
    const end = Date.parse(item.end);
    if (start < dayStart && end > dayEnd) return "All day";
    if (start < dayStart) return `until ${clock.format(end)}`;
    if (end > dayEnd) return `from ${clock.format(start)}`;
    return `${clock.format(start)}–${clock.format(end)}`;
  }

  return (
    <section className="today-section" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="sr-only">
        Timeline
      </h2>
      <ol className="today-list timeline">
        {items.map((item, index) => {
          const block = item.kind === "task-block" && item.task;
          const Icon = block ? SquareCheck : Clock;
          const href = block ? `/?task=${item.taskId}` : `/?event=${item.id}`;
          const rowInner = (
            <div className={`today-row timeline-row${item.done ? (block ? " is-done" : " is-past") : ""}`}>
              <span className="timeline-time">{time(item)}</span>
              <Icon className="timeline-icon" size={15} aria-hidden="true" />
              <div className="today-row-body">
                <span className="sr-only">{block ? "Task block: " : "Event: "}</span>
                <Link
                  className="task-title"
                  data-task-link={block ? item.taskId : undefined}
                  href={href}
                  title={block ? "Edit task (E)" : undefined}
                  scroll={false}
                >
                  {item.title}
                </Link>
                {item.projectName && <span className="today-meta">{item.projectName}</span>}
                {block && <span className="task-type-pill" data-task-type={item.task!.taskType}>{item.task!.taskType}</span>}
              </div>
              {block &&
                (item.done ? (
                  <span className="complete-mark" role="img" aria-label="Completed">
                    <Check size={13} aria-hidden="true" />
                  </span>
                ) : (
                  <TaskComplete task={item.task!} />
                ))}
            </div>
          );

          return (
            <Fragment key={item.id}>
              {index === nowAt && <NowLine label={clock.format(now!)} />}
              <li className="today-row-wrap">
                {block ? (
                  <SwipeableTaskRow
                    taskId={item.task!.id}
                    canComplete={!item.done}
                    onComplete={() => toggleTaskDone(item.task!, () => router.refresh())}
                    onTomorrow={() => pushTaskTomorrow(item.task!, timezone, () => router.refresh())}
                  >
                    {rowInner}
                  </SwipeableTaskRow>
                ) : (
                  rowInner
                )}
              </li>
            </Fragment>
          );
        })}
        {nowAt === items.length && <NowLine label={clock.format(now!)} />}
      </ol>
    </section>
  );
}
