"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckIn } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";

export function CheckIns({ entries, projectId = null, taskId = null, onPendingChange }: { entries: CheckIn[]; projectId?: string | null; taskId?: string | null; onPendingChange?: (pending: boolean) => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const identity = useRef({ payload: "", id: "" });
  const router = useRouter(), id = useId();
  return <section className="section stack"><h2>Check-ins</h2><p className="muted text-sm">A short progress note for your future self.</p>
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); const form = e.currentTarget;
      const input = { content: new FormData(form).get("content"), taskId, projectId };
      const payload = JSON.stringify(input);
      if (identity.current.payload !== payload) identity.current = { payload, id: crypto.randomUUID() };
      setPending(true); onPendingChange?.(true); setError("");
      try {
        const response = await fetch("/api/check-ins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, mutationId: identity.current.id }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.fields?.content?.join(" ") || result.error);
        form.reset(); identity.current = { payload: "", id: "" }; notifyMutation(response, () => router.refresh()); router.refresh();
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Your note is preserved."); }
      finally { setPending(false); onPendingChange?.(false); }
    }}>
      <div className="field"><label htmlFor={id}>Check-in</label><textarea id={id} name="content" rows={3} maxLength={20000} required disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /></div>
      {error && <p id={`${id}-error`} role="alert" className="error-message">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save check-in"}</Button>
    </form>
    {entries.length ? <ol className="stack">{entries.map((entry) => <li key={entry.id}><p className="whitespace-pre-wrap break-words">{entry.content}</p><p className="muted text-sm"><time dateTime={entry.createdAt}>{entry.createdAt}</time>{projectId && entry.taskId ? " / task check-in" : ""}</p></li>)}</ol> : <p className="muted">No check-ins saved yet.</p>}
  </section>;
}
