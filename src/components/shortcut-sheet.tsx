"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { isShortcutBlocked } from "@/lib/screens";
import { Button } from "./ui/button";

const ShortcutSheetContext = createContext<{ open: (trigger?: HTMLElement | null) => void }>({
  open: () => {},
});

export function useShortcutSheet() {
  return useContext(ShortcutSheetContext);
}

const GROUPS: { heading: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    heading: "Navigation",
    rows: [
      { keys: ["1", "2", "3"], label: "Go to Today, Projects, Calendar" },
      { keys: ["Ctrl+←", "Ctrl+→"], label: "Previous / next screen (⌘⌥←/→ on Mac)" },
    ],
  },
  {
    heading: "Input & search",
    rows: [
      { keys: ["N"], label: "Quick capture (Task or Event)" },
      { keys: ["Tab"], label: "Switch Task / Event in capture" },
      { keys: ["Ctrl+K", "/"], label: "Search and commands" },
      { keys: ["Ctrl+N"], label: "New project (on Projects)" },
    ],
  },
  {
    heading: "Tasks & calendar",
    rows: [
      { keys: ["E"], label: "Edit focused task" },
      { keys: ["X"], label: "Complete or reopen focused task" },
      { keys: ["S"], label: "Schedule mode (on Calendar)" },
      { keys: ["↑", "↓"], label: "Move through list or panel" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
    ],
  },
];

/** Global `?` shortcut cheat sheet (list from PRD §4). */
export function ShortcutSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((trigger?: HTMLElement | null) => {
    returnFocus.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "?") return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isShortcutBlocked(e)) return;
      e.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <ShortcutSheetContext.Provider value={{ open }}>
      {children}
      <Dialog.Root open={isOpen} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="form-dialog shortcut-sheet"
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              if (returnFocus.current?.isConnected) {
                e.preventDefault();
                returnFocus.current.focus();
              }
            }}
          >
            <Dialog.Title className="text-xl font-semibold mb-4">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" className="dialog-close" aria-label="Close keyboard shortcuts">
                <X size={20} />
              </Button>
            </Dialog.Close>
            <div className="shortcut-groups">
              {GROUPS.map((group) => (
                <section key={group.heading} className="shortcut-group">
                  <h3>{group.heading}</h3>
                  <dl className="shortcut-list">
                    {group.rows.map((row) => (
                      <div key={row.label} className="shortcut-row">
                        <dt>{row.label}</dt>
                        <dd>
                          {row.keys.map((key) => (
                            <kbd key={key}>{key}</kbd>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ShortcutSheetContext.Provider>
  );
}
