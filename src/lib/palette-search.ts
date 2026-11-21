import { fuzzyScore } from "./capture-parser";
import { projectHref, taskHref } from "./links";

export type PaletteCommand =
  | {
      id: string;
      kind: "nav";
      title: string;
      subtitle?: string;
      href: string;
      shortcut?: string;
      keywords: string;
    }
  | {
      id: string;
      kind: "action";
      action: "capture" | "shortcuts";
      title: string;
      subtitle?: string;
      shortcut?: string;
      keywords: string;
    }
  | {
      id: string;
      kind: "project";
      title: string;
      subtitle: string;
      href: string;
    }
  | {
      id: string;
      kind: "task";
      title: string;
      subtitle: string;
      href: string;
    };

export const NAV_COMMANDS: Extract<PaletteCommand, { kind: "nav" | "action" }>[] = [
  { id: "nav-today", kind: "nav", title: "Go to Today", href: "/", shortcut: "1", keywords: "today home timeline" },
  { id: "nav-projects", kind: "nav", title: "Go to Projects", href: "/projects", shortcut: "2", keywords: "projects board tasks" },
  { id: "nav-calendar", kind: "nav", title: "Go to Calendar", href: "/calendar", shortcut: "3", keywords: "calendar week month day" },
  { id: "nav-schedule", kind: "nav", title: "Open Schedule mode", href: "/calendar?schedule=1", shortcut: "S", keywords: "schedule mode calendar time block" },
  { id: "nav-settings", kind: "nav", title: "Go to Settings", href: "/settings", keywords: "settings timezone preferences" },
  { id: "act-capture", kind: "action", action: "capture", title: "Quick capture", shortcut: "N", keywords: "new task event add capture" },
  { id: "act-shortcuts", kind: "action", action: "shortcuts", title: "Keyboard shortcuts", shortcut: "?", keywords: "help keys cheatsheet shortcuts" },
];

export type PaletteProjectInput = {
  id: string;
  name: string;
  description?: string;
  status: string;
  deadline?: string | null;
  archivedAt?: string | null;
  updatedAt?: string;
};

export type PaletteTaskInput = {
  id: string;
  title: string;
  description?: string;
  projectId: string | null;
  status: string;
  dueDate?: string | null;
  important?: boolean | null;
  updatedAt?: string;
};

/** Instant fuzzy search over navigation commands, projects, and tasks. */
export function searchPalette(
  query: string,
  projects: PaletteProjectInput[],
  tasks: PaletteTaskInput[],
  limit = 16,
): PaletteCommand[] {
  const q = query.trim();
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const toProjectItem = (p: PaletteProjectInput): PaletteCommand => ({
    id: `project-${p.id}`,
    kind: "project",
    title: p.name,
    subtitle: [p.archivedAt ? "Archived" : p.status, p.deadline ? `Due ${p.deadline}` : ""].filter(Boolean).join(" · "),
    href: projectHref(p.id),
  });

  const toTaskItem = (t: PaletteTaskInput): PaletteCommand => {
    const projectLabel = t.projectId ? projectMap.get(t.projectId) ?? "Project" : "No project";
    const parts = [projectLabel, t.status];
    if (t.dueDate) parts.push(`Due ${t.dueDate}`);
    if (t.important) parts.push("Important");
    return {
      id: `task-${t.id}`,
      kind: "task",
      title: t.title,
      subtitle: parts.join(" · "),
      href: taskHref(t),
    };
  };

  if (!q) {
    const activeProjects = projects
      .filter((p) => !p.archivedAt)
      .slice(0, 4)
      .map(toProjectItem);
    const openTasks = tasks
      .filter((t) => t.status !== "Done")
      .slice(0, 5)
      .map(toTaskItem);
    return [...NAV_COMMANDS.slice(0, 5), ...activeProjects, ...openTasks];
  }

  const scored: { item: PaletteCommand; score: number }[] = [];

  for (const cmd of NAV_COMMANDS) {
    const titleScore = fuzzyScore(q, cmd.title);
    const kwScore = Math.round(fuzzyScore(q, cmd.keywords) * 0.75);
    const score = Math.max(titleScore, kwScore);
    if (score > 0) scored.push({ item: cmd, score: score + 20 });
  }

  for (const p of projects) {
    const nameScore = fuzzyScore(q, p.name);
    const descScore = p.description ? Math.round(fuzzyScore(q, p.description) * 0.5) : 0;
    const base = Math.max(nameScore, descScore);
    if (base > 0) {
      scored.push({
        item: toProjectItem(p),
        score: p.archivedAt ? Math.round(base * 0.6) : base + 10,
      });
    }
  }

  for (const t of tasks) {
    const titleScore = fuzzyScore(q, t.title);
    const descScore = t.description ? Math.round(fuzzyScore(q, t.description) * 0.45) : 0;
    const base = Math.max(titleScore, descScore);
    if (base > 0) {
      scored.push({
        item: toTaskItem(t),
        score: t.status === "Done" ? Math.round(base * 0.85) : base,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  return scored.slice(0, limit).map((s) => s.item);
}
