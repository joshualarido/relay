"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "./ui/button";

type Confirmation = { title: string; description: string; action: string; details?: ReactNode };

export type RecurrenceScopeChoice = "single" | "series" | null;

type ScopePrompt = {
  title: string;
  description: string;
  singleLabel?: string;
  seriesLabel?: string;
  destructive?: boolean;
};

export function useRecurrenceScopeDialog() {
  const [content, setContent] = useState<ScopePrompt | null>(null);
  const resolve = useRef<((choice: RecurrenceScopeChoice) => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => () => { resolve.current?.(null); }, []);
  function finish(choice: RecurrenceScopeChoice) {
    resolve.current?.(choice); resolve.current = null; setContent(null);
  }
  function askScope(next: ScopePrompt) {
    resolve.current?.(null);
    trigger.current = document.activeElement as HTMLElement;
    setContent(next);
    return new Promise<RecurrenceScopeChoice>((done) => { resolve.current = done; });
  }
  const scopeDialog = <AlertDialog.Root open={Boolean(content)} onOpenChange={(open) => { if (!open) finish(null); }}>
    <AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="form-dialog"
      onCloseAutoFocus={(e) => { e.preventDefault(); trigger.current?.focus(); }}>
      <AlertDialog.Title className="text-xl font-semibold">{content?.title}</AlertDialog.Title>
      <AlertDialog.Description className="muted mt-3">{content?.description}</AlertDialog.Description>
      <div className="form-actions">
        <AlertDialog.Cancel asChild><Button variant="outline" onClick={() => finish(null)}>Cancel</Button></AlertDialog.Cancel>
        <Button variant="outline" onClick={() => finish("single")}>{content?.singleLabel ?? "This occurrence"}</Button>
        <AlertDialog.Action asChild>
          <Button variant={content?.destructive ? "destructive" : "default"} onClick={() => finish("series")}>
            {content?.seriesLabel ?? "Whole series"}
          </Button>
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content></AlertDialog.Portal>
  </AlertDialog.Root>;
  return { askScope, scopeDialog };
}

export function useConfirmation() {
  const [content, setContent] = useState<Confirmation | null>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => () => { resolve.current?.(false); }, []);
  function finish(confirmed: boolean) {
    resolve.current?.(confirmed); resolve.current = null; setContent(null);
  }
  function confirm(next: Confirmation) {
    resolve.current?.(false);
    trigger.current = document.activeElement as HTMLElement;
    setContent(next);
    return new Promise<boolean>((done) => { resolve.current = done; });
  }
  const confirmation = <AlertDialog.Root open={Boolean(content)} onOpenChange={(open) => { if (!open) finish(false); }}>
    <AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="form-dialog"
      onCloseAutoFocus={(e) => { e.preventDefault(); trigger.current?.focus(); }}>
      <AlertDialog.Title className="text-xl font-semibold">{content?.title}</AlertDialog.Title>
      <AlertDialog.Description className="muted mt-3">{content?.description}</AlertDialog.Description>
      {content?.details}
      <div className="form-actions">
        <AlertDialog.Cancel asChild><Button variant="outline" onClick={() => finish(false)}>Cancel</Button></AlertDialog.Cancel>
        <AlertDialog.Action asChild><Button onClick={() => finish(true)}>{content?.action}</Button></AlertDialog.Action>
      </div>
    </AlertDialog.Content></AlertDialog.Portal>
  </AlertDialog.Root>;
  return { confirm, confirmation };
}
