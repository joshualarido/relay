"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Repeat } from "lucide-react";
import type { Task } from "@/lib/db/schema";
import { formatMinutes, taskMinutes, type TaskTypeMinutes } from "@/lib/capacity";
import { formatRecurrenceSummary } from "@/lib/recurrence";
import { notifyMutation } from "./mutation-notice";
import { SwipeableTaskRow } from "./swipeable-task-row";
import { TaskComplete } from "./task-complete";
import { pushTaskTomorrow, toggleTaskDone } from "./today-due-list";

function SortableQueueRow({
  task,
  projectName,
  minutes,
  timezone,
}: {
  task: Task;
  projectName?: string;
  minutes: number;
  timezone: string;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const recurrenceLabel = formatRecurrenceSummary(task.recurrenceRule);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`today-row-wrap${isDragging ? " is-dragging" : ""}`}
      data-task-row={task.id}
    >
      <SwipeableTaskRow
        taskId={task.id}
        canComplete={task.status !== "Done"}
        onComplete={() => toggleTaskDone(task, () => router.refresh())}
        onTomorrow={() => pushTaskTomorrow(task, timezone, () => router.refresh())}
      >
        <div className="today-row queue-row">
          <button
            type="button"
            className="queue-drag-handle"
            aria-label={`Reorder ${task.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
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
            {projectName && <span className="today-meta">{projectName}</span>}
            {recurrenceLabel && (
              <span className="recurrence-pill" title={`Repeats: ${recurrenceLabel}`}>
                <Repeat size={11} aria-hidden="true" />
                {recurrenceLabel}
              </span>
            )}
          </div>
          <span className="task-type-pill" data-task-type={task.taskType}>
            {task.taskType} · {formatMinutes(minutes)}
          </span>
        </div>
      </SwipeableTaskRow>
    </li>
  );
}

/** Linear, time-agnostic task queue for Today with drag-to-reorder and completion. */
export function TodayQueue({
  today,
  tasks,
  projectNames,
  taskTypeMinutes,
  timezone,
}: {
  today: string;
  tasks: Task[];
  projectNames: Record<string, string>;
  taskTypeMinutes: TaskTypeMinutes;
  timezone: string;
}) {
  const router = useRouter();
  const doneTasks = tasks.filter((t) => t.status === "Done");
  const [openTasks, setOpenTasks] = useState(() => tasks.filter((t) => t.status !== "Done"));
  const [syncedTasks, setSyncedTasks] = useState(tasks);
  const [error, setError] = useState("");

  if (syncedTasks !== tasks) {
    setSyncedTasks(tasks);
    setOpenTasks(tasks.filter((t) => t.status !== "Done"));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = openTasks.findIndex((t) => t.id === active.id);
    const newIndex = openTasks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = openTasks;
    const reordered = arrayMove(openTasks, oldIndex, newIndex);
    setOpenTasks(reordered);
    setError("");

    try {
      const response = await fetch("/api/tasks/day-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionDate: today,
          orderedIds: reordered.map((t) => t.id),
          expectedRevisions: previous.map((t) => ({ id: t.id, revision: t.revision })),
          mutationId: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reorder queue.");
      notifyMutation(response, () => router.refresh(), { message: "Queue order updated." });
      router.refresh();
    } catch (err) {
      setOpenTasks(previous);
      setError(err instanceof Error ? err.message : "Could not reorder queue.");
    }
  }

  return (
    <section className="today-section" aria-labelledby="today-queue-heading">
      <div className="today-queue-header">
        <h2 id="today-queue-heading">Tasks</h2>
        {openTasks.length > 0 && (
          <span className="today-meta">
            {formatMinutes(
              openTasks.reduce((sum, t) => sum + taskMinutes(t, taskTypeMinutes), 0),
            )}{" "}
            left
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="error-message text-sm">
          {error}
        </p>
      )}

      {openTasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={openTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ol className="today-list today-queue">
              {openTasks.map((task) => (
                <SortableQueueRow
                  key={task.id}
                  task={task}
                  projectName={task.projectId ? projectNames[task.projectId] : undefined}
                  minutes={taskMinutes(task, taskTypeMinutes)}
                  timezone={timezone}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {doneTasks.length > 0 && (
        <ul className="today-list today-queue-done" aria-label="Completed today">
          {doneTasks.map((task) => (
            <li key={task.id} className="today-row-wrap" data-task-row={task.id}>
              <div className="today-row is-done">
                <span className="complete-mark" role="img" aria-label="Completed">
                  <Check size={13} aria-hidden="true" />
                </span>
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
                <span className="task-type-pill" data-task-type={task.taskType}>
                  {task.taskType}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
