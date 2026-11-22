"use client";

import type { RecurrenceFrequency, RecurrenceRule } from "@/lib/recurrence";

const WEEKDAYS = [
  { value: 1, label: "M", name: "Monday" },
  { value: 2, label: "T", name: "Tuesday" },
  { value: 3, label: "W", name: "Wednesday" },
  { value: 4, label: "T", name: "Thursday" },
  { value: 5, label: "F", name: "Friday" },
  { value: 6, label: "S", name: "Saturday" },
  { value: 0, label: "S", name: "Sunday" },
] as const;

const FREQUENCIES: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

export function RecurrencePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  function setFrequency(next: RecurrenceFrequency | "none") {
    if (next === "none") {
      onChange(null);
    } else if (next === "weekly") {
      onChange({ frequency: next, interval: 1, weekdays: value?.weekdays?.length ? value.weekdays : [1, 3, 5], endDate: value?.endDate ?? null });
    } else if (next === "custom") {
      onChange({ frequency: next, interval: value?.interval ?? 2, unit: value?.unit ?? "days", endDate: value?.endDate ?? null });
    } else {
      onChange({ frequency: next, interval: 1, endDate: value?.endDate ?? null });
    }
  }

  function toggleWeekday(day: number) {
    if (!value) return;
    const current = new Set(value.weekdays ?? []);
    if (current.has(day)) {
      if (current.size > 1) current.delete(day);
    } else {
      current.add(day);
    }
    onChange({ ...value, weekdays: [...current].sort((a, b) => a - b) });
  }

  return (
    <div className={`recurrence-picker${compact ? " is-compact" : ""}`}>
      <select
        aria-label="Recurrence frequency"
        value={value?.frequency ?? "none"}
        disabled={disabled}
        onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency | "none")}
      >
        <option value="none">Doesn&apos;t repeat</option>
        {FREQUENCIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {value && (
        <div className="recurrence-controls">
          {value.frequency === "weekly" && (
            <div className="recurrence-weekdays" role="group" aria-label="Repeat on weekdays">
              {WEEKDAYS.map((d) => {
                const active = value.weekdays?.includes(d.value) ?? false;
                return (
                  <button
                    key={d.value}
                    type="button"
                    className={`weekday-chip${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    aria-label={d.name}
                    disabled={disabled}
                    onClick={() => toggleWeekday(d.value)}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          )}

          {value.frequency === "custom" && (
            <div className="recurrence-custom">
              <span className="muted text-sm">Every</span>
              <input
                type="number"
                min={1}
                max={365}
                aria-label="Repeat interval"
                value={value.interval}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...value, interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })
                }
              />
              <select
                aria-label="Repeat unit"
                value={value.unit ?? "days"}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, unit: e.target.value as "days" | "weeks" })}
              >
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
            </div>
          )}

          <label className="recurrence-end">
            <span className="muted text-sm">Until</span>
            <input
              type="date"
              aria-label="Repeat end date (optional)"
              value={value.endDate ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, endDate: e.target.value || null })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
