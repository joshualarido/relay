import { test, expect } from "@playwright/test";
import { join } from "node:path";

test("calendar event create/edit/default duration/delete persists with all views and filters", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const title = `Study ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/calendar");
  await page.getByRole("button", { name: "New event", exact: true }).click();
  await page.getByLabel("Event title", { exact: true }).fill(title);
  await page.getByLabel("Start", { exact: true }).fill("2027-03-14T01:30");
  await page.getByLabel("Event timezone", { exact: true }).fill("America/Los_Angeles");
  await page.getByRole("button", { name: "Suggest 60-minute end", exact: true }).click();
  await expect(page.getByLabel("End", { exact: true })).toHaveValue("2027-03-14T03:30");
  await page.getByLabel("Location or meeting URL").fill("Library");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Go to date").fill("2027-03-14");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await page.getByRole("link", { name: `Event: ${title}`, exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Event details" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Event details" })).toBeVisible();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Event title", { exact: true }).fill(`${title} edited`);
  await page.getByLabel("Start", { exact: true }).fill("2027-03-14T04:00");
  await page.getByLabel("End", { exact: true }).fill("2027-03-14T05:00");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reschedule", exact: true }).click();
  await page.getByRole("button", { name: "Close event details", exact: true }).click();
  for (const name of ["Week", "Day", "Agenda", "Month"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("link", { name: `Event: ${title} edited`, exact: true }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Filter calendar" }).click();
  await page.getByLabel("Show event", { exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: `Event: ${title} edited`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filter calendar" }).click();
  await page.getByLabel("Show event", { exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: `Event: ${title} edited`, exact: true }).first().click();
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await page.getByRole("button", { name: "Confirm soft deletion", exact: true }).click();
  await expect(page.getByRole("link", { name: `Event: ${title} edited`, exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `calendar-${info.project.name}.png`), fullPage: true, caret: "initial" });
});

test("unified calendar labels/colors and all-day exclusive ranges, owner boundaries and links", async ({ page, request, baseURL, browser }) => {
  const headers = { origin: baseURL! };
  const suffix = crypto.randomUUID().slice(0, 6);
  const p = await (await request.post("/api/projects", { headers, data: { name: `Calendar project ${suffix}`, deadline: "2027-02-10", mutationId: crypto.randomUUID() } })).json();
  const t = await (await request.post("/api/tasks", { headers, data: { title: `Calendar task ${suffix}`, dueDate: "2027-02-10", projectId: p.id, mutationId: crypto.randomUUID() } })).json();
  const e = await (await request.post("/api/events", { headers, data: { title: `All-day event ${suffix}`, start: "2027-02-10", end: "2027-02-11", allDay: true, timezone: "Asia/Jakarta", projectId: p.id, mutationId: crypto.randomUUID() } })).json();
  expect(e.id).toBeTruthy();
  await page.goto("/calendar?date=2027-02-10");
  await expect(page.getByRole("link", { name: `Project deadline: ${p.name}`, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: `Task deadline: ${t.title}`, exact: true }).first()).toBeVisible();
  const event = page.getByRole("link", { name: `Event: ${e.title}`, exact: true }).first();
  await expect(event).toBeVisible();
  expect(await event.evaluate((el) => getComputedStyle(el).getPropertyValue("--record-color").trim().toUpperCase())).toBe("#3B4BDB");
  await page.getByRole("link", { name: `Task deadline: ${t.title}`, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`task=${t.id}`));
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
  await page.getByRole("button", { name: "Close task details" }).click();
  await page.getByRole("link", { name: `Project deadline: ${p.name}`, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/projects\\?project=${p.id}$`));
  await expect(page.getByRole("link", { name: new RegExp(e.title) })).toBeVisible();
  const bob = await browser.newContext({ baseURL, storageState: join(process.env.RELAY_TEST_DIR!, "bob.json") });
  try { expect((await bob.request.get(`/api/events/${e.id}`)).status()).toBe(404); }
  finally { await bob.close(); }
});

