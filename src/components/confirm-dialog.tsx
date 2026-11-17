"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "./ui/button";

type Confirmation = { title: string; description: string; action: string; details?: ReactNode };

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
