"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Compass, Folder, Keyboard, Plus, Search, SquareCheck, X } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { isShortcutBlocked } from "@/lib/screens";
import { searchPalette, type PaletteCommand } from "@/lib/palette-search";
import { Button } from "./ui/button";
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

  const baseResults = useMemo(
    () => searchPalette(query, projects, tasks),
    [query, projects, tasks],
  );

  const items: (PaletteCommand | { id: string; kind: "capture-seed"; title: string; seed: string })[] =
    useMemo(() => {
      const trimmed = query.trim();
      if (!trimmed) return baseResults;
      return [
        ...baseResults,
        {
          id: "capture-seed",
          kind: "capture-seed" as const,
          title: `Capture "${trimmed}"`,
          seed: trimmed,
        },
      ];
    }, [baseResults, query]);

  const clampedIndex = items.length > 0 ? Math.min(activeIndex, items.length - 1) : -1;

  function close() {
    onOpenChange(false);
    setQuery("");
    setActiveIndex(0);
  }

  function runItem(item: (typeof items)[number]) {
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

  // Ctrl/Cmd+K toggles palette from anywhere; `/` opens it when not blocked by an input/dialog/menu.
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
      if (items.length) setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      if (items.length) setActiveIndex(items.length - 1);
    } else if (e.key === "Enter" && clampedIndex >= 0 && items[clampedIndex]) {
      e.preventDefault();
      runItem(items[clampedIndex]);
    }
  }

  function renderIcon(item: (typeof items)[number]) {
    if (item.kind === "project") return <Folder size={15} aria-hidden="true" />;
    if (item.kind === "task") return <SquareCheck size={15} aria-hidden="true" />;
    if (item.kind === "capture-seed") return <Plus size={15} aria-hidden="true" />;
    if (item.kind === "action" && item.action === "capture") return <Plus size={15} aria-hidden="true" />;
    if (item.kind === "action" && item.action === "shortcuts") return <Keyboard size={15} aria-hidden="true" />;
    return <Compass size={15} aria-hidden="true" />;
  }

  const activeItem = clampedIndex >= 0 ? items[clampedIndex] : null;

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
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="form-dialog palette-dialog"
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
          <div className="palette-input-row">
            <Search size={17} className="palette-search-icon" aria-hidden="true" />
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
              placeholder="Search projects, tasks, or go to..."
              maxLength={500}
              autoComplete="off"
            />
            <Dialog.Close asChild>
              <Button variant="ghost" className="icon-button" aria-label="Close search and commands">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>

          <ul id={listId} role="listbox" aria-label="Results" className="palette-results">
            {items.map((item, index) => {
              const selected = index === clampedIndex;
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
                  {"shortcut" in item && item.shortcut && <kbd>{item.shortcut}</kbd>}
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
