"use client";

import { useState, type ReactNode } from "react";

/**
 * Click-to-edit text. Enter (or blur) saves, Escape cancels. Multiline uses Ctrl/Cmd+Enter to save.
 * The value is saved literally; only an empty required value is refused.
 */
export function InlineText({ value, label, onSave, multiline = false, required = false, placeholder, className, display }: {
  value: string; label: string; onSave: (next: string) => Promise<boolean> | void; multiline?: boolean; required?: boolean;
  placeholder?: string; className?: string; display?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  function start() { setDraft(value); setEditing(true); }
  async function commit() {
    setEditing(false);
    if (draft === value || (required && !draft.trim())) return;
    await onSave(draft);
  }
  if (!editing) return <button type="button" className={`inline-text ${className ?? ""}${value ? "" : " is-empty"}`} title={`Edit ${label}`} onClick={start}>
    {display ?? (value || placeholder)}
  </button>;
  const props = {
    "aria-label": label, value: draft, autoFocus: true, className: `inline-input ${className ?? ""}`,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value), onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); }
      else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); void commit(); }
    },
  };
  return multiline ? <textarea {...props} rows={3} maxLength={20000} /> : <input {...props} maxLength={500} />;
}
