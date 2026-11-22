import { describe, expect, it } from "vitest";
import {
  formatRecurrenceSummary,
  nextOccurrenceDate,
  nextOccurrenceOnOrAfter,
  projectRecurringDates,
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
});
