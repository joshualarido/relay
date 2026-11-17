"use client";

import type { CompletionPreview } from "@/lib/projects";
import { useConfirmation } from "./confirm-dialog";

export function useProjectCompletion() {
  const { confirm, confirmation } = useConfirmation();
  async function reviewCompletion(id: string, name: string) {
    const response = await fetch(`/api/projects/${id}/completion`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const preview: CompletionPreview = result;
    const unfinished = preview.tasks.filter((t) => t.status !== "Done");
    if (unfinished.length && !await confirm({
      title: "Complete project?", action: "Complete project",
      description: `"${name}" and ${unfinished.length} unfinished ${unfinished.length === 1 ? "task" : "tasks"} will be completed together. You can undo this change in History.`,
      details: <ul className="preview-list">{unfinished.map((t) => <li className="flex-col" key={t.id}>
        <span>{t.title}</span><span className="muted text-sm">{t.status}</span>
        {t.warnings.map((warning) => <span className="error-message text-sm" key={warning}>{warning}</span>)}
      </li>)}</ul>,
    })) return null;
    return preview;
  }
  return { reviewCompletion, confirmation };
}
