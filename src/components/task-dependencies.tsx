"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dependency, Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";

export function TaskDependencies({ task, tasks, edges }: { task: Task; tasks: Task[]; edges: Dependency[] }) {
  const id = useId(), router = useRouter();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function mutate(url: string, method: string, input: unknown) {
    setPending(true); setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Try again."); }
    finally { setPending(false); }
  }
  return <section className="section stack"><h2>Dependencies</h2>
    <p className="muted text-sm">Warnings, not locks. You can change status even while a prerequisite is unfinished.</p>
    {edges.map((edge) => {
      const prerequisite = tasks.find((t) => t.id === edge.prerequisiteId);
      if (!prerequisite) return null;
      return <div key={edge.id} className="stack"><Link className="text-primary" href={`/inbox?task=${prerequisite.id}`}>{prerequisite.title}</Link>
        <p className={prerequisite.status === "Done" ? "muted" : "error-message"}>{prerequisite.status !== "Done" ? `Waiting on "${prerequisite.title}" (${prerequisite.status}).` : "Prerequisite completed."}</p>
        <Button variant="outline" disabled={pending} aria-label={`Remove dependency on ${prerequisite.title}`} onClick={() => {
          void mutate(`/api/dependencies/${edge.id}`, "DELETE", { expectedRevision: edge.revision, mutationId: crypto.randomUUID() });
        }}>Remove dependency</Button>
      </div>;
    })}
    <form className="stack" onSubmit={(e) => {
      e.preventDefault(); const prerequisiteId = new FormData(e.currentTarget).get("prerequisiteId");
      void mutate("/api/dependencies", "POST", { taskId: task.id, prerequisiteId, mutationId: crypto.randomUUID() });
    }}>
      <div className="field"><label htmlFor={id}>Prerequisite task</label><select id={id} name="prerequisiteId" required defaultValue=""><option value="" disabled>Choose a task</option>{tasks.filter((t) => t.id !== task.id && !edges.some((d) => d.prerequisiteId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
      <Button variant="outline" type="submit" disabled={pending}>Add dependency</Button>
    </form>
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
