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

  // Drag to reorder within a day (Week) — the ghost trails the cursor and the order is saved.
  const order = async () => {
    const tasks = (await (await request.get("/api/tasks")).json()) as { title: string; dayOrder: number; executionDate: string | null }[];
    return tasks.filter((t) => t.title.endsWith(stamp)).sort((x, y) => x.dayOrder - y.dayOrder).map((t) => `${t.title.split(" ")[0]}@${t.executionDate}`);
  };
  const card = (name: string) => page.locator(`[data-calendar-record^="task:"]`, { hasText: `${name} ${stamp}` });
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, shot?: string) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.waitForTimeout(300);
    if (shot) await page.screenshot({ path: `${outDir}/${shot}` });
    await page.mouse.up();
    await page.waitForTimeout(400);
  };
  const center = async (name: string) => {
    const box = (await card(name).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: box.y };
  };
  const laterBox = await center("Later");
  const soonerBox = await center("Sooner");
  await drag(laterBox, { x: soonerBox.x, y: soonerBox.top + 2 }, "calendar-week-dragging.png");
  await expect.poll(order).toEqual([`Later@${today}`, `Sooner@${today}`]);

  // Drag a task to the next day.
  const tomorrow = Temporal.PlainDate.from(today).add({ days: 1 }).toString();
  const nextCell = page.locator(`.calendar-day-cell[data-date="${tomorrow}"]`).first();
  if (await nextCell.count()) {
    const cellBox = (await nextCell.boundingBox())!;
    await drag(await center("Sooner"), { x: cellBox.x + cellBox.width / 2, y: cellBox.y + 40 });
    await expect.poll(order).toContain(`Sooner@${tomorrow}`);
  }

  // Agenda: drag reorders too, and Alt+Arrow moves with the keyboard.
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await post("/api/tasks", { title: `Third ${stamp}`, taskType: "Medium", executionDate: today, dayOrder: 5 });
  await page.reload();
  const thirdBox = await center("Third");
  const laterTop = await center("Later");
  await drag(thirdBox, { x: laterTop.x, y: laterTop.top + 2 });
  await expect.poll(order).toEqual(expect.arrayContaining([`Third@${today}`, `Later@${today}`]));
  expect((await order()).filter((o) => o.endsWith(today))).toEqual([`Third@${today}`, `Later@${today}`]);
  await card("Third").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(async () => (await order()).filter((o) => o.endsWith(today))).toEqual([`Later@${today}`, `Third@${today}`]);

  await page.goto("/calendar?view=day");
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
});
