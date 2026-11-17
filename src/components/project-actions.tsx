"use client";

import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/db/schema";
import type { DeletionPreview } from "@/lib/lifecycle";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";

export function ProjectActions({ project }: { project: Project }) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const deleteMutationId = useRef<string | null>(null);
  const router = useRouter();
  async function archive() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: project.revision, archived: !project.archivedAt, mutationId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      notifyMutation(response, () => router.refresh()); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not connect. Try again."); }
    finally { setPending(false); }
  }
  return <div className="stack">
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" disabled={pending} onClick={archive}>{project.archivedAt ? "Unarchive project" : "Archive project"}</Button>
      <Button variant="destructive" disabled={pending} onClick={async () => {
        setPending(true); setError("");
        try {
          const response = await fetch(`/api/projects/${project.id}/deletion`);
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          deleteMutationId.current = crypto.randomUUID();
          setPreview(result);
        } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load deletion preview."); }
        finally { setPending(false); }
      }}>Delete project</Button>
    </div>
    {error && !preview && <p role="alert" className="error-message">{error}</p>}
    <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => { if (!open && !pending) { setPreview(null); setError(""); } }}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="form-dialog">
        <Dialog.Title className="text-xl font-semibold">Delete project?</Dialog.Title>
        <Dialog.Description className="muted mt-3">These records will be soft-deleted together, not permanently removed. New changes invalidate this preview.</Dialog.Description>
        <ul className="preview-list">{preview?.records.map((record) => <li key={`${record.entityType}-${record.id}`}><span>{record.label}</span><span className="muted">{record.entityType}</span></li>)}</ul>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="form-actions"><Button variant="outline" disabled={pending} onClick={() => setPreview(null)}>Cancel</Button>
          <Button variant="destructive" disabled={pending} onClick={async () => {
            setPending(true); setError("");
            try {
              const response = await fetch(`/api/projects/${project.id}/deletion`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...preview, mutationId: deleteMutationId.current }),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setPreview(null); router.push("/projects"); notifyMutation(response, () => router.refresh()); router.refresh();
            } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not connect. Retry with the same preview."); }
            finally { setPending(false); }
          }}>{pending ? "Deleting..." : "Confirm soft deletion"}</Button>
        </div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}