test("an existing DST-overlap event keeps its instant when only its title changes", async ({ page, request, baseURL }) => {
  const created = await (await request.post("/api/events", { headers: { origin: baseURL! }, data: {
    title: "DST overlap", start: "2027-11-07T08:30:00Z", end: "2027-11-07T09:30:00Z",
    timezone: "America/Los_Angeles", mutationId: crypto.randomUUID(),
  } })).json();
  await page.goto(`/calendar?date=2027-11-07&event=${created.id}`);
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Event title", { exact: true }).fill("DST overlap edited");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("heading", { name: "DST overlap edited", exact: true })).toBeVisible();
  expect(await (await request.get(`/api/events/${created.id}`)).json()).toMatchObject({
    start: "2027-11-07T08:30:00.000Z", end: "2027-11-07T09:30:00.000Z",
  });
});

test("desktop calendar dragging persists all types and rolls back a rejected event move", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name === "mobile", "Desktop pointer path; native editing reschedule is tested on touch-mobile.");
  const headers = { origin: baseURL! }, suffix = crypto.randomUUID().slice(0, 6);
  const p = await (await request.post("/api/projects", { headers, data: { name: `Drag milestone ${suffix}`, deadline: "2027-02-08", mutationId: crypto.randomUUID() } })).json();
  const t = await (await request.post("/api/tasks", { headers, data: { title: `Drag deadline ${suffix}`, dueDate: "2027-02-09", mutationId: crypto.randomUUID() } })).json();
  const e = await (await request.post("/api/events", { headers, data: { title: `Drag event ${suffix}`, allDay: true, start: "2027-02-10", end: "2027-02-11", timezone: "Asia/Jakarta", mutationId: crypto.randomUUID() } })).json();
  await page.goto("/calendar?date=2027-02-10");
  async function drag(kind: string, id: string, date: string) {
    const source = page.locator(`[data-calendar-record="${kind}:${id}"]`).first();
    await source.scrollIntoViewIfNeeded();
    const start = await source.boundingBox();
    const target = await page.locator(`[data-date="${date}"]`).first().boundingBox();
    expect(target).not.toBeNull();
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
    await page.mouse.down();
    await page.mouse.move(start!.x + start!.width / 2 + 15, start!.y + start!.height / 2, { steps: 5 });
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 20 });
    await page.mouse.up();
  }
  await drag("project", p.id, "2027-02-11");
  await expect.poll(async () => (await (await request.get(`/api/projects/${p.id}`)).json()).deadline).toBe("2027-02-11");
  await drag("task", t.id, "2027-02-12");
  await expect.poll(async () => (await (await request.get(`/api/tasks/${t.id}`)).json()).dueDate).toBe("2027-02-12");
  expect((await (await request.get(`/api/tasks/${t.id}`)).json()).dueAt).toBeNull();
  await drag("event", e.id, "2027-02-13");
  await expect.poll(async () => (await (await request.get(`/api/events/${e.id}`)).json()).start).toBe("2027-02-13");
  expect((await (await request.get(`/api/events/${e.id}`)).json()).end).toBe("2027-02-14");
  await page.reload();
  const source = page.locator(`[data-calendar-record="event:${e.id}"]`).first();
  const before = await source.boundingBox();
  await page.route(`**/api/events/${e.id}`, async (route) => {
    if (route.request().method() === "PATCH") await route.fulfill({ status: 409, json: { error: "Injected stale schedule. Original dates retained." } });
    else await route.continue();
  });
  await drag("event", e.id, "2027-02-14");
  await expect(page.getByRole("alert").filter({ hasText: "Injected stale schedule" })).toBeVisible();
  const after = await source.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect((await (await request.get(`/api/events/${e.id}`)).json()).start).toBe("2027-02-13");
});

