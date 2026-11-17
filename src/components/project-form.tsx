"use client";

import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";
import { useProjectCompletion } from "./project-completion";

const statuses = ["Planned", "Active", "Paused", "Done"];

export function ProjectForm({ project, initialOpen = false, initialTitle = "", onClose }: { project?: Project; initialOpen?: boolean; initialTitle?: string; onClose?: () => void }) {
  const [open, setOpenState] = useState(initialOpen);
  function setOpen(value: boolean) { setOpenState(value); if (!value) onClose?.(); }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState(project?.status ?? "Planned");
  const mutationId = useRef<string | null>(null);
  const lastPayload = useRef("");
  const router = useRouter();
  const prefix = project?.id ?? "new";
  const { reviewCompletion, confirmation } = useProjectCompletion();
  return <><Dialog.Root open={open} onOpenChange={(value) => {
    if (pending) return;
    setOpen(value);
    if (value) setStatus(project?.status ?? "Planned");
    else { setError(""); setFields({}); mutationId.current = null; lastPayload.current = ""; }
  }}>
    {!initialOpen && <Dialog.Trigger asChild><Button variant={project ? "outline" : "default"}>{project ? "Edit project" : "New project"}</Button></Dialog.Trigger>}
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="form-dialog" onInteractOutside={(e) => { if (pending) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }}>
        <Dialog.Title className="text-xl font-semibold">{project ? "Edit project" : "New project"}</Dialog.Title>
        <Dialog.Description className="muted mt-2 mb-6">A name is enough to get started. Add the rest when it helps.</Dialog.Description>
        <Dialog.Close asChild><Button variant="ghost" className="dialog-close" aria-label="Close project form" disabled={pending}><X size={20} /></Button></Dialog.Close>
        <form className="stack" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const input = { name: form.get("name"), description: form.get("description"), status: form.get("status"), deadline: form.get("deadline") || null,
            ...(project ? { expectedRevision: project.revision } : {}) };
          setPending(true); setError(""); setFields({});
          try {
            const completionPreview = project && status === "Done" && project.status !== "Done" ? await reviewCompletion(project.id, project.name) : undefined;
            if (completionPreview === null) return;
            const payload = JSON.stringify({ ...input, completionPreview });
            if (lastPayload.current !== payload) { mutationId.current = crypto.randomUUID(); lastPayload.current = payload; }
            const response = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", {
              method: project ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...input, completionPreview, mutationId: mutationId.current }),
            });
            const result = await response.json();
            if (!response.ok) { setFields(result.fields || {}); throw new Error(result.error); }
            setOpen(false); mutationId.current = null; lastPayload.current = ""; notifyMutation(response, () => router.refresh()); router.refresh();
          } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not connect. Your input is preserved."); }
          finally { setPending(false); }
        }}>
<fieldset disabled={pending} className="contents">
          <div className="field"><label htmlFor={`${prefix}-name`}>Project name</label>
             <input id={`${prefix}-name`} name="name" defaultValue={project?.name ?? initialTitle} required maxLength={200}
              aria-invalid={Boolean(fields.name)} aria-describedby={fields.name ? `${prefix}-name-error` : undefined} />
            {fields.name && <p className="error-message" id={`${prefix}-name-error`}>{fields.name.join(" ")}</p>}
          </div>
          <div className="field"><label htmlFor={`${prefix}-description`}>Description</label><textarea id={`${prefix}-description`} name="description" rows={3} maxLength={20000} defaultValue={project?.description} /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor={`${prefix}-status`}>Status</label><select id={`${prefix}-status`} name="status" value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
            <div className="field"><label htmlFor={`${prefix}-deadline`}>Deadline</label><input id={`${prefix}-deadline`} type="date" name="deadline" defaultValue={project?.deadline || ""} aria-invalid={Boolean(fields.deadline)} /></div>
          </div>
          {error && <p role="alert" className="error-message">{error}</p>}
          <div className="form-actions"><Dialog.Close asChild><Button variant="outline" type="button" disabled={pending}>Cancel</Button></Dialog.Close><Button type="submit" disabled={pending}>{pending ? "Saving..." : project ? "Save project" : "Create project"}</Button></div>
        </fieldset>
</form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>{confirmation}</>;
}
