"use client";

import { useState } from "react";

/** A single "hours" number (0.5-24). Keeps what you type until it is valid, then reports it. */
export function HoursInput({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: number;
  onChange: (hours: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }
  return (
    <span className="hours-input">
      <input
        type="number"
        inputMode="decimal"
        min={0.5}
        max={24}
        step={0.5}
        aria-label={label}
        value={text}
        disabled={disabled}
        required
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(n) && n >= 0.5 && n <= 24) onChange(n);
        }}
        onBlur={() => setText(String(value))}
      />
      <span className="muted text-sm" aria-hidden="true">hours</span>
    </span>
  );
}
