"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { activity } from "@/lib/db/schema";
import { Button } from "./ui/button";

type Operation = typeof activity.$inferSelect;
const isDeletion = (a: Operation) => a.beforeState.length > 0 && a.beforeState.every((s) => !s.record.deletedAt) && a.afterState.every((s) => Boolean(s.record.deletedAt));

function HistoryEntry({ entry }: { entry: Operation }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const mutationId = useRef(crypto.randomUUID()), router = useRouter();
  const deletion = isDeletion(entry), reversible = !["undo", "restore"].includes(entry.action);
  const snapshot = entry.afterState.find((s) => s.record.id === entry.entityId) ?? entry.afterState[0];
  const label = snapshot && ("name" in snapshot.record ? snapshot.record.name : "title" in snapshot.record ? snapshot.record.title : "content" in snapshot.record ? snapshot.record.content : "Task dependency");
  return <article className="section stack" aria-label={`${entry.action} ${entry.entityType}: ${label}`}>
    <div><h2 className="break-words">{label}</h2><p className="muted">{entry.action} / {entry.entityType} / <time dateTime={entry.createdAt}>{entry.createdAt}</time></p></div>
    <details><summary>Inspect affected records ({entry.afterState.length})</summary>
      <pre className="history-state">{JSON.stringify({ before: entry.beforeState, after: entry.afterState }, null, 2)}</pre>
    </details>
    {entry.undoneAt ? <p className="muted">Recovered</p> : (deletion || reversible) ? <div>
      <Button variant="outline" disabled={pending} onClick={async () => {
        setPending(true); setError("");
        try {
          const response = await fetch(`/api/history/${entry.id}/${deletion ? "restore" : "undo"}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutationId: mutationId.current }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          router.refresh();
        } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not recover. Try again."); }
        finally { setPending(false); }
      }}>{pending ? "Recovering..." : deletion ? "Restore" : "Undo"}</Button>
    </div> : <p className="muted">Recovery recorded. Original changes remain in history.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </article>;
}

export function HistoryList({ entries }: { entries: Operation[] }) {
  const [view, setView] = useState("all"), [limit, setLimit] = useState(50);
  const visible = entries.filter((a) => view !== "deleted" || isDeletion(a));
  return <div className="stack"><div className="field bounded"><label htmlFor="history-view">History view</label>
    <select id="history-view" value={view} onChange={(e) => { setView(e.target.value); setLimit(50); }}><option value="all">All activity</option><option value="deleted">Deleted records and restorations</option></select>
  </div>
    {!visible.length && <p className="muted">No recorded changes here yet. Your manual changes will appear here.</p>}
    {visible.slice(0, limit).map((entry) => <HistoryEntry entry={entry} key={entry.id} />)}
    {visible.length > limit && <Button variant="outline" onClick={() => setLimit((n) => n + 50)}>Show 50 more</Button>}
  </div>;
}
