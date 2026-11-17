"use client";

import { toast, Toaster } from "sonner";

export function MutationNotices() {
  return <Toaster theme="dark" closeButton duration={7000} style={{ pointerEvents: "auto", zIndex: "var(--z-toast)", fontFamily: "inherit" }} toastOptions={{
    style: { background: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" },
  }} />;
}

export function notifyMutation(response: Response, refresh: () => void) {
  const operationId = response.headers.get("X-Relay-Operation-Id");
  if (!operationId) return;
  const mutationId = crypto.randomUUID();
  toast("Change saved.", {
    action: { label: "Undo", onClick: async () => {
      try {
        const response = await fetch(`/api/history/${operationId}/undo`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutationId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        toast.success("Change undone."); refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not undo. Try again.");
      }
    } },
  });
}
