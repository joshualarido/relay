"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Project, Task } from "@/lib/db/schema";
import { computeMomentum, type MomentumWindow } from "@/lib/momentum";
import { projectHref } from "@/lib/links";
import { MomentumFlame } from "./momentum-flame";

const WINDOWS: { days: MomentumWindow; label: string }[] = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

export function TodayProgress({
  tasks,
  projects,
  timezone,
  now,
}: {
  tasks: Task[];
  projects: Project[];
  timezone: string;
  now: string;
}) {
  const [windowDays, setWindowDays] = useState<MomentumWindow>(7);

  const report = useMemo(
    () => computeMomentum(tasks, projects, timezone, windowDays, now),
    [tasks, projects, timezone, windowDays, now],
  );

  const maxCount = Math.max(1, ...report.dailyBars.map((b) => b.count));
  const deltaText =
    report.deltaCompleted > 0
      ? `+${report.deltaCompleted} vs prior ${windowDays}d`
      : report.deltaCompleted < 0
        ? `${report.deltaCompleted} vs prior ${windowDays}d`
        : null;

  return (
    <section className="today-section progress-section" aria-labelledby="progress-heading">
      <div className="progress-header">
        <h2 id="progress-heading">Progress</h2>
        <div className="view-switch" role="group" aria-label="Progress timeframe">
          {WINDOWS.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              aria-pressed={windowDays === days}
              onClick={() => setWindowDays(days)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="momentum-hero">
        <div className="momentum-score-row">
          <span className="momentum-number-wrap"><MomentumFlame score={report.score} /><span className="momentum-number">{report.score}</span></span>
          <span className="momentum-denom">/ 100</span>
          <span className="momentum-status" data-status={report.status.toLowerCase().replace(" ", "-")}>
            {report.status}
          </span>
        </div>

        <div className="momentum-track" role="progressbar" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={100} aria-label="Momentum score">
          <span style={{ width: `${report.score}%` }} />
        </div>

        <p className="momentum-breakdown">
          <span>{report.completedCount} completed{deltaText ? ` (${deltaText})` : ""}</span>
          <span aria-hidden="true">·</span>
          <span>{report.activeDays} of {report.windowDays} active days</span>
          {report.followThroughPct !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>{report.followThroughPct}% follow-through</span>
            </>
          )}
        </p>
      </div>

      <div
        className="momentum-chart"
        data-window={windowDays}
        role="img"
        aria-label={`Daily completions over the last ${windowDays} days: ${report.completedCount} total across ${report.activeDays} active days.`}
      >
        {report.dailyBars.map((bar) => {
          const pct = bar.count > 0 ? Math.max(12, Math.round((bar.count / maxCount) * 100)) : 0;
          return (
            <div key={bar.date} className="momentum-bar-col" title={`${bar.label} (${bar.date}): ${bar.count} completed`}>
              <div className="momentum-bar-track">
                {pct > 0 && <span className="momentum-bar-fill" style={{ height: `${pct}%` }} />}
              </div>
              {windowDays === 7 && <span className="momentum-bar-label">{bar.label}</span>}
            </div>
          );
        })}
      </div>

      {report.activeProjects.length > 0 && (
        <div className="momentum-projects">
          <h3>Active projects</h3>
          <ul className="momentum-project-list">
            {report.activeProjects.map((p) => {
              const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <li key={p.id}>
                  <Link href={projectHref(p.id)} className="momentum-project-row">
                    <span className="momentum-project-name">{p.name}</span>
                    <span className="progress-track momentum-project-bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className="momentum-project-meta">
                      {p.done}/{p.total}
                      {p.completedInWindow > 0 ? ` · +${p.completedInWindow}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
