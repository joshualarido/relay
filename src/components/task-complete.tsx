"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import confetti from "canvas-confetti";
import type { Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A small burst from an element's centre; no-op under reduced motion. */
export function burstFrom(el: Element | null, particleCount = 26) {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  void confetti({
    particleCount, spread: 70, startVelocity: 22, ticks: 90, scalar: 0.7, gravity: 0.9,
    origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight },
    colors: ["#5263F2", "#8B5CF6", "#22C55E", "#49C97E", "#FBBF24"], disableForReducedMotion: true,
  });
}

export function TaskComplete({ task }: { task: Task }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  return <div><Button ref={button} className="complete-task" variant="outline" aria-label={`Complete ${task.title}`} title="Complete task (X)" disabled={pending} onClick={async () => {
    setPending(true); setError("");
    const row = button.current?.closest(".today-row");
    row?.classList.add("is-completing");
    burstFrom(button.current);
    try {
      // Let the strike-through play before the row moves.
      const [response] = await Promise.all([
        fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: task.revision, status: "Done", mutationId: crypto.randomUUID() }) }),
        new Promise((r) => setTimeout(r, reduced() ? 0 : 550)),
      ]);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) {
      row?.classList.remove("is-completing");
      setError(failure instanceof Error ? failure.message : "Could not complete task. Try again.");
    }
    finally { setPending(false); }
  }}><Check size={13} aria-hidden="true" /></Button>{error && <p role="alert" className="error-message text-sm">{error}</p>}</div>;
}
