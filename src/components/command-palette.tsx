"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import type { WorkItem } from "@/lib/workbench";
import { Button } from "./ui/button";
import { QuickCapture } from "./quick-capture";

export function CommandPalette({ projects, open, onOpenChange, returnFocus }: {
  projects: Pick<Project, "id" | "name">[]; open: boolean; onOpenChange: (open: boolean) => void; returnFocus: RefObject<HTMLElement | null>;
}) {
  const setOpen = onOpenChange;
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<{ items: WorkItem[]; total: number } | null>(null);
  const request = useRef<AbortController | null>(null);
  const clearSearch = useCallback(() => {
    request.current?.abort(); setPending(false); setResult(null); setError("");
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (!capturing) { if (!open) returnFocus.current = document.activeElement as HTMLElement; clearSearch(); setOpen(!open); } } }
    document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); request.current?.abort(); };
  }, [clearSearch, capturing, open, setOpen, returnFocus]);
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!capturing) { setOpen(value); clearSearch(); } }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="form-dialog"
      onCloseAutoFocus={(e) => { e.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : document.getElementById("main"))?.focus(); }}>
      <Dialog.Title className="text-xl font-semibold">Search and commands</Dialog.Title>
      <Dialog.Description className="muted mt-2 mb-6">Find saved work, capture a task, or go somewhere.</Dialog.Description>
      <Dialog.Close asChild><Button variant="ghost" className="dialog-close" aria-label="Close search and commands" disabled={capturing}><X size={20} /></Button></Dialog.Close>
      <div className="stack"><form className="stack" onSubmit={async (e) => {
        e.preventDefault(); const params = new URLSearchParams();
        for (const [key, value] of new FormData(e.currentTarget)) if (value) params.set(key, String(value));
        request.current?.abort();
        const controller = new AbortController(); request.current = controller;
        setPending(true); setError("");
        try {
          const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (!controller.signal.aborted) setResult(data);
        } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not search. Try again."); }
        finally { if (request.current === controller) setPending(false); }
      }}>
        <div className="field"><label htmlFor="workspace-search">Search workspace</label><input id="workspace-search" name="q" type="search" maxLength={500} /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="workspace-status">Status</label><select id="workspace-status" name="status"><option value="">Any status</option>{["Planned", "Active", "Paused", "To do", "Doing", "Done"].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label htmlFor="workspace-important">Important</label><select id="workspace-important" name="important"><option value="">Any</option><option value="true">Yes</option><option value="false">No</option><option value="unset">Unset</option></select></div>
          <div className="field"><label htmlFor="workspace-project">Project</label><select id="workspace-project" name="projectId"><option value="">All projects and Inbox</option><option value="inbox">Inbox only</option>{projects.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label htmlFor="workspace-date">Deadline or planned date</label><input id="workspace-date" type="date" name="date" /></div>
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Searching..." : "Search"}</Button>
      </form>
      {error && <p role="alert" className="error-message">{error}</p>}
      {result && <div className="stack" aria-live="polite"><p className="muted">{result.total} matches{result.total > result.items.length ? "; showing the first 100. Refine your filters to find the rest." : "."}</p>
        <ul className="work-list">{result.items.map((r) => <li key={`${r.kind}-${r.id}`}><Link className="text-primary" href={r.href} onClick={(e) => { if (capturing) e.preventDefault(); else { clearSearch(); setOpen(false); } }}>{r.title}</Link><p className="muted text-sm">{r.kind}{r.date ? ` / ${r.dateKind === "planned" ? "Planned" : "Deadline"} ${r.date}` : ""}</p></li>)}</ul>
      </div>}
      <section className="section stack"><h2>Capture to Inbox</h2><QuickCapture onSaved={() => setResult(null)} onPendingChange={setCapturing} onOpen={() => { clearSearch(); setOpen(false); }} /></section>
      <nav aria-label="Quick navigation" className="flex flex-wrap gap-4">{[["/", "Today"], ["/projects", "Projects"], ["/calendar", "Calendar"], ["/settings", "Settings"]].map(([href, name]) => <Link className="text-primary" key={href} href={href} onClick={(e) => { if (capturing) e.preventDefault(); else { clearSearch(); setOpen(false); } }}>{name}</Link>)}</nav>
      </div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
