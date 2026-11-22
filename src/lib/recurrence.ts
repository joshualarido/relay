import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { dateOnlySchema } from "./dates";

export const recurrenceFrequencies = ["daily", "weekdays", "weekly", "monthly", "custom"] as const;
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

export const recurrenceRuleSchema = z.object({
  frequency: z.enum(recurrenceFrequencies),
  interval: z.number().int().min(1).max(365).default(1),
  /** 0 = Sunday .. 6 = Saturday (used when frequency === "weekly"). */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  /** 1..31 (used when frequency === "monthly"; clamped to month length). */
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  /** Used when frequency === "custom". */
  unit: z.enum(["days", "weeks"]).optional(),
  endDate: dateOnlySchema.nullable().optional(),
}).strict();

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

/** Temporal.PlainDate.dayOfWeek is 1=Mon..7=Sun; convert to JS 0=Sun..6=Sat. */
export function jsWeekday(date: Temporal.PlainDate): number {
  return date.dayOfWeek % 7;
}

function exceedsEndDate(date: Temporal.PlainDate, rule: RecurrenceRule): boolean {
  return Boolean(rule.endDate && date.toString() > rule.endDate);
}

/**
 * Returns the strictly next occurrence date (> afterDate) for a recurrence rule,
 * or null if the rule's endDate has been exceeded.
 */
export function nextOccurrenceDate(rule: RecurrenceRule, afterDate: string): string | null {
  const base = Temporal.PlainDate.from(afterDate);
  const interval = Math.max(1, rule.interval || 1);
  let next: Temporal.PlainDate;

  switch (rule.frequency) {
    case "daily": {
      next = base.add({ days: interval });
      break;
    }
    case "weekdays": {
      let candidate = base.add({ days: 1 });
      while (candidate.dayOfWeek === 6 || candidate.dayOfWeek === 7) {
        candidate = candidate.add({ days: 1 });
      }
      next = candidate;
      break;
    }
    case "weekly": {
      const days = rule.weekdays && rule.weekdays.length > 0
        ? [...new Set(rule.weekdays)].sort((a, b) => a - b)
        : [jsWeekday(base)];
      const baseDow = jsWeekday(base);
      const laterSameWeek = days.find((d) => d > baseDow);
      if (laterSameWeek !== undefined) {
        next = base.add({ days: laterSameWeek - baseDow });
      } else {
        const firstDay = days[0];
        const daysToNextWeekStart = 7 - baseDow;
        next = base.add({ days: daysToNextWeekStart + (interval - 1) * 7 + firstDay });
      }
      break;
    }
    case "monthly": {
      const targetDay = rule.dayOfMonth ?? base.day;
      const moved = base.add({ months: interval });
      const clamped = Math.min(targetDay, moved.daysInMonth);
      next = Temporal.PlainDate.from({ year: moved.year, month: moved.month, day: clamped });
      break;
    }
    case "custom": {
      const unit = rule.unit ?? "days";
      next = unit === "weeks" ? base.add({ weeks: interval }) : base.add({ days: interval });
      break;
    }
  }

  return exceedsEndDate(next, rule) ? null : next.toString();
}

/**
 * Auto-advances a missed recurring date (`anchorDate < targetDate`) to the
 * earliest rule occurrence on or after `targetDate`, or null if past `endDate`.
 */
export function nextOccurrenceOnOrAfter(
  rule: RecurrenceRule,
  anchorDate: string,
  targetDate: string,
): string | null {
  if (anchorDate >= targetDate) {
    return rule.endDate && anchorDate > rule.endDate ? null : anchorDate;
  }
  let cursor: string | null = anchorDate;
  let guard = 0;
  while (cursor && cursor < targetDate && guard < 2000) {
    cursor = nextOccurrenceDate(rule, cursor);
    guard++;
  }
  return cursor && cursor >= targetDate ? cursor : null;
}

/**
 * Projects upcoming virtual occurrence dates strictly after `afterDate`
 * that fall within `[rangeStart, rangeEnd]` (inclusive).
 */
export function projectRecurringDates(
  rule: RecurrenceRule,
  afterDate: string,
  rangeStart: string,
  rangeEnd: string,
  maxCount = 60,
): string[] {
  const results: string[] = [];
  let cursor = afterDate;
  let guard = 0;
  while (results.length < maxCount && guard < 500) {
    const next = nextOccurrenceDate(rule, cursor);
    if (!next || next > rangeEnd) break;
    if (next >= rangeStart) results.push(next);
    cursor = next;
    guard++;
  }
  return results;
}

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatRecurrenceSummary(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return "";
  switch (rule.frequency) {
    case "daily":
      return rule.interval > 1 ? `Every ${rule.interval} days` : "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekly": {
      const days = rule.weekdays && rule.weekdays.length > 0
        ? [...new Set(rule.weekdays)].sort((a, b) => a - b).map((d) => SHORT_WEEKDAYS[d]).join(", ")
        : "";
      const prefix = rule.interval > 1 ? `Every ${rule.interval}w` : "Weekly";
      return days ? `${prefix} · ${days}` : prefix;
    }
    case "monthly":
      return rule.interval > 1 ? `Every ${rule.interval} months` : "Monthly";
    case "custom": {
      const unit = rule.unit === "weeks" ? (rule.interval === 1 ? "week" : "weeks") : (rule.interval === 1 ? "day" : "days");
      return `Every ${rule.interval} ${unit}`;
    }
  }
}
