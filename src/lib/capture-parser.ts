import { Temporal } from "temporal-polyfill";

export type CaptureProjectOption = {
  id: string;
  name: string;
  status?: string;
  archivedAt?: string | null;
};

export type CaptureToken =
  | {
      id: string;
      kind: "project";
      raw: string;
      start: number;
      end: number;
      label: string;
      projectId: string | null;
      query: string;
      matched: boolean;
    }
  | {
      id: string;
      kind: "date";
      raw: string;
      start: number;
      end: number;
      label: string;
      date: string;
    }
  | {
      id: string;
      kind: "timeRange";
      raw: string;
      start: number;
      end: number;
      label: string;
      date: string;
      startTime: string;
      endTime: string;
    }
  | {
      id: string;
      kind: "important";
      raw: string;
      start: number;
      end: number;
      label: "Important";
    };

export type ParsedCapture = {
  title: string;
  projectId: string | null;
  projectName: string | null;
  unknownProjects: string[];
  dueDate: string | null;
  timeRange: { date: string; startTime: string; endTime: string } | null;
  important: boolean;
  impliedKind: "task" | "event";
  tokens: CaptureToken[];
};

const WEEKDAYS: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
};

const chipDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatChipDate(isoDate: string): string {
  return chipDateFormatter.format(new Date(`${isoDate}T12:00:00Z`)).replace(",", "");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Deterministic fuzzy match score (0 = no match, higher = better). */
export function fuzzyScore(rawQuery: string, rawTarget: string): number {
  const query = rawQuery.trim().toLowerCase();
  const target = rawTarget.trim().toLowerCase();
  if (!query || !target) return 0;

  if (target === query) return 1000;

  const qSlug = slugify(query);
  const tSlug = slugify(target);
  if (qSlug && tSlug === qSlug) return 900;

  if (target.startsWith(query)) return 750 - Math.min(target.length - query.length, 100);
  if (qSlug && tSlug.startsWith(qSlug)) return 700 - Math.min(tSlug.length - qSlug.length, 100);

  const words = target.split(/[\s\-_/]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(query))) return 550 - Math.min(target.length, 100);

  const subIndex = target.indexOf(query);
  if (subIndex >= 0) return 400 - Math.min(subIndex * 3 + target.length, 150);

  if (qSlug) {
    const slugSubIndex = tSlug.indexOf(qSlug);
    if (slugSubIndex >= 0) return 350 - Math.min(slugSubIndex * 3 + tSlug.length, 150);
  }

  // Ordered subsequence match (for queries of length >= 2, e.g. "rly" -> "Relay").
  const needle = qSlug || query;
  if (needle.length < 2) return 0;

  let ti = 0;
  let score = 0;
  let consecutive = 0;
  for (let qi = 0; qi < needle.length; qi++) {
    const ch = needle[qi];
    const found = target.indexOf(ch, ti);
    if (found < 0) return 0;
    const isBoundary = found === 0 || /[\s\-_/]/.test(target[found - 1]);
    if (found === ti && qi > 0) {
      consecutive++;
      score += 18 + consecutive * 4;
    } else {
      consecutive = 0;
      score += isBoundary ? 16 : 6;
    }
    ti = found + 1;
  }

  // Penalize overly sparse matches so random letters don't over-match long descriptions.
  const span = ti;
  const densityPenalty = Math.max(0, span - needle.length * 3) * 2;
  return Math.max(10, 100 + score - densityPenalty);
}

export function fuzzyMatchProject(
  query: string,
  projects: CaptureProjectOption[],
): CaptureProjectOption | null {
  let best: { project: CaptureProjectOption; score: number } | null = null;
  for (const project of projects) {
    if (project.archivedAt) continue;
    const base = fuzzyScore(query, project.name);
    if (base <= 0) continue;
    const statusTieBreak = project.status === "Done" ? 0 : 1;
    const total = base * 2 + statusTieBreak;
    if (!best || total > best.score) {
      best = { project, score: total };
    }
  }
  return best?.project ?? null;
}

