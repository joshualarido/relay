import { cache } from "react";
import { getDatabase } from "./db";
import { listProjects } from "@/services/projects";
import { listTasks } from "@/services/tasks";
import { listEvents } from "@/services/events";
import { getPreferences, listWorkingHoursOverrides } from "./preferences";

export const getCachedProjects = cache((ownerId: string, archived = false) =>
  listProjects(getDatabase(), ownerId, archived),
);

export const getCachedTasks = cache((ownerId: string, includeArchived = false) =>
  listTasks(getDatabase(), ownerId, includeArchived),
);

export const getCachedEvents = cache((ownerId: string, includeArchived = false) =>
  listEvents(getDatabase(), ownerId, includeArchived),
);

export const getCachedPreferences = cache((ownerId: string) =>
  getPreferences(getDatabase(), ownerId),
);

export const getCachedWorkingHoursOverrides = cache((ownerId: string) =>
  listWorkingHoursOverrides(getDatabase(), ownerId),
);
