import { describe, expect, it } from "vitest";
import {
  buildEventRangeFromToken,
  fuzzyMatchProject,
  fuzzyScore,
  parseCaptureInput,
  removeTokenFromInput,
} from "@/lib/capture-parser";
import { searchPalette } from "@/lib/palette-search";

const projects = [
  { id: "p-relay", name: "Relay", status: "Active", archivedAt: null },
  { id: "p-home", name: "Home Renovation", status: "Planned", archivedAt: null },
  { id: "p-arch", name: "Relay Legacy", status: "Done", archivedAt: "2026-01-01T00:00:00Z" },
];

// Wednesday, 2026-11-18 10:00 in Asia/Jakarta (+07:00) = 2026-11-18T03:00:00Z
const WED_NOW = "2026-11-18T03:00:00Z";

describe("capture-parser", () => {
  it("parses acceptance #2: 'Fix login bug #relay @fri'", () => {
    const parsed = parseCaptureInput("Fix login bug #relay @fri", {
      projects,
      timezone: "Asia/Jakarta",
      weekStart: 1,
      now: WED_NOW,
    });
    expect(parsed.title).toBe("Fix login bug");
    expect(parsed.projectId).toBe("p-relay");
    expect(parsed.projectName).toBe("Relay");
    expect(parsed.dueDate).toBe("2026-11-20");
    expect(parsed.important).toBe(false);
    expect(parsed.timeRange).toBeNull();
    expect(parsed.impliedKind).toBe("task");
    expect(parsed.unknownProjects).toEqual([]);
    expect(parsed.tokens).toHaveLength(2);
  });

  it("preserves plain text literally with no tokens", () => {
    const parsed = parseCaptureInput("Buy milk & bread!", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(parsed.title).toBe("Buy milk & bread!");
    expect(parsed.projectId).toBeNull();
    expect(parsed.dueDate).toBeNull();
    expect(parsed.important).toBe(false);
    expect(parsed.impliedKind).toBe("task");
    expect(parsed.tokens).toEqual([]);
  });

  it("parses standalone ! as important without eating word punctuation", () => {
    const parsed = parseCaptureInput("Ship release ! #relay", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(parsed.title).toBe("Ship release");
    expect(parsed.important).toBe(true);
    expect(parsed.projectId).toBe("p-relay");
    expect(parsed.tokens.map((t) => t.kind)).toEqual(["important", "project"]);
  });

  it("parses @fri 14:00-15:00 as a scheduled event time range", () => {
    const parsed = parseCaptureInput("Design review @fri 14:00-15:00 #relay", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(parsed.title).toBe("Design review");
    expect(parsed.impliedKind).toBe("event");
    expect(parsed.timeRange).toEqual({
      date: "2026-11-20",
      startTime: "14:00",
      endTime: "15:00",
    });
    expect(parsed.projectId).toBe("p-relay");
    const utc = buildEventRangeFromToken("2026-11-20", "14:00", "15:00", "Asia/Jakarta");
    expect(utc).toEqual({
      start: "2026-11-20T07:00:00Z",
      end: "2026-11-20T08:00:00Z",
    });
  });

  it("supports @tomorrow, @today, @17/12, @YYYY-MM-DD and timezone-relative dates", () => {
    // 2026-11-18T22:00:00Z is Thu 2026-11-19 in Asia/Jakarta (+07), Wed 2026-11-18 in America/Los_Angeles (-08)
    const boundary = "2026-11-18T22:00:00Z";
    const jakarta = parseCaptureInput("Standup @tomorrow", {
      projects,
      timezone: "Asia/Jakarta",
      now: boundary,
    });
    const la = parseCaptureInput("Standup @tomorrow", {
      projects,
      timezone: "America/Los_Angeles",
      now: boundary,
    });
    expect(jakarta.dueDate).toBe("2026-11-20");
    expect(la.dueDate).toBe("2026-11-19");

    const dec = parseCaptureInput("Year end @17/12", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(dec.dueDate).toBe("2026-12-17");

    // Past DD/MM rolls to next year
    const rolled = parseCaptureInput("Taxes @10/01", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(rolled.dueDate).toBe("2027-01-10");

    // Invalid calendar date stays literal text
    const badDate = parseCaptureInput("Check @31/02", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(badDate.dueDate).toBeNull();
    expect(badDate.title).toBe("Check @31/02");
  });

  it("respects weekStart for @next-week", () => {
    // Wed 2026-11-18 -> next Monday is 2026-11-23, next Sunday is 2026-11-22
    const monStart = parseCaptureInput("Plan sprint @next-week", {
      projects,
      timezone: "Asia/Jakarta",
      weekStart: 1,
      now: WED_NOW,
    });
    const sunStart = parseCaptureInput("Plan sprint @next-week", {
      projects,
      timezone: "Asia/Jakarta",
      weekStart: 0,
      now: WED_NOW,
    });
    expect(monStart.dueDate).toBe("2026-11-23");
    expect(sunStart.dueDate).toBe("2026-11-22");
  });

  it("fuzzy-matches #project, excludes archived, and hints without blocking on unknown #project", () => {
    expect(fuzzyMatchProject("rly", projects)?.id).toBe("p-relay");
    expect(fuzzyMatchProject("home-renovation", projects)?.id).toBe("p-home");
    expect(fuzzyMatchProject("legacy", projects)).toBeNull();

    const unknown = parseCaptureInput("Loose note #nonexistent @tomorrow", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(unknown.title).toBe("Loose note");
    expect(unknown.projectId).toBeNull();
    expect(unknown.unknownProjects).toEqual(["nonexistent"]);
    expect(unknown.dueDate).toBe("2026-11-19");
    expect(unknown.tokens[0]).toMatchObject({ kind: "project", matched: false, query: "nonexistent" });
  });

  it("removes individual tokens cleanly via removeTokenFromInput", () => {
    const raw = "Fix login bug #relay @fri !";
    const parsed = parseCaptureInput(raw, {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    const withoutProject = removeTokenFromInput(raw, parsed.tokens[0]);
    expect(withoutProject).toBe("Fix login bug @fri !");

    const reparsed = parseCaptureInput(withoutProject, {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(reparsed.projectId).toBeNull();
    expect(reparsed.dueDate).toBe("2026-11-20");
    expect(reparsed.important).toBe(true);
  });

  it("handles invalid time ranges gracefully without throwing", () => {
    const parsed = parseCaptureInput("Meeting @fri 15:00-14:00", {
      projects,
      timezone: "Asia/Jakarta",
      now: WED_NOW,
    });
    expect(parsed.timeRange).toBeNull();
    expect(parsed.dueDate).toBe("2026-11-20");
    expect(parsed.impliedKind).toBe("task");
  });

  it("scores fuzzy matches monotonically", () => {
    expect(fuzzyScore("relay", "Relay")).toBeGreaterThan(fuzzyScore("rel", "Relay"));
    expect(fuzzyScore("rel", "Relay")).toBeGreaterThan(fuzzyScore("rly", "Relay"));
    expect(fuzzyScore("xyz", "Relay")).toBe(0);
  });
});

describe("palette-search", () => {
  const sampleTasks = [
    { id: "t-1", title: "Fix login bug", projectId: "p-relay", status: "To do", dueDate: "2026-11-20", important: true },
    { id: "t-2", title: "Paint kitchen", projectId: "p-home", status: "Done", dueDate: null, important: null },
  ];

  it("finds projects, tasks, and 'go to Calendar' navigation", () => {
    const calResults = searchPalette("go to calendar", projects, sampleTasks);
    expect(calResults[0]).toMatchObject({ kind: "nav", title: "Go to Calendar", href: "/calendar" });

    const projResults = searchPalette("renovation", projects, sampleTasks);
    expect(projResults.some((r) => r.kind === "project" && r.href === "/projects?project=p-home")).toBe(true);

    const taskResults = searchPalette("login", projects, sampleTasks);
    expect(taskResults.some((r) => r.kind === "task" && r.href === "/projects?project=p-relay&task=t-1")).toBe(true);
  });

  it("returns default navigation + active projects + open tasks when query is empty", () => {
    const defaults = searchPalette("", projects, sampleTasks);
    expect(defaults.some((r) => r.kind === "nav" && r.href === "/calendar")).toBe(true);
    expect(defaults.some((r) => r.kind === "project" && r.title === "Relay")).toBe(true);
    expect(defaults.some((r) => r.kind === "task" && r.title === "Fix login bug")).toBe(true);
    expect(defaults.some((r) => r.kind === "task" && r.title === "Paint kitchen")).toBe(false);
  });
});