function parseTimeRangePart(raw: string): { startTime: string; endTime: string } | null {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const sh = Number(match[1]);
  const sm = Number(match[2]);
  const eh = Number(match[3]);
  const em = Number(match[4]);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return null;
  if (eh * 60 + em <= sh * 60 + sm) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { startTime: `${pad(sh)}:${pad(sm)}`, endTime: `${pad(eh)}:${pad(em)}` };
}

function makePlainDate(year: number, month: number, day: number): Temporal.PlainDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  try {
    const d = Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" });
    return d;
  } catch {
    return null;
  }
}

function resolveDatePart(
  raw: string,
  today: Temporal.PlainDate,
  weekStart: number,
): Temporal.PlainDate | null {
  const lower = raw.toLowerCase();
  if (lower === "today" || lower === "tod") return today;
  if (lower === "tomorrow" || lower === "tom" || lower === "tmr") return today.add({ days: 1 });

  if (lower === "next-week" || lower === "nextweek") {
    // weekStart is 0 (Sun) .. 6 (Sat); Temporal dayOfWeek is 1 (Mon) .. 7 (Sun).
    const startDow = weekStart === 0 ? 7 : weekStart;
    const delta = (startDow - today.dayOfWeek + 7) % 7 || 7;
    return today.add({ days: delta });
  }

  if (lower in WEEKDAYS) {
    const targetDow = WEEKDAYS[lower];
    const delta = (targetDow - today.dayOfWeek + 7) % 7;
    return today.add({ days: delta });
  }

  // ISO YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (isoMatch) {
    return makePlainDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // DD/MM/YYYY
  const dmyFull = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (dmyFull) {
    return makePlainDate(Number(dmyFull[3]), Number(dmyFull[2]), Number(dmyFull[1]));
  }

  // DD/MM (current year, or next year if that date is already before today)
  const dmy = /^(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const thisYear = makePlainDate(today.year, month, day);
    if (!thisYear) {
      // Handle 29/02 on a non-leap year by checking up to 4 years ahead
      if (day === 29 && month === 2) {
        for (let offset = 1; offset <= 4; offset++) {
          const leap = makePlainDate(today.year + offset, 2, 29);
          if (leap) return leap;
        }
      }
      return null;
    }
    if (Temporal.PlainDate.compare(thisYear, today) < 0) {
      return makePlainDate(today.year + 1, month, day) ?? thisYear;
    }
    return thisYear;
  }

  return null;
}

