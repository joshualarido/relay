"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";

export function TaskComplete({ task }: { task: Task }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  return <div><Button className="complete-task" variant="outline" aria-label={`Complete ${task.title}`} title="Complete task (X)" disabled={pending} onClick={async () => {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: task.revision, status: "Done", mutationId: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not complete task. Try again."); }
    finally { setPending(false); }
  }}><Check size={18} aria-hidden="true" /></Button>{error && <p role="alert" className="error-message text-sm">{error}</p>}</div>;
}
