"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import type { Task } from "@/lib/db/schema";
import { isShortcutBlocked } from "@/lib/screens";
import { notifyMutation } from "./mutation-notice";
import { TaskComplete } from "./task-complete";
import { SwipeableTaskRow } from "./swipeable-task-row";

export async function toggleTaskDone(
  task: Task,
  refresh: () => void,
  onError?: (message: string) => void,
) {
  const nextStatus = task.status === "Done" ? "To do" : "Done";
  try {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: task.revision,
        status: nextStatus,
        mutationId: crypto.randomUUID(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not update task.");
    notifyMutation(response, refresh, {
      message: nextStatus === "Done" ? "Task completed." : "Task reopened.",
    });
    refresh();
  } catch (failure) {
    onError?.(failure instanceof Error ? failure.message : "Could not update task. Try again.");
  }
}

export async function pushTaskTomorrow(
  task: Task,
  timezone: string,
  refresh: () => void,
  onError?: (message: string) => void,
) {
  const tomorrow = Temporal.Now.plainDateISO(timezone).add({ days: 1 }).toString();
  try {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: task.revision,
        dueDate: tomorrow,
        ...(task.dueAt ? { dueAt: null, timezone: null } : {}),
        mutationId: crypto.randomUUID(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not move task to tomorrow.");
    notifyMutation(response, refresh, { message: "Moved to tomorrow." });
    refresh();
  } catch (failure) {
    onError?.(failure instanceof Error ? failure.message : "Could not move task. Try again.");
  }
}

/** Keyboard `E` (edit) and `X` (complete/reopen) for whichever task row is focused on Today. */
export function TodayShortcuts({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isShortcutBlocked(e)) return;
      const key = e.key.toLowerCase();
      if (key !== "e" && key !== "x") return;
      const row = document.activeElement?.closest<HTMLElement>("[data-task-row]");
      const taskId = row?.dataset.taskRow;
      if (!taskId) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      e.preventDefault();
      if (key === "e") {
        router.push(`/?task=${task.id}`, { scroll: false });
      } else {
        void toggleTaskDone(task, () => router.refresh());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tasks, router]);
  return null;
}

/** Due-today unscheduled rows with touch swipe (right = complete, left = tomorrow). */
export function TodayDueList({
  tasks,
  projectNames,
  timezone,
}: {
  tasks: Task[];
  projectNames: Record<string, string>;
  timezone: string;
}) {
  const router = useRouter();
  return (
    <ul className="today-list">
      {tasks.map((task) => (
        <li key={task.id} className="today-row-wrap">
          <SwipeableTaskRow
            taskId={task.id}
            canComplete={task.status !== "Done"}
            onComplete={() => toggleTaskDone(task, () => router.refresh())}
            onTomorrow={() => pushTaskTomorrow(task, timezone, () => router.refresh())}
          >
            <div className="today-row">
              <TaskComplete task={task} />
              <div className="today-row-body">
                <Link
                  className="task-title"
                  data-task-link={task.id}
                  href={`/?task=${task.id}`}
                  title="Edit task (E)"
                  scroll={false}
                >
                  {task.title}
                </Link>
                {task.projectId && projectNames[task.projectId] && (
                  <span className="today-meta">{projectNames[task.projectId]}</span>
                )}
              </div>
              <Link
                className="today-quiet-action"
                href={`/calendar?schedule=1&task=${task.id}`}
              >
                Schedule<span className="sr-only"> {task.title}</span>
              </Link>
            </div>
          </SwipeableTaskRow>
        </li>
      ))}
    </ul>
  );
}