/** Parse one capture line into structured tokens and a clean title. Pure, deterministic, no AI. */
export function parseCaptureInput(
  input: string,
  options: {
    projects: CaptureProjectOption[];
    timezone: string;
    weekStart?: number;
    now?: string;
  },
): ParsedCapture {
  const nowIso = options.now ?? new Date().toISOString();
  const today = Temporal.Instant.from(nowIso).toZonedDateTimeISO(options.timezone).toPlainDate();
  const weekStart = options.weekStart ?? 1;

  const tokens: CaptureToken[] = [];
  const unknownProjects: string[] = [];
  let projectId: string | null = null;
  let projectName: string | null = null;
  let dueDate: string | null = null;
  let timeRange: { date: string; startTime: string; endTime: string } | null = null;
  let important = false;

  // Scan whitespace-delimited words with exact start/end offsets.
  const words: { text: string; start: number; end: number }[] = [];
  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(input)) !== null) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // 1. Important marker: standalone "!"
    if (w.text === "!") {
      important = true;
      tokens.push({
        id: `important-${w.start}`,
        kind: "important",
        raw: w.text,
        start: w.start,
        end: w.end,
        label: "Important",
      });
      continue;
    }

    // 2. Project token: #project
    if (w.text.startsWith("#") && w.text.length > 1) {
      const query = w.text.slice(1);
      if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(query)) {
        const matched = fuzzyMatchProject(query, options.projects);
        if (matched) {
          projectId = matched.id;
          projectName = matched.name;
          tokens.push({
            id: `project-${w.start}`,
            kind: "project",
            raw: w.text,
            start: w.start,
            end: w.end,
            label: matched.name,
            projectId: matched.id,
            query,
            matched: true,
          });
        } else {
          unknownProjects.push(query);
          tokens.push({
            id: `project-${w.start}`,
            kind: "project",
            raw: w.text,
            start: w.start,
            end: w.end,
            label: `#${query}`,
            projectId: null,
            query,
            matched: false,
          });
        }
        continue;
      }
    }

    // 3. Date or date + time range: @tomorrow, @fri, @17/12, @fri 14:00-15:00, @14:00-15:00
    if (w.text.startsWith("@") && w.text.length > 1) {
      const part = w.text.slice(1);

      // Direct time range on today: @14:00-15:00
      const directRange = parseTimeRangePart(part);
      if (directRange) {
        const dateStr = today.toString();
        timeRange = { date: dateStr, ...directRange };
        tokens.push({
          id: `timeRange-${w.start}`,
          kind: "timeRange",
          raw: w.text,
          start: w.start,
          end: w.end,
          label: `${formatChipDate(dateStr)} · ${directRange.startTime}–${directRange.endTime}`,
          date: dateStr,
          startTime: directRange.startTime,
          endTime: directRange.endTime,
        });
        continue;
      }

      const resolved = resolveDatePart(part, today, weekStart);
      if (resolved) {
        const dateStr = resolved.toString();
        const nextWord = words[i + 1];
        const nextRange = nextWord ? parseTimeRangePart(nextWord.text) : null;
        if (nextWord && nextRange) {
          const raw = input.slice(w.start, nextWord.end);
          timeRange = { date: dateStr, ...nextRange };
          tokens.push({
            id: `timeRange-${w.start}`,
            kind: "timeRange",
            raw,
            start: w.start,
            end: nextWord.end,
            label: `${formatChipDate(dateStr)} · ${nextRange.startTime}–${nextRange.endTime}`,
            date: dateStr,
            startTime: nextRange.startTime,
            endTime: nextRange.endTime,
          });
          i++; // consume the following HH:MM-HH:MM word
        } else {
          dueDate = dateStr;
          tokens.push({
            id: `date-${w.start}`,
            kind: "date",
            raw: w.text,
            start: w.start,
            end: w.end,
            label: formatChipDate(dateStr),
            date: dateStr,
          });
        }
        continue;
      }
    }
  }

  let title: string;
  if (tokens.length === 0) {
    // Plain text: preserve literal title verbatim (trimmed at edges only).
    title = input.trim();
  } else {
    let cursor = 0;
    const pieces: string[] = [];
    for (const token of tokens) {
      pieces.push(input.slice(cursor, token.start));
      cursor = token.end;
    }
    pieces.push(input.slice(cursor));
    title = pieces.join(" ").replace(/\s+/g, " ").trim();
  }

  return {
    title,
    projectId,
    projectName,
    unknownProjects,
    dueDate,
    timeRange,
    important,
    impliedKind: timeRange ? "event" : "task",
    tokens,
  };
}

/** Remove one parsed token's exact slice from the capture input string. */
export function removeTokenFromInput(
  input: string,
  token: Pick<CaptureToken, "start" | "end">,
): string {
  const before = input.slice(0, token.start);
  const after = input.slice(token.end);
  if (!before.trim()) return after.replace(/^\s+/, "");
  if (!after.trim()) return before.replace(/\s+$/, "");
  return `${before.replace(/\s+$/, "")} ${after.replace(/^\s+/, "")}`;
}

/** Convert a parsed date + HH:MM-HH:MM range in `timezone` into DST-safe UTC ISO instants. */
export function buildEventRangeFromToken(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
): { start: string; end: string } {
  const start = Temporal.PlainDateTime.from(`${date}T${startTime}`)
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant()
    .toString();
  const end = Temporal.PlainDateTime.from(`${date}T${endTime}`)
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant()
    .toString();
  return { start, end };
}
