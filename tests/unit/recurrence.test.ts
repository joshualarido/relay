import { describe, expect, it } from "vitest";
import {
  expandEventOccurrences,
  formatRecurrenceSummary,
  nextOccurrenceDate,
  nextOccurrenceOnOrAfter,
  occurrenceRangeForDate,
  projectRecurringDates,
  shiftEventSeriesRange,
} from "@/lib/recurrence";

describe("recurrence rules", () => {
  it("computes daily, weekdays, weekly, monthly, and custom intervals", () => {
    expect(nextOccurrenceDate({ frequency: "daily", interval: 1 }, "2026-11-22")).toBe("2026-11-23");
    // 2026-11-20 is Friday -> next weekday is Monday 2026-11-23
    expect(nextOccurrenceDate({ frequency: "weekdays", interval: 1 }, "2026-11-20")).toBe("2026-11-23");
    // Weekly on Mon(1) & Thu(4) from Mon 2026-11-23 -> Thu 2026-11-26
    expect(nextOccurrenceDate({ frequency: "weekly", interval: 1, weekdays: [1, 4] }, "2026-11-23")).toBe("2026-11-26");
    // Monthly clamping: Jan 31 -> Feb 28
    expect(nextOccurrenceDate({ frequency: "monthly", interval: 1, dayOfMonth: 31 }, "2026-01-31")).toBe("2026-02-28");
    // Custom every 2 weeks
    expect(nextOccurrenceDate({ frequency: "custom", interval: 2, unit: "weeks" }, "2026-11-22")).toBe("2026-12-06");
  });

  it("auto-advances missed occurrences to on or after targetDate and respects endDate", () => {
    expect(nextOccurrenceOnOrAfter({ frequency: "daily", interval: 1 }, "2026-11-15", "2026-11-22")).toBe("2026-11-22");
    expect(
      nextOccurrenceOnOrAfter({ frequency: "daily", interval: 1, endDate: "2026-11-20" }, "2026-11-15", "2026-11-22"),
    ).toBeNull();
  });

  it("projects upcoming virtual occurrences within a calendar range", () => {
    const projected = projectRecurringDates(
      { frequency: "weekly", interval: 1, weekdays: [1, 3] },
      "2026-11-23",
      "2026-11-23",
      "2026-12-04",
    );
    expect(projected).toEqual(["2026-11-25", "2026-11-30", "2026-12-02"]);
    expect(formatRecurrenceSummary({ frequency: "weekly", interval: 1, weekdays: [1, 3] })).toBe("Weekly · Mon, Wed");
  });

  it("expands recurring events across ranges, honors exceptions and endDate, and preserves local time across DST", () => {
    const allDaySeries = {
      start: "2027-02-10",
      end: "2027-02-11",
      allDay: true,
      timezone: "Asia/Jakarta",
      recurrenceRule: { frequency: "daily" as const, interval: 1, endDate: "2027-02-13" },
      recurrenceExceptions: ["2027-02-12"],
    };
    const expanded = expandEventOccurrences(allDaySeries, "2027-02-10", "2027-02-20", "Asia/Jakarta");
    expect(expanded.map((o) => ({ d: o.occurrenceDate, start: o.start, end: o.end, recurring: o.recurring, virtual: o.virtual }))).toEqual([
      { d: "2027-02-10", start: "2027-02-10", end: "2027-02-11", recurring: true, virtual: false },
      { d: "2027-02-11", start: "2027-02-11", end: "2027-02-12", recurring: true, virtual: true },
      { d: "2027-02-13", start: "2027-02-13", end: "2027-02-14", recurring: true, virtual: true },
    ]);

    // DST spring forward in America/Los_Angeles on 2027-03-14: 09:00 local stays 09:00 local (17:00Z -> 16:00Z)
    const timedSeries = {
      start: "2027-03-13T17:00:00.000Z",
      end: "2027-03-13T18:00:00.000Z",
      allDay: false,
      timezone: "America/Los_Angeles",
      recurrenceRule: { frequency: "daily" as const, interval: 1 },
      recurrenceExceptions: null,
    };
    expect(occurrenceRangeForDate(timedSeries, "2027-03-15", "America/Los_Angeles")).toEqual({
      start: "2027-03-15T16:00:00.000Z",
      end: "2027-03-15T17:00:00.000Z",
    });

    // Editing a later occurrence for the whole series shifts the anchor time cleanly
    const shifted = shiftEventSeriesRange(timedSeries, "2027-03-15", {
      start: "2027-03-15T18:00:00.000Z",
      end: "2027-03-15T19:30:00.000Z",
      allDay: false,
      timezone: "America/Los_Angeles",
    });
    expect(shifted).toEqual({
      start: "2027-03-13T19:00:00.000Z",
      end: "2027-03-13T20:30:00.000Z",
    });
  });

  it("can exclude even the anchor occurrence when deleted individually", () => {
    const series = {
      start: "2027-02-10",
      end: "2027-02-11",
      allDay: true,
      timezone: "UTC",
      recurrenceRule: { frequency: "daily" as const, interval: 1, endDate: "2027-02-12" },
      recurrenceExceptions: ["2027-02-10"],
    };
    const expanded = expandEventOccurrences(series, "2027-02-10", "2027-02-15", "UTC");
    expect(expanded.map((o) => o.occurrenceDate)).toEqual(["2027-02-11", "2027-02-12"]);
  });
});
