import { test, expect } from "@playwright/test";

test("dragging a calendar card onto the unschedule drop zone clears its schedule and supports undo", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop spec");
  const headers = { origin: baseURL! };
  const suffix = crypto.randomUUID().slice(0, 6);

  const task = await (
    await request.post("/api/tasks", {
      headers,
      data: {
        title: `Toss task ${suffix}`,
        executionDate: "2027-02-10",
        mutationId: crypto.randomUUID(),
      },
    })
  ).json();

  const ev = await (
    await request.post("/api/events", {
      headers,
      data: {
        title: `Toss event ${suffix}`,
        allDay: true,
        start: "2027-02-11",
        end: "2027-02-12",
        timezone: "Asia/Jakarta",
        mutationId: crypto.randomUUID(),
      },
    })
  ).json();

  await page.goto("/calendar?date=2027-02-10&view=week");

  const taskCard = page.locator(`[data-calendar-record="task:${task.id}"]`).first();
  await expect(taskCard).toBeVisible();
  await expect(page.locator('[data-unschedule-zone="true"]')).toHaveCount(0);

  // Start dragging task card -> unschedule drop zone appears
  const taskBox = (await taskCard.boundingBox())!;
  await page.mouse.move(taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(taskBox.x + taskBox.width / 2 + 12, taskBox.y + taskBox.height / 2 + 12, { steps: 4 });

  const zone = page.locator('[data-unschedule-zone="true"]');
  await expect(zone).toBeVisible();
  const zoneBox = (await zone.boundingBox())!;

  // Move over the drop zone -> zone highlights as active
  await page.mouse.move(zoneBox.x + zoneBox.width / 2, zoneBox.y + zoneBox.height / 2, { steps: 12 });
  await expect(zone).toHaveAttribute("data-active", "true");
  await page.mouse.up();

  // Task is removed from the calendar and unscheduled on the server
  await expect(page.locator(`[data-calendar-record="task:${task.id}"]`)).toHaveCount(0);
  await expect
    .poll(async () => (await (await request.get(`/api/tasks/${task.id}`)).json()).executionDate)
    .toBeNull();

  // Undo toast appears and task returns to unscheduled list in Schedule panel
  const toast = page.locator('[data-sonner-toast][data-front="true"]');
  await expect(toast).toContainText("Task unscheduled.");

  await page.keyboard.press("s");
  const panel = page.getByRole("region", { name: "Schedule panel" });
  await expect(panel.locator(`[data-schedule-item="task:${task.id}"]`)).toBeVisible();
  await page.keyboard.press("Escape");

  // Click Undo -> task returns to 2027-02-10 on the calendar
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await (await request.get(`/api/tasks/${task.id}`)).json()).executionDate)
    .toBe("2027-02-10");
  await expect(page.locator(`[data-calendar-record="task:${task.id}"]`).first()).toBeVisible();

  // Verify normal desktop drag between days is unchanged
  const movedTaskBox = (await page.locator(`[data-calendar-record="task:${task.id}"]`).first().boundingBox())!;
  const targetDayBox = (await page.locator('.calendar-day-cell[data-date="2027-02-12"]').first().boundingBox())!;
  await page.mouse.move(movedTaskBox.x + movedTaskBox.width / 2, movedTaskBox.y + movedTaskBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(movedTaskBox.x + movedTaskBox.width / 2 + 12, movedTaskBox.y + movedTaskBox.height / 2, { steps: 4 });
  await page.mouse.move(targetDayBox.x + targetDayBox.width / 2, targetDayBox.y + targetDayBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await (await request.get(`/api/tasks/${task.id}`)).json()).executionDate)
    .toBe("2027-02-12");

  // Verify tossing an event also unschedules with undo
  const eventCard = page.locator(`[data-calendar-record="event:${ev.id}"]`).first();
  const evBox = (await eventCard.boundingBox())!;
  await page.mouse.move(evBox.x + evBox.width / 2, evBox.y + evBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(evBox.x + evBox.width / 2 + 12, evBox.y + evBox.height / 2 + 12, { steps: 4 });
  await expect(zone).toBeVisible();
  const zoneBox2 = (await zone.boundingBox())!;
  await page.mouse.move(zoneBox2.x + zoneBox2.width / 2, zoneBox2.y + zoneBox2.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await (await request.get(`/api/events/${ev.id}`)).json()).start)
    .toBe("");
});
