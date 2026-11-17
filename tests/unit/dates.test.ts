import { describe, expect, it } from "vitest";
import { dateInTimezone, dateOnlySchema, instantToLocal, localToInstant } from "../../src/lib/dates";

describe("calendar date boundaries", () => {
  it("keeps date-only deadlines unshifted and rejects impossible dates", () => {
    expect(dateOnlySchema.parse("2027-01-02")).toBe("2027-01-02");
    expect(() => dateOnlySchema.parse("2027-02-29")).toThrow();
    expect(dateOnlySchema.parse("2028-02-29")).toBe("2028-02-29");
  });
  it("uses the requested zone at midnight and across a Los Angeles DST transition", () => {
    expect(dateInTimezone("2027-01-01T18:00:00Z", "Asia/Jakarta")).toBe("2027-01-02");
    expect(dateInTimezone("2027-01-01T18:00:00Z", "America/Los_Angeles")).toBe("2027-01-01");
    expect(dateInTimezone("2027-03-14T07:59:00Z", "America/Los_Angeles")).toBe("2027-03-13");
    expect(dateInTimezone("2027-03-14T10:01:00Z", "America/Los_Angeles")).toBe("2027-03-14");
  });
  it("converts zoned local inputs, rejecting nonexistent and ambiguous DST wall times", () => {
    expect(localToInstant("2027-03-14T01:30", "America/Los_Angeles")).toBe("2027-03-14T09:30:00Z");
    expect(instantToLocal("2027-03-14T10:30:00Z", "America/Los_Angeles")).toBe("2027-03-14T03:30:00");
    expect(() => localToInstant("2027-03-14T02:30", "America/Los_Angeles")).toThrow();
    expect(() => localToInstant("2027-11-07T01:30", "America/Los_Angeles")).toThrow();
  });
});
