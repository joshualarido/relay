"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  Archive,
  CalendarClock,
  CalendarDays,
  Check,
  Compass,
  Folder,
  FolderKanban,
  House,
  Keyboard,
  Plus,
  Search,
  SquareCheck,
} from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import { isShortcutBlocked } from "@/lib/screens";
import { searchPalette, type PaletteCommand } from "@/lib/palette-search";
import { projectHref, taskHref } from "@/lib/links";
import { notifyMutation } from "./mutation-notice";
import { useWorkspace } from "./workspace-store";
import { useCapture } from "./capture-dialog";
import { useShortcutSheet } from "./shortcut-sheet";

export function CommandPalette({
  projects: propProjects,
  open,
  onOpenChange,
  returnFocus,
}: {
  projects: Pick<Project, "id" | "name">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const capture = useCapture();
  const shortcuts = useShortcutSheet();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const projects = useMemo(
    () =>
      workspace?.projects ??
      propProjects.map((p) => ({
        ...p,
        description: "",
        status: "Active",
        deadline: null,
        archivedAt: null,
      })),
    [workspace?.projects, propProjects],
  );
  const tasks = useMemo(() => workspace?.tasks ?? [], [workspace?.tasks]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const trimmed = query.trim();

  const recentItems = useMemo(() => {
    const activeProjects = projects
      .filter((p) => !p.archivedAt)
      .slice(0, 3)
      .map((p) => ({
        id: `recent-p-${p.id}`,
        kind: "project" as const,
        title: p.name,
        subtitle: p.status,
        href: projectHref(p.id),
      }));
    const openTasks = tasks
      .filter((t) => t.status !== "Done" && !t.archivedAt)
      .slice(0, 3)
      .map((t) => ({
        id: `recent-t-${t.id}`,
        kind: "task" as const,
        taskId: t.id,
        title: t.title,
        subtitle: t.dueDate ? `Due ${t.dueDate}` : "To do",
        href: taskHref(t),
      }));
    return [...activeProjects, ...openTasks];
  }, [projects, tasks]);

  const searchItems: (PaletteCommand | { id: string; kind: "capture-seed"; title: string; seed: string })[] =
    useMemo(() => {
      if (!trimmed) return [];
      const hits = searchPalette(trimmed, projects, tasks, 12);
      return [
        ...hits,
        {
          id: "capture-seed",
          kind: "capture-seed" as const,
          title: `Capture "${trimmed}"`,
          seed: trimmed,
        },
      ];
    }, [trimmed, projects, tasks]);

  const activeList = trimmed ? searchItems : recentItems;
  const clampedIndex = activeList.length > 0 ? Math.min(activeIndex, activeList.length - 1) : -1;

  function close() {
    onOpenChange(false);
    setQuery("");
    setActiveIndex(0);
  }

  function runItem(item: (typeof activeList)[number]) {
    const trigger = returnFocus.current;
    close();
    if (item.kind === "capture-seed") {
      capture.open(trigger, item.seed);
      return;
    }
    if (item.kind === "action") {
      if (item.action === "capture") capture.open(trigger);
      else if (item.action === "shortcuts") shortcuts.open(trigger);
      return;
    }
    router.push(item.href);
  }

  async function quickCompleteTask(task: Task) {
    workspace?.setTasks((all) =>
      all.map((t) => (t.id === task.id ? { ...t, status: "Done" } : t)),
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: task.revision,
          status: "Done",
          mutationId: crypto.randomUUID(),
        }),
      });
      if (res.ok) {
        notifyMutation(res, () => router.refresh(), { message: "Task completed." });
        router.refresh();
      }
    } catch {}
  }

  // Ctrl/Cmd+K toggles palette from anywhere; `/` opens it when not blocked.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setQuery("");
          setActiveIndex(0);
          onOpenChange(true);
        } else {
          onOpenChange(false);
          setQuery("");
          setActiveIndex(0);
        }
        return;
      }
      if (
        e.key === "/" &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !isShortcutBlocked(e)
      ) {
        e.preventDefault();
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setQuery("");
        setActiveIndex(0);
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, returnFocus]);

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activeList.length) setActiveIndex((i) => (i + 1) % activeList.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeList.length) setActiveIndex((i) => (i - 1 + activeList.length) % activeList.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      if (activeList.length) setActiveIndex(activeList.length - 1);
    } else if (e.key === "Enter" && clampedIndex >= 0 && activeList[clampedIndex]) {
      e.preventDefault();
      runItem(activeList[clampedIndex]);
    }
  }

  function renderIcon(item: (typeof activeList)[number]) {
    if (item.kind === "project") return <Folder size={15} aria-hidden="true" />;
    if (item.kind === "task") return <SquareCheck size={15} aria-hidden="true" />;
    if (item.kind === "capture-seed") return <Plus size={15} aria-hidden="true" />;
    if (item.kind === "action" && item.action === "capture") return <Plus size={15} aria-hidden="true" />;
    if (item.kind === "action" && item.action === "shortcuts") return <Keyboard size={15} aria-hidden="true" />;
    return <Compass size={15} aria-hidden="true" />;
  }

  const activeItem = clampedIndex >= 0 ? activeList[clampedIndex] : null;

  const quickButtons = [
    {
      label: "Capture",
      title: "Capture (N)",
      icon: Plus,
      onClick: () => {
        const trigger = returnFocus.current;
        close();
        capture.open(trigger, trimmed);
      },
    },
    { label: "Today", title: "Today (1)", icon: House, onClick: () => { close(); router.push("/"); } },
    { label: "Projects", title: "Projects (2)", icon: FolderKanban, onClick: () => { close(); router.push("/projects"); } },
    { label: "Calendar", title: "Calendar (3)", icon: CalendarDays, onClick: () => { close(); router.push("/calendar"); } },
    { label: "Archives", title: "Archives", icon: Archive, onClick: () => { close(); router.push("/archives"); } },
  ];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          setQuery("");
          setActiveIndex(0);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="palette-overlay" />
        <Dialog.Content
          className="palette-spotlight"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (returnFocus.current?.isConnected
              ? returnFocus.current
              : document.getElementById("main"))?.focus();
          }}
        >
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>

          <div className="palette-bar-row">
            <div className="palette-pill">
              <Search size={18} className="palette-search-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-label="Search workspace"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeItem ? `${listId}-${activeItem.id}` : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search Relay…"
                maxLength={500}
                autoComplete="off"
              />
              {!trimmed && <kbd className="palette-pill-kbd">Ctrl K</kbd>}
            </div>

            <div className="palette-quick-pills" role="group" aria-label="Quick actions">
              {quickButtons.map(({ label, title, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  className="palette-circle-btn"
                  aria-label={label}
                  title={title}
                  onClick={onClick}
                >
                  <Icon size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {activeList.length > 0 && (
            <div className="palette-panel">
              {!trimmed && <div className="palette-section-label">Recent</div>}
              <ul
                id={listId}
                role="listbox"
                aria-label={trimmed ? "Results" : "Recent"}
                className={trimmed ? "palette-results" : "palette-recent-grid"}
              >
                {activeList.map((item, index) => {
                  const selected = index === clampedIndex;
                  const taskId =
                    item.kind === "task"
                      ? item.id.startsWith("task-")
                        ? item.id.slice(5)
                        : "taskId" in item && typeof item.taskId === "string"
                          ? item.taskId
                          : undefined
                      : undefined;
                  const taskObj = taskId ? taskById.get(taskId) : undefined;

                  if (!trimmed) {
                    return (
                      <li
                        key={item.id}
                        id={`${listId}-${item.id}`}
                        role="option"
                        aria-selected={selected}
                        className="palette-recent-tile"
                        data-active={selected || undefined}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => runItem(item)}
                      >
                        <span className="palette-tile-icon">{renderIcon(item)}</span>
                        <span className="palette-tile-title">{item.title}</span>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={item.id}
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={selected}
                      className="palette-option"
                      data-active={selected || undefined}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runItem(item)}
                    >
                      <span className="palette-option-icon">{renderIcon(item)}</span>
                      <span className="palette-option-body">
                        <span className="palette-option-title">{item.title}</span>
                        {"subtitle" in item && item.subtitle && (
                          <span className="palette-option-meta">{item.subtitle}</span>
                        )}
                      </span>
                      {taskObj && taskObj.status !== "Done" && (
                        <span
                          className="palette-inline-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Complete ${taskObj.title}`}
                            title="Complete"
                            onClick={() => void quickCompleteTask(taskObj)}
                          >
                            <Check size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Schedule ${taskObj.title}`}
                            title="Schedule"
                            onClick={() => {
                              close();
                              router.push(`/calendar?schedule=1&task=${taskObj.id}`);
                            }}
                          >
                            <CalendarClock size={14} aria-hidden="true" />
                          </button>
                        </span>
                      )}
                      {"shortcut" in item && item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
