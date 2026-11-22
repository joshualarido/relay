"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Plus, X } from "lucide-react";
import { isShortcutBlocked } from "@/lib/screens";
import type { CaptureProjectOption } from "@/lib/capture-parser";
import type { TaskTypeMinutes } from "@/lib/capacity";
import { Button } from "./ui/button";
import { QuickCapture } from "./quick-capture";

export type CaptureData = {
  timezone: string;
  weekStart: number;
  projects?: CaptureProjectOption[];
  taskTypeMinutes?: TaskTypeMinutes;
};

const CaptureContext = createContext<{
  open: (trigger?: HTMLElement | null, initialValue?: string) => void;
}>({ open: () => {} });

export function useCapture() {
  return useContext(CaptureContext);
}

/** One Capture dialog for the whole workspace: opened by `N`, the Capture button, or the mobile `+` tab bar button. */
export function CaptureProvider({ data, children }: { data: CaptureData; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [initialValue, setInitialValue] = useState("");
  const [sessionKey, setSessionKey] = useState(0);
  const [pending, setPending] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((trigger?: HTMLElement | null, seed = "") => {
    returnFocus.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setInitialValue(seed);
    setSessionKey((k) => k + 1);
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

  return (
    <CaptureContext.Provider value={{ open }}>
      {children}
      <Dialog.Root
        open={isOpen}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="form-dialog capture-dialog"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              const input = (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>(
                "input[name=title]",
              );
              if (input) {
                e.preventDefault();
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
              }
            }}
            onCloseAutoFocus={(e) => {
              const target =
                returnFocus.current ?? document.querySelector<HTMLElement>("[data-capture-trigger]");
              if (target?.isConnected) {
                e.preventDefault();
                target.focus();
              }
            }}
          >
            <Dialog.Title className="text-xl font-semibold mb-4">Capture</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="dialog-close"
                aria-label="Close capture"
                disabled={pending}
              >
                <X size={20} />
              </Button>
            </Dialog.Close>
            <QuickCapture
              key={sessionKey}
              timezone={data.timezone}
              weekStart={data.weekStart}
              projects={data.projects}
              taskTypeMinutes={data.taskTypeMinutes}
              initialValue={initialValue}
              inlineConfirmation={false}
              onPendingChange={setPending}
              onDone={() => setOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </CaptureContext.Provider>
  );
}

export function CaptureButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { open } = useCapture();
  return (
    <Button
      variant={variant}
      data-capture-trigger
      onClick={(e) => open(e.currentTarget)}
      title="Capture (N)"
    >
      <Plus size={17} aria-hidden="true" />
      Capture <kbd aria-hidden="true">N</kbd>
    </Button>
  );
}
