"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/db/schema";
import { priorityLabel, quadrants } from "@/lib/priority";
import { notifyMutation } from "./mutation-notice";

export function PriorityMatrix({ tasks }: { tasks: Task[] }) {
  const router = useRouter(), [pending, setPending] = useState(""), [error, setError] = useState("");
  const [refreshing, startTransition] = useTransition();
  const unfinished = tasks.filter((t) => t.status !== "Done");
  async function classify(t: Task, dimension: "important" | "urgent", value: string) {
    setPending(t.id); setError("");
    try {
      const response = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: t.revision, [dimension]: value === "" ? null : value === "true", mutationId: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); startTransition(() => router.refresh());
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not classify. Try again."); }
    finally { setPending(""); }
  }
  return <div className="stack">
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="matrix-grid">{quadrants.map((quadrant, index) => {
      const group = unfinished.filter((t) => priorityLabel(t) === quadrant);
      return <section className="section" key={quadrant} aria-label={quadrant}>
        <h2>{quadrant} <span className="muted text-sm">{group.length}</span></h2>
        <p className="muted text-sm mb-4">{["Important and urgent", "Important, not urgent", "Urgent, not important", "Neither important nor urgent", "Choose importance and urgency when you are ready."][index]}</p>
        {group.length ? <ul className="work-list">{group.map((t) => <li key={t.id} className="matrix-task">
          <Link className="task-title" data-task-link={t.id} href={`${t.projectId ? `/projects/${t.projectId}` : "/inbox"}?task=${t.id}`}>{t.title}</Link>
          <div className="form-grid mt-3">{(["important", "urgent"] as const).map((dimension) => <label className="field text-sm muted" key={dimension}>
            {dimension === "important" ? "Important" : "Urgent"}
            <select aria-label={`${dimension === "important" ? "Important" : "Urgent"}: ${t.title}`} value={t[dimension] === null ? "" : String(t[dimension])}
              disabled={Boolean(pending) || refreshing} onChange={(e) => void classify(t, dimension, e.target.value)}>
              <option value="">Unset</option><option value="true">Yes</option><option value="false">No</option>
            </select>
          </label>)}</div>
        </li>)}</ul> : <p className="muted text-sm">No tasks here.</p>}
      </section>;
    })}</div>
  </div>;
}
