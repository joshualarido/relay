import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { Temporal } from "temporal-polyfill";

test("calendar opens on Agenda; views are Agenda/Week/Month with no time grid; cards carry durations", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name === "mobile", "Desktop calendar views");
  const headers = { origin: baseURL! };
  const outDir = "docs/phase5-screens";
  mkdirSync(outDir, { recursive: true });
  const stamp = crypto.randomUUID().slice(0, 6);
  const { timezone: tz } = (await (await request.get("/api/preferences")).json()) as { timezone: string };
  const today = Temporal.Now.plainDateISO(tz).toString();
  const post = async (path: string, data: Record<string, unknown>) =>
    (await request.post(path, { headers, data: { ...data, mutationId: crypto.randomUUID() } })).json();
  await post("/api/tasks", { title: `Later ${stamp}`, taskType: "Deep", executionDate: today, dayOrder: 1 });
  await post("/api/tasks", { title: `Sooner ${stamp}`, taskType: "Instant", executionDate: today, dayOrder: 0 });
  const start = Temporal.PlainDateTime.from(`${today}T13:00`).toZonedDateTime(tz).toInstant().toString();
  const end = Temporal.PlainDateTime.from(`${today}T14:30`).toZonedDateTime(tz).toInstant().toString();
  await post("/api/events", { title: `Sync ${stamp}`, start, end, allDay: false, timezone: tz, projectId: null, taskId: null, location: "" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/calendar");
  await expect(page.getByRole("group", { name: "Calendar view" }).getByRole("button")).toHaveText(["Agenda", "Week", "Month"]);
  await expect(page.getByRole("button", { name: "Agenda", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Agenda: tasks follow their Today queue order.
  const sooner = page.getByRole("link", { name: `Task deadline (Instant): Sooner ${stamp}` });
  const later = page.getByRole("link", { name: `Task deadline (Deep): Later ${stamp}` });
  await expect(sooner).toBeVisible();
  expect((await sooner.boundingBox())!.y).toBeLessThan((await later.boundingBox())!.y);
  await page.screenshot({ path: `${outDir}/calendar-agenda.png`, fullPage: true });

  // Week: days side by side, no hour rows; durations inside the cards.
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.locator(".calendar-day-cell[data-date]")).toHaveCount(7);
  await expect(page.locator(".calendar-slot-lane")).toHaveCount(0);
  await expect(page.locator(`[data-calendar-record^="task:"]`, { hasText: `Sooner ${stamp}` }).locator(".calendar-record-tag")).toHaveText("Instant · 15m");
  await expect(page.locator(`[data-calendar-record^="event:"]`, { hasText: `Sync ${stamp}` }).locator(".calendar-record-tag")).toHaveText("1h 30m");
  await page.screenshot({ path: `${outDir}/calendar-week.png`, fullPage: true });

  await page.goto("/calendar?view=day");
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
});
