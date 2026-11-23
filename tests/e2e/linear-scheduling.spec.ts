import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { Temporal } from "temporal-polyfill";

test("v3.3 linear scheduling, usable time, deadlines in Today, recurring capture, Calendar & Settings", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop seeded E2E & screenshot verification");
  const headers = { origin: baseURL! };

  const prefs = (await (await request.get("/api/preferences")).json()) as {
    timezone: string;
    revision: number;
  };
  const tz = prefs.timezone;
  const today = Temporal.Now.plainDateISO(tz).toString();
  const in3Days = Temporal.PlainDate.from(today).add({ days: 3 }).toString();

  // Ensure today has an active working window regardless of weekday (e.g. Sunday)
  const whRes = await request.put(`/api/working-hours/${today}`, {
    headers,
    data: { enabled: true, start: "09:00", end: "17:00" },
  });
  expect(whRes.ok()).toBe(true);

  // Seed projects (one with a timed deadline today at 17:00)
  const deadlineTodayIso = Temporal.PlainDateTime.from(`${today}T17:00`)
    .toZonedDateTime(tz, { disambiguation: "compatible" })
    .toInstant()
    .toString();

  const p1 = await (
    await request.post("/api/projects", {
      headers,
      data: {
        name: "Relay v3.3 Launch",
        status: "Active",
        deadlineAt: deadlineTodayIso,
        deadlineTimezone: tz,
        mutationId: crypto.randomUUID(),
      },
    })
  ).json();

  const p2 = await (
    await request.post("/api/projects", {
      headers,
      data: {
        name: "Portfolio Refresh",
        status: "Active",
        deadline: in3Days,
        mutationId: crypto.randomUUID(),
      },
    })
  ).json();

  // Seed two timed events today (2h total inside 09:00-17:00 => 6h usable)
  const evStart1 = Temporal.PlainDateTime.from(`${today}T10:00`).toZonedDateTime(tz).toInstant().toString();
  const evEnd1 = Temporal.PlainDateTime.from(`${today}T11:00`).toZonedDateTime(tz).toInstant().toString();
  const evStart2 = Temporal.PlainDateTime.from(`${today}T14:00`).toZonedDateTime(tz).toInstant().toString();
  const evEnd2 = Temporal.PlainDateTime.from(`${today}T15:00`).toZonedDateTime(tz).toInstant().toString();

  await request.post("/api/events", {
    headers,
    data: {
      title: "Design sync",
      start: evStart1,
      end: evEnd1,
      allDay: false,
      timezone: tz,
      projectId: p1.id,
      mutationId: crypto.randomUUID(),
    },
  });
  await request.post("/api/events", {
    headers,
    data: {
      title: "Client review call",
      start: evStart2,
      end: evEnd2,
      allDay: false,
      timezone: tz,
      projectId: p2.id,
      mutationId: crypto.randomUUID(),
    },
  });

  // Seed linear tasks for today (Deep 1.5h, Medium 45m recurring, Instant 15m, plus 1 completed)
  await request.post("/api/tasks", {
    headers,
    data: {
      title: "Build linear capacity engine",
      projectId: p1.id,
      taskType: "Deep",
      executionDate: today,
      dayOrder: 0,
      mutationId: crypto.randomUUID(),
    },
  });
  await request.post("/api/tasks", {
    headers,
    data: {
      title: "Daily inbox & notes triage",
      projectId: null,
      taskType: "Medium",
      executionDate: today,
      dayOrder: 1,
      recurrenceRule: { frequency: "daily", interval: 1 },
      mutationId: crypto.randomUUID(),
    },
  });
  await request.post("/api/tasks", {
    headers,
    data: {
      title: "Reply to staging deploy thread",
      projectId: p2.id,
      taskType: "Instant",
      executionDate: today,
      dayOrder: 2,
      mutationId: crypto.randomUUID(),
    },
  });
  await request.post("/api/tasks", {
    headers,
    data: {
      title: "Morning planning check-in",
      projectId: p1.id,
      status: "Done",
      taskType: "Instant",
      executionDate: today,
      dayOrder: 3,
      mutationId: crypto.randomUUID(),
    },
  });

  const outDir = "docs/phase5-screens";
  mkdirSync(outDir, { recursive: true });

  // 1. Today screen: capacity bar, project deadline, events, linear queue, progress
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByText("Usable time")).toBeVisible();
  await expect(page.getByText("Schedule & deadlines")).toBeVisible();
  await expect(page.getByText("Relay v3.3 Launch").first()).toBeVisible();
  await expect(page.getByText("Build linear capacity engine")).toBeVisible();
  await expect(page.getByText("Daily", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${outDir}/today-seeded.png`, fullPage: true });

  // 1b. A task's duration can be overridden after creation; the type default is only a first guess.
  await page.getByRole("link", { name: "Build linear capacity engine" }).click();
  const panel = page.getByRole("dialog");
  const duration = panel.getByLabel("Duration");
  await expect(duration).toHaveAttribute("placeholder", "90");
  await duration.fill("60");
  await duration.blur();
  await expect(page.getByText("Duration set.").first()).toBeVisible();
  await page.screenshot({ path: `${outDir}/task-duration.png` });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".task-type-pill", { hasText: /^Deep · 1h$/ })).toBeVisible();
  await expect(page.getByText("2h 30m left")).toHaveCount(0);

  // 2. Capture dialog: Task (with Repeat enabled) & Project (with Deadline time)
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Capture" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Date", { exact: true })).toBeVisible();
  await dialog.getByLabel("Recurrence frequency").selectOption("weekly");
  await expect(dialog.getByRole("group", { name: "Repeat on weekdays" })).toBeVisible();
  await page.screenshot({ path: `${outDir}/capture-task.png` });

  await dialog.getByRole("radio", { name: "Project" }).click();
  await expect(dialog.getByLabel("Deadline", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Deadline time (optional)")).toBeVisible();
  await page.screenshot({ path: `${outDir}/capture-project.png` });
  await page.keyboard.press("Escape");

  // 3. Calendar screen: capacity pills, timed events/deadline, day-level tasks
  await page.goto("/calendar?view=week");
  await expect(page.locator(".calendar-capacity-pill").first()).toBeVisible();
  await expect(page.getByText("Design sync").first()).toBeVisible();
  await expect(page.getByText("Build linear capacity engine").first()).toBeVisible();
  await page.screenshot({ path: `${outDir}/calendar-seeded.png`, fullPage: true });

  // 4. Settings screen: working hours + task type durations
  await page.goto("/settings");
  await expect(page.getByText("Default working hours")).toBeVisible();
  await expect(page.getByText("Task type durations (minutes)")).toBeVisible();
  await expect(page.getByLabel("Monday start")).toHaveValue("09:00");
  await page.screenshot({ path: `${outDir}/settings-seeded.png`, fullPage: true });

  // 5. Theme switch: Dark applies instantly, persists across reloads, System clears it.
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: `${outDir}/settings-dark.png`, fullPage: true });
  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});