test("event dialogs retain pending input and return focus; mobile calendar has keyboard navigation", async ({ page, request, baseURL }, info) => {
  const e = await (await request.post("/api/events", { headers: { origin: baseURL! }, data: {
    title: `Keyboard event ${crypto.randomUUID().slice(0, 6)}`, allDay: true, start: "2027-02-08", end: "2027-02-09",
    timezone: "Asia/Jakarta", mutationId: crypto.randomUUID(),
  } })).json();
  await page.goto("/calendar?date=2027-02-08");
  const frame = page.getByRole("region", { name: "Calendar grid; scroll horizontally on narrow screens" });
  await frame.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Agenda", exact: true }).focus();
  await page.keyboard.press("Enter");
  const link = page.getByRole("link", { name: `Event: ${e.title}`, exact: true }).first();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Event details", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Event details", exact: true })).toHaveCount(0);
  await expect(link).toBeFocused();
  await link.click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Event description").fill("Preserve pending input");
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/events/${e.id}`, async (route) => {
    if (route.request().method() === "PATCH") { await barrier; await route.continue(); }
    else await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Edit event", exact: true })).toBeVisible();
    await expect(page.getByLabel("Event description")).toHaveValue("Preserve pending input");
  } finally { release(); }
  await expect(page.getByRole("dialog", { name: "Edit event", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close event details" }).click();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await frame.evaluate((el) => { el.scrollLeft = 0; });
  const title = await page.getByRole("heading", { name: "February 2027", exact: true }).boundingBox();
  expect(title!.x).toBeGreaterThanOrEqual(0);
  expect(title!.x + title!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole("heading", { name: "Calendar", exact: true }).click();
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `calendar-populated-${info.project.name}.png`), fullPage: true, caret: "initial" });
});

test("desktop timed drag crosses DST without changing duration", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name === "mobile", "Desktop pointer path; mobile uses native rescheduling.");
  const headers = { origin: baseURL! };
  const preferences = await (await request.get("/api/preferences")).json();
  await request.patch("/api/preferences", { headers, data: { timezone: "America/Los_Angeles", weekStart: 1, expectedRevision: preferences.revision } });
  try {
    const e = await (await request.post("/api/events", { headers, data: {
      title: "DST pointer", start: "2027-03-13T09:30:00Z", end: "2027-03-13T10:30:00Z", timezone: "America/Los_Angeles", mutationId: crypto.randomUUID(),
    } })).json();
    await page.goto("/calendar?date=2027-03-13");
    await page.getByRole("button", { name: "Week", exact: true }).click();
    const source = page.locator(`[data-calendar-record="event:${e.id}"]`).first();
    await source.scrollIntoViewIfNeeded();
    const start = await source.boundingBox();
    const from = await page.locator('[data-date="2027-03-13"]').first().boundingBox();
    const to = await page.locator('[data-date="2027-03-14"]').first().boundingBox();
    await page.mouse.move(start!.x + 10, start!.y + 8);
    await page.mouse.down();
    await page.mouse.move(start!.x + 25, start!.y + 8, { steps: 5 });
    await page.mouse.move(start!.x + 10 + to!.x - from!.x, start!.y + 8, { steps: 20 });
    await page.mouse.up();
    await expect.poll(async () => (await (await request.get(`/api/events/${e.id}`)).json()).start).toBe("2027-03-14T09:30:00.000Z");
    expect((await (await request.get(`/api/events/${e.id}`)).json()).end).toBe("2027-03-14T10:30:00.000Z");
  } finally {
    const current = await (await request.get("/api/preferences")).json();
    await request.patch("/api/preferences", { headers, data: { timezone: preferences.timezone, weekStart: preferences.weekStart, expectedRevision: current.revision } });
  }
});

test("inline event create, Esc cancel, and event-only edge resize persist and undo", async ({ page, request }) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const allDayTitle = `Inline day ${suffix}`;
  const timedTitle = `Inline timed ${suffix}`;

  await page.goto("/calendar?date=2027-02-10");
  // Month view is default on desktop; permanent legend is gone
  await expect(page.locator("fieldset.calendar-legend")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Click empty day cell -> inline all-day editor, Esc cancels without writing
  await page.locator('.calendar-day-cell[data-date="2027-02-11"]').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("dialog", { name: "Quick create event" })).toBeVisible();
  await expect(page.getByLabel("Event title", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Quick create event" })).toHaveCount(0);

  // Click again and save all-day event with Enter
  await page.locator('.calendar-day-cell[data-date="2027-02-11"]').click({ position: { x: 20, y: 20 } });
  await page.getByLabel("Event title", { exact: true }).fill(allDayTitle);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Quick create event" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: `Event: ${allDayTitle}`, exact: true }).first()).toBeVisible();

  // Switch to Week view -> click timed slot -> 1-hour inline event
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await page.locator('.calendar-slot-lane[data-time="10:00:00"]').first().scrollIntoViewIfNeeded();
  const col = await page.locator('.calendar-time-col[data-date="2027-02-11"]').first().boundingBox();
  const slot = await page.locator('.calendar-slot-lane[data-time="10:00:00"]').first().boundingBox();
  expect(col && slot).toBeTruthy();
  await page.mouse.click(col!.x + col!.width / 2, slot!.y + slot!.height / 2);
  await expect(page.getByRole("dialog", { name: "Quick create event" })).toBeVisible();
  await page.getByLabel("Event title", { exact: true }).fill(timedTitle);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Quick create event" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: `Event: ${timedTitle}`, exact: true }).first()).toBeVisible();

  // Reload preserves view=week and both events
  await page.reload();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  const timedLink = page.getByRole("link", { name: `Event: ${timedTitle}`, exact: true }).first();
  await expect(timedLink).toBeVisible();

  // Edge resize timed event by dragging its bottom edge down 2 slots
  await page.locator('.calendar-slot-lane[data-time="13:00:00"]').first().scrollIntoViewIfNeeded();
  await timedLink.hover();
  const freshSlot = await page.locator('.calendar-slot-lane[data-time="10:00:00"]').first().boundingBox();
  const slotHeight = freshSlot!.height;
  const resizer = timedLink.locator("xpath=ancestor::*[@role='listitem'][1]").locator(".calendar-event-resizer").first();
  await expect(resizer).toBeVisible();
  const resizeBox = await resizer.boundingBox();
  expect(resizeBox).not.toBeNull();
  const rx = resizeBox!.x + resizeBox!.width / 2;
  const ry = resizeBox!.y + resizeBox!.height / 2;
  await page.mouse.move(rx, ry);
  await page.mouse.down();
  await page.mouse.move(rx, ry + slotHeight * 2, { steps: 12 });
  await page.mouse.up();

  // Verify persisted extended duration via API
  await expect.poll(async () => {
    const events = await (await request.get("/api/events")).json();
    const ev = events.find((x: { title: string }) => x.title === timedTitle);
    return ev ? Date.parse(ev.end) - Date.parse(ev.start) : 0;
  }).toBeGreaterThan(60 * 60 * 1000);

  // Undo reverses resize back to 1 hour
  await page.locator('[data-sonner-toast][data-front="true"]').getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => {
    const events = await (await request.get("/api/events")).json();
    const ev = events.find((x: { title: string }) => x.title === timedTitle);
    return ev ? Date.parse(ev.end) - Date.parse(ev.start) : 0;
  }).toBe(60 * 60 * 1000);
});

test("MVP acceptance #3: Schedule mode drag task to time, task to day, project to day, Shift+drop, reject project-to-time, keyboard placement", async ({ page, request, baseURL }) => {
  const headers = { origin: baseURL! };
  const suffix = crypto.randomUUID().slice(0, 6);

  // Create test records:
  // 1) Task for Thursday 10:00 time slot
  const tTime = await (await request.post("/api/tasks", { headers, data: { title: `Deep work ${suffix}`, mutationId: crypto.randomUUID() } })).json();
  // 2) Task with existing timed deadline to drop onto Friday day row (must clear dueAt & timezone)
  const tDay = await (await request.post("/api/tasks", {
    headers,
    data: { title: `Ship notes ${suffix}`, dueAt: "2027-02-09T15:00:00Z", timezone: "UTC", mutationId: crypto.randomUUID() },
  })).json();
  // 3) Dateless project to drop onto a day row
  const pDay = await (await request.post("/api/projects", { headers, data: { name: `Launch ${suffix}`, status: "Active", mutationId: crypto.randomUUID() } })).json();
  // 4) Task for Shift+drop multi-session and keyboard placement
  const tShift = await (await request.post("/api/tasks", { headers, data: { title: `Multi block ${suffix}`, mutationId: crypto.randomUUID() } })).json();

  // Navigate to Week containing Thursday 2027-02-11 and Friday 2027-02-12
  await page.goto("/calendar?date=2027-02-11&view=week");
  await expect(page.getByRole("heading", { name: /February 2027/ })).toBeVisible();

  // Open Schedule mode with S shortcut
  await page.keyboard.press("s");
  const panel = page.getByRole("region", { name: "Schedule panel" });
  await expect(panel).toBeVisible();
  await expect(page.getByLabel("Filter unscheduled work")).toBeFocused();

  // Working hours dim should be present on off-hours slots (e.g. 07:00)
  await expect(page.locator('.calendar-slot-lane.calendar-off-hours[data-time="07:00:00"]').first()).toBeVisible();

  async function dragScheduleItem(selector: string, targetX: number, targetY: number, shift = false) {
    const item = panel.locator(selector);
    await item.scrollIntoViewIfNeeded();
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 12, box!.y + box!.height / 2, { steps: 4 });
    await page.mouse.move(targetX, targetY, { steps: 15 });
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
  }

  // Move panel to left edge if overlapping Thursday/Friday columns
  const panelHeader = panel.locator(".schedule-panel-header");
  const hdrBox = await panelHeader.boundingBox();
  if (hdrBox && hdrBox.x > 400) {
    await page.mouse.move(hdrBox.x + 20, hdrBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(260, 120, { steps: 8 });
    await page.mouse.up();
  }

  // 1) Drag task onto Thursday 2027-02-11 10:00
  const thuCol = await page.locator('.calendar-time-col[data-date="2027-02-11"]').first().boundingBox();
  const slot10 = await page.locator('.calendar-slot-lane[data-time="10:00:00"]').first().boundingBox();
  expect(thuCol && slot10).toBeTruthy();
  await dragScheduleItem(`[data-schedule-item="task:${tTime.id}"]`, thuCol!.x + thuCol!.width / 2, slot10!.y + slot10!.height / 2);

  await expect.poll(async () => {
    const events = await (await request.get("/api/events")).json();
    return events.filter((e: { taskId: string | null }) => e.taskId === tTime.id).length;
  }).toBe(1);
  // Item animates out of panel
  await expect(panel.locator(`[data-schedule-item="task:${tTime.id}"]`)).toHaveCount(0);

  // 2) Drag task onto Friday 2027-02-12 all-day row -> sets dueDate and clears dueAt & timezone
  const friDay = await page.locator('.calendar-day-cell[data-date="2027-02-12"]').first().boundingBox();
  expect(friDay).not.toBeNull();
  await dragScheduleItem(`[data-schedule-item="task:${tDay.id}"]`, friDay!.x + friDay!.width / 2, friDay!.y + friDay!.height / 2);

  await expect.poll(async () => (await (await request.get(`/api/tasks/${tDay.id}`)).json()).dueDate).toBe("2027-02-12");
  const updatedTask = await (await request.get(`/api/tasks/${tDay.id}`)).json();
  expect(updatedTask.dueAt).toBeNull();
  expect(updatedTask.timezone).toBeNull();

  // 3) Project dropped onto time slot is rejected (no write, stays in panel)
  const slot12 = await page.locator('.calendar-slot-lane[data-time="12:00:00"]').first().boundingBox();
  await dragScheduleItem(`[data-schedule-item="project:${pDay.id}"]`, thuCol!.x + thuCol!.width / 2, slot12!.y + slot12!.height / 2);
  expect((await (await request.get(`/api/projects/${pDay.id}`)).json()).deadline).toBeNull();
  await expect(panel.locator(`[data-schedule-item="project:${pDay.id}"]`)).toBeVisible();

  // 4) Drag project onto Friday 2027-02-12 all-day row -> sets deadline
  await dragScheduleItem(`[data-schedule-item="project:${pDay.id}"]`, friDay!.x + friDay!.width / 2, friDay!.y + friDay!.height / 2);
  await expect.poll(async () => (await (await request.get(`/api/projects/${pDay.id}`)).json()).deadline).toBe("2027-02-12");

  // Reload proves all three persisted
  await page.reload();
  await expect(page.getByRole("link", { name: `Event: ${tTime.title}`, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: `Task deadline: ${tDay.title}`, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: `Project deadline: ${pDay.name}`, exact: true }).first()).toBeVisible();

  // 5) Shift+drop keeps task in panel for multiple independent sessions; undoing one leaves the other
  await page.keyboard.press("s");
  await expect(panel).toBeVisible();
  const hdrBox2 = await panel.locator(".schedule-panel-header").boundingBox();
  if (hdrBox2 && hdrBox2.x > 400) {
    await page.mouse.move(hdrBox2.x + 20, hdrBox2.y + 10);
    await page.mouse.down();
    await page.mouse.move(260, 120, { steps: 6 });
    await page.mouse.up();
  }
  const slot14 = await page.locator('.calendar-slot-lane[data-time="14:00:00"]').first().boundingBox();
  const slot16 = await page.locator('.calendar-slot-lane[data-time="16:00:00"]').first().boundingBox();
  await dragScheduleItem(`[data-schedule-item="task:${tShift.id}"]`, thuCol!.x + thuCol!.width / 2, slot14!.y + slot14!.height / 2, true);
  // Task stays in panel after Shift+drop
  await expect(panel.locator(`[data-schedule-item="task:${tShift.id}"]`)).toBeVisible();
  await dragScheduleItem(`[data-schedule-item="task:${tShift.id}"]`, thuCol!.x + thuCol!.width / 2, slot16!.y + slot16!.height / 2, false);

  await expect.poll(async () => {
    const events = await (await request.get("/api/events")).json();
    return events.filter((e: { taskId: string | null }) => e.taskId === tShift.id).length;
  }).toBe(2);

  // Undo second session -> leaves first session intact
  await page.locator('[data-sonner-toast][data-front="true"]').getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => {
    const events = await (await request.get("/api/events")).json();
    return events.filter((e: { taskId: string | null }) => e.taskId === tShift.id).length;
  }).toBe(1);

  // 6) Entry via /calendar?schedule=1&task=<id> highlights task even though it already has a session
  await page.goto(`/calendar?date=2027-02-11&view=week&schedule=1&task=${tTime.id}`);
  await expect(panel).toBeVisible();
  await expect(page.getByLabel("Filter unscheduled work")).toBeFocused();
  await expect(panel.locator(`[data-schedule-item="task:${tTime.id}"][data-highlighted="true"]`)).toBeVisible();
  // Task details modal must NOT open when schedule=1
  await expect(page.getByRole("dialog", { name: "Task details" })).toHaveCount(0);

  // Keyboard placement: Enter picks up highlighted task, ArrowDown moves ghost, Escape cancels, second Escape closes panel
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-schedule-ghost="true"]')).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/calendar/); // ScreenShortcuts did not hijack
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-schedule-ghost="true"]')).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
