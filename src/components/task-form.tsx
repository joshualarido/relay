"use client";

import { useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";
import { Button } from "./ui/button";
import { notifyMutation } from "./mutation-notice";

const statuses = ["To do", "Done"];

export function TaskForm({ task, projects, projectId = null, initialOpen = false, onClose }: { task?: Task; projects: Project[]; projectId?: string | null; initialOpen?: boolean; onClose?: () => void }) {
  const [open, setOpenState] = useState(initialOpen);
  function setOpen(value: boolean) { setOpenState(value); if (!value) onClose?.(); }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const identity = useRef({ payload: "", id: "" });
  const prefix = useId();
  const router = useRouter();
  function field(name: string) {
    return { id: `${prefix}-${name}`, name, "aria-invalid": Boolean(fields[name]), "aria-describedby": fields[name] ? `${prefix}-${name}-error` : undefined };
  }
  function errors(name: string) {
    return fields[name] && <p className="error-message" id={`${prefix}-${name}-error`}>{fields[name].join(" ")}</p>;
  }
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); setError(""); setFields({}); identity.current = { payload: "", id: "" }; } }}>
    {!initialOpen && <Dialog.Trigger asChild><Button variant={task ? "outline" : "default"}>{task ? "Edit task" : "Add task"}</Button></Dialog.Trigger>}
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="form-dialog"
      onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }} onInteractOutside={(e) => { if (pending) e.preventDefault(); }}>
      <Dialog.Title className="text-xl font-semibold">{task ? "Edit task" : "Add task"}</Dialog.Title>
      <Dialog.Description className="muted mt-2 mb-6">Your words, saved as one task.</Dialog.Description>
      <Dialog.Close asChild><Button variant="ghost" className="dialog-close" aria-label="Close task form" disabled={pending}><X size={20} /></Button></Dialog.Close>
      <form className="stack" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const input = {
          title: form.get("title"), description: form.get("description"), projectId: form.get("projectId") || null,
          status: form.get("status"),
          important: form.get("important") === "" ? null : form.get("important") === "true",
          dueDate: form.get("dueDate") || null,
          dueAt: form.get("dueAt") || null, timezone: form.get("dueAt") ? form.get("timezone") : null,
          ...(task ? { expectedRevision: task.revision } : {}),
        };
        const payload = JSON.stringify(input);
        if (identity.current.payload !== payload) identity.current = { payload, id: crypto.randomUUID() };
        setPending(true); setError(""); setFields({});
        try {
          const response = await fetch(task ? `/api/tasks/${task.id}` : "/api/tasks", {
            method: task ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, mutationId: identity.current.id }),
          });
          const result = await response.json();
          if (!response.ok) { setFields(result.fields || {}); throw new Error(result.error); }
          setOpen(false); identity.current = { payload: "", id: "" }; notifyMutation(response, () => router.refresh()); router.refresh();
        } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not connect. Your input is preserved."); }
        finally { setPending(false); }
      }}>
<fieldset disabled={pending} className="contents">
        <div className="field"><label htmlFor={`${prefix}-title`}>Task title</label><input {...field("title")} defaultValue={task?.title} required maxLength={500} />{errors("title")}</div>
        <div className="field"><label htmlFor={`${prefix}-description`}>Task description</label><textarea {...field("description")} defaultValue={task?.description} rows={3} maxLength={20000} />{errors("description")}</div>
        <div className="field"><label htmlFor={`${prefix}-projectId`}>Project</label><select {...field("projectId")} defaultValue={task?.projectId ?? projectId ?? ""}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.archivedAt ? " (archived)" : ""}</option>)}</select>{errors("projectId")}</div>
        <div className="form-grid">
          <div className="field"><label htmlFor={`${prefix}-status`}>Task status</label><select {...field("status")} defaultValue={task?.status ?? "To do"}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>{errors("status")}</div>
          <div className="field"><label htmlFor={`${prefix}-important`}>Important</label>
            <select {...field("important")} defaultValue={task?.important == null ? "" : String(task.important)}><option value="">Unset</option><option value="true">Yes</option><option value="false">No</option></select>{errors("important")}</div>
        </div>
        <div className="field"><label htmlFor={`${prefix}-dueDate`}>Due date</label><input {...field("dueDate")} type="date" defaultValue={task?.dueDate ?? ""} />{errors("dueDate")}</div>
        {/* ponytail: explicit ISO offsets avoid ambiguous local times; use a zoned picker when shared calendar inputs exist. */}
        <details open={Boolean(task?.dueAt)}><summary className="muted cursor-pointer">Use a timed deadline instead</summary>
          <div className="stack mt-4">
            <p className="muted text-sm">Clear the date above. Include an explicit offset, for example 2027-02-10T16:00:00+07:00.</p>
            <div className="field"><label htmlFor={`${prefix}-dueAt`}>Timed deadline (ISO 8601)</label><input {...field("dueAt")} defaultValue={task?.dueAt ?? ""} placeholder="2027-02-10T16:00:00+07:00" />{errors("dueAt")}</div>
            <div className="field"><label htmlFor={`${prefix}-timezone`}>Deadline timezone</label><input {...field("timezone")} defaultValue={task?.timezone ?? "Asia/Jakarta"} />{errors("timezone")}</div>
          </div>
        </details>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="form-actions"><Dialog.Close asChild><Button variant="outline" type="button" disabled={pending}>Cancel</Button></Dialog.Close><Button type="submit" disabled={pending}>{pending ? "Saving..." : task ? "Save task" : "Create task"}</Button></div>
      </fieldset>
</form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
