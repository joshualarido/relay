"use client";

import { useState } from "react";
import { formatMinutes } from "@/lib/capacity";

/**
 * Optional per-task duration in minutes. Empty means "use the task type's default",
 * which is shown as the placeholder so the fallback is never a surprise.
 * `commit="blur"` fires once when focus leaves (for auto-saving panels);
 * `commit="change"` fires on every valid edit (for forms that submit on Enter).
 */
export function DurationField({
  id,
  value,
  defaultMinutes,
  onCommit,
  commit = "blur",
  disabled = false,
}: {
  id?: string;
  value: number | null;
  defaultMinutes: number;
  onCommit: (minutes: number | null) => void;
  commit?: "blur" | "change";
  disabled?: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  // Re-sync when the saved value changes from outside (undo, another edit).
  if (value !== lastValue) {
    setLastValue(value);
    setText(value == null ? "" : String(value));
  }

  function parse(raw: string): number | null | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 1 && n <= 1440 ? n : undefined;
  }

  const parsed = parse(text);
  const invalid = parsed === undefined;

  return (
    <div className="duration-field">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={1440}
        step={5}
        value={text}
        placeholder={String(defaultMinutes)}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={id ? `${id}-hint` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (commit !== "change") return;
          const next = parse(e.target.value);
          if (next !== undefined) onCommit(next);
        }}
        onBlur={() => {
          if (commit !== "blur") return;
          if (invalid) {
            setText(value == null ? "" : String(value));
            return;
          }
          if (parsed !== value) onCommit(parsed);
        }}
      />
      <span className="muted text-sm" id={id ? `${id}-hint` : undefined}>
        {invalid
          ? "Enter 1–1440 minutes"
          : parsed == null
            ? `min · type default (${formatMinutes(defaultMinutes)})`
            : `min · ${formatMinutes(parsed)}`}
      </span>
    </div>
  );
}
