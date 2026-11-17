import { z } from "zod";
import { Temporal } from "temporal-polyfill";

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine((date) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, "Choose a valid calendar date.");

export function dateInTimezone(instant: string, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function localToInstant(local: string, timezone: string) {
  return Temporal.PlainDateTime.from(local).toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString();
}

export function instantToLocal(instant: string, timezone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDateTime().toString();
}
