"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Event, Project, Task } from "@/lib/db/schema";
import { DEFAULT_TASK_TYPE_MINUTES, type TaskTypeMinutes } from "@/lib/capacity";

type WorkspaceSnapshot = {
  projects: Project[];
  tasks: Task[];
  events: Event[];
};

type WorkspaceContextValue = WorkspaceSnapshot & {
  /** The user's default minutes per task type; a task's own durationMinutes overrides these. */
  taskTypeMinutes: TaskTypeMinutes;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  syncSnapshot: (next: Partial<WorkspaceSnapshot>) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  initialProjects,
  initialTasks,
  initialEvents,
  taskTypeMinutes = DEFAULT_TASK_TYPE_MINUTES,
  children,
}: {
  initialProjects: Project[];
  initialTasks: Task[];
  initialEvents: Event[];
  taskTypeMinutes?: TaskTypeMinutes;
  children: React.ReactNode;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [tasks, setTasks] = useState(initialTasks);
  const [events, setEvents] = useState(initialEvents);
  const [synced, setSynced] = useState({ initialProjects, initialTasks, initialEvents });

  if (
    synced.initialProjects !== initialProjects ||
    synced.initialTasks !== initialTasks ||
    synced.initialEvents !== initialEvents
  ) {
    setSynced({ initialProjects, initialTasks, initialEvents });
    setProjects(initialProjects);
    setTasks(initialTasks);
    setEvents(initialEvents);
  }

  const syncSnapshot = useCallback((next: Partial<WorkspaceSnapshot>) => {
    if (next.projects) setProjects(next.projects);
    if (next.tasks) setTasks(next.tasks);
    if (next.events) setEvents(next.events);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ projects, tasks, events, taskTypeMinutes, setProjects, setTasks, setEvents, syncSnapshot }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
