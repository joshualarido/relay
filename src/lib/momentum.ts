import { Temporal } from "temporal-polyfill";
import type { Project, Task } from "./db/schema";
import { dateInTimezone } from "./dates";

export type MomentumWindow = 7 | 30 | 90;
export type MomentumStatus = "On track" | "Building" | "Light" | "Quiet";

export type DailyBar = {
  date: string;
  label: string;
  count: number;
};

export type ActiveProjectMomentum = {
  id: string;
  name: string;
  done: number;
  total: number;
  completedInWindow: number;
};

export type MomentumReport = {
  windowDays: MomentumWindow;
  score: number;
  status: MomentumStatus;
  completedCount: number;
  deltaCompleted: number;
  activeDays: number;
  followThroughPct: number | null;
  dailyBars: DailyBar[];
  activeProjects: ActiveProjectMomentum[];
};

const shortDayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function computeMomentum(
  tasks: readonly Task[],
  projects: readonly Project[],
  timezone: string,
  windowDays: MomentumWindow = 7,
  now = new Date().toISOString(),
): MomentumReport {
  const todayDate = Temporal.Instant.from(now).toZonedDateTimeISO(timezone).toPlainDate();
  const windowStart = todayDate.subtract({ days: windowDays - 1 });
  const prevStart = windowStart.subtract({ days: windowDays });
  const windowStartStr = windowStart.toString();
  const prevStartStr = prevStart.toString();
  const todayStr = todayDate.toString();

  // Map completed dates per day
  const countsByDate = new Map<string, number>();
  let completedCount = 0;
  let prevCompletedCount = 0;
  let scheduledInWindow = 0;
  let scheduledCompletedInWindow = 0;

  for (const t of tasks) {
    if (t.deletedAt) continue;

    if (t.status === "Done" && t.completedAt) {
      const doneDay = dateInTimezone(t.completedAt, timezone);
      if (doneDay >= windowStartStr && doneDay <= todayStr) {
        completedCount++;
        countsByDate.set(doneDay, (countsByDate.get(doneDay) ?? 0) + 1);
      } else if (doneDay >= prevStartStr && doneDay < windowStartStr) {
        prevCompletedCount++;
      }
    }

    const scheduledDay = t.startAt
      ? t.allDay
        ? t.startAt
        : dateInTimezone(t.startAt, timezone)
      : t.dueDate ?? (t.dueAt ? dateInTimezone(t.dueAt, timezone) : null);

    if (scheduledDay && scheduledDay >= windowStartStr && scheduledDay <= todayStr) {
      scheduledInWindow++;
      if (t.status === "Done") scheduledCompletedInWindow++;
    }
  }

  const dailyBars: DailyBar[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = windowStart.add({ days: i });
    const iso = d.toString();
    const label =
      windowDays === 7
        ? shortDayFmt.format(new Date(`${iso}T12:00:00Z`))
        : shortDateFmt.format(new Date(`${iso}T12:00:00Z`));
    dailyBars.push({ date: iso, label, count: countsByDate.get(iso) ?? 0 });
  }

  const activeDays = dailyBars.filter((b) => b.count > 0).length;

  // Consistency (45%): ~5 of 7 days (71.4%) earns full marks so rest days never punish you.
  const targetActiveDays = Math.max(1, Math.round((windowDays * 5) / 7));
  const consistencyRatio = Math.min(1, activeDays / targetActiveDays);

  // Output (35%): compare against prior window pace (or gentle 1.5/day baseline when starting).
  const baselineTarget = Math.max(Math.round(windowDays * 1.4), prevCompletedCount || 0);
  const outputRatio = baselineTarget > 0 ? Math.min(1, completedCount / baselineTarget) : 0;

  // Follow-through (20%): % of scheduled/due items in window completed.
  const followThroughPct =
    scheduledInWindow > 0 ? Math.round((scheduledCompletedInWindow / scheduledInWindow) * 100) : null;

  let rawScore: number;
  if (followThroughPct !== null) {
    rawScore = consistencyRatio * 45 + outputRatio * 35 + (followThroughPct / 100) * 20;
  } else {
    // No scheduled items in window: re-weight consistency (55%) + output (45%).
    rawScore = consistencyRatio * 55 + outputRatio * 45;
  }
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const status: MomentumStatus =
    score >= 75 ? "On track" : score >= 50 ? "Building" : score >= 25 ? "Light" : "Quiet";

  const activeProjects: ActiveProjectMomentum[] = projects
    .filter((p) => !p.deletedAt && !p.archivedAt && p.status === "Active")
    .map((p) => {
      const pTasks = tasks.filter((t) => !t.deletedAt && !t.archivedAt && t.projectId === p.id);
      const done = pTasks.filter((t) => t.status === "Done").length;
      const completedInWindow = pTasks.filter((t) => {
        if (t.status !== "Done" || !t.completedAt) return false;
        const d = dateInTimezone(t.completedAt, timezone);
        return d >= windowStartStr && d <= todayStr;
      }).length;
      return { id: p.id, name: p.name, done, total: pTasks.length, completedInWindow };
    })
    .slice(0, 5);

  return {
    windowDays,
    score,
    status,
    completedCount,
    deltaCompleted: completedCount - prevCompletedCount,
    activeDays,
    followThroughPct,
    dailyBars,
    activeProjects,
  };
}
