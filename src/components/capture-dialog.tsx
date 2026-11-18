"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Plus, X } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import { isShortcutBlocked } from "@/lib/screens";
import { Button } from "./ui/button";
import { QuickCapture } from "./quick-capture";

export type CaptureData = { projects: Project[]; tasks: Task[]; timezone: string };

const CaptureContext = createContext<{ open: (trigger?: HTMLElement | null) => void }>({ open: () => {} });

export function useCapture() { return useContext(CaptureContext); }

/** One Capture dialog for the whole workspace: opened by `N`, the Capture button, or (Task 7) the tab bar. */
export function CaptureProvider({ data, children }: { data: CaptureData; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = useCallback((trigger?: HTMLElement | null) => {
    returnFocus.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isShortcutBlocked(e)) return;
      e.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <CaptureContext.Provider value={{ open }}>
    {children}
    <Dialog.Root open={isOpen} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="form-dialog capture-dialog" aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            const input = (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>("input[name=title]");
            if (input) { e.preventDefault(); input.focus(); }
          }}
          onCloseAutoFocus={(e) => {
            const target = returnFocus.current ?? document.querySelector<HTMLElement>("[data-capture-trigger]");
            if (target?.isConnected) { e.preventDefault(); target.focus(); }
          }}>
          <Dialog.Title className="text-xl font-semibold mb-6">Capture</Dialog.Title>
          <Dialog.Close asChild><Button variant="ghost" className="dialog-close" aria-label="Close capture" disabled={pending}><X size={20} /></Button></Dialog.Close>
          <QuickCapture timezone={data.timezone} inlineConfirmation={false}
            onPendingChange={setPending} onDone={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </CaptureContext.Provider>;
}

export function CaptureButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { open } = useCapture();
  return <Button variant={variant} data-capture-trigger onClick={(e) => open(e.currentTarget)} title="Capture (N)">
    <Plus size={17} aria-hidden="true" />Capture <kbd aria-hidden="true">N</kbd>
  </Button>;
}
