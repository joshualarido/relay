import { test, expect, type Page } from "@playwright/test";

const headers = (origin: string) => ({ origin });
const monthDate = "2027-03-15";

test("Home is one viewport-fit daily workbench without page scrolling", async ({ page }) => {
  await page.goto(`/?date=${monthDate}`);
  await expect(page.locator("h1")).toHaveText("Today");
  await expect(page.getByRole("heading", { name: "Quick capture", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today's tasks", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Calendar grid; scroll horizontally on narrow screens" })).toBeVisible();
  const bounds = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= innerWidth,
    vertical: document.documentElement.scrollHeight <= innerHeight,
  }));
  expect(bounds).toEqual({ horizontal: true, vertical: true });
});

test("Home date click pre-fills capture and unified capture creates project, task, and event", async ({ page, request, baseURL }, info) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  const captureDate = info.project.name === "mobile" ? "2027-03-25" : "2027-03-18";
  await page.goto(`/?date=${monthDate}`);
  if (info.project.name === "mobile") await page.locator(".home-calendar .calendar-frame").evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.locator(`[data-date="${captureDate}"]`).click();
  await expect(page.locator(".quick-capture-card").getByLabel("Planned work date", { exact: true })).toHaveValue(captureDate);

  const capture = page.locator(".quick-capture-card input[name=title]");
  await page.getByLabel("Capture type", { exact: true }).selectOption("project");
  await capture.fill(`Phase 1.3 project ${suffix}`);
  await page.getByLabel("Deadline", { exact: true }).fill(captureDate);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByText("Project created.", { exact: true })).toBeVisible();

  await page.getByLabel("Capture type", { exact: true }).selectOption("task");
  await capture.fill(`Phase 1.3 task ${suffix}`);
  await page.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(page.getByText("Task captured.", { exact: true })).toBeVisible();

  await page.getByLabel("Capture type", { exact: true }).selectOption("event");
  await capture.fill(`Phase 1.3 event ${suffix}`);
  await page.getByRole("button", { name: "Set event details", exact: true }).click();
  await page.getByLabel("All-day event", { exact: true }).check();
  await page.getByLabel("Start", { exact: true }).fill(captureDate);
  await page.getByLabel("End", { exact: true }).fill("2027-03-26");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "New event", exact: true })).toHaveCount(0);

  const projects = await (await request.get("/api/projects")).json();
  const tasks = await (await request.get("/api/tasks")).json();
  const events = await (await request.get("/api/events")).json();
  expect(projects.some((p: { name: string; deadline: string }) => p.name === `Phase 1.3 project ${suffix}` && p.deadline === captureDate)).toBe(true);
  expect(tasks.some((t: { title: string; plannedDate: string }) => t.title === `Phase 1.3 task ${suffix}` && t.plannedDate === captureDate)).toBe(true);
  expect(events.some((e: { title: string; start: string }) => e.title === `Phase 1.3 event ${suffix}` && e.start === captureDate)).toBe(true);
  expect((await request.get("/api/tasks", { headers: headers(baseURL!) })).status()).toBe(200);
});

test("Home calendar renders real categories and keeps planned dates independent from deadlines", async ({ page, request, baseURL }, info) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  // One record per day in a per-project month so the +N more limit never hides them.
  const month = info.project.name === "mobile" ? "2027-05" : "2027-04";
  const day = (n: number) => `${month}-${n}`;
  const project = await (await request.post("/api/projects", { headers: headers(baseURL!), data: {
    name: `Calendar project ${suffix}`, deadline: day(12), mutationId: crypto.randomUUID(),
  } })).json();
  const task = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: {
    title: `Calendar task ${suffix}`, plannedDate: day(13), dueDate: day(20), mutationId: crypto.randomUUID(),
  } })).json();
  const deadlineTask = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: {
    title: `Deadline task ${suffix}`, dueDate: day(14), mutationId: crypto.randomUUID(),
  } })).json();
  const event = await (await request.post("/api/events", { headers: headers(baseURL!), data: {
    title: `Calendar event ${suffix}`, allDay: true, start: day(15), end: day(16),
    timezone: "Asia/Jakarta", mutationId: crypto.randomUUID(),
  } })).json();
  await page.goto(`/?date=${day(13)}`);
  await expect(page.locator(`[data-calendar-record="planned:${task.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="task:${deadlineTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="project:${project.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="event:${event.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="planned:${task.id}"]`)).toHaveAttribute("aria-label", new RegExp("Planned work"));
  await expect(page.locator(`[data-calendar-record="task:${deadlineTask.id}"]`)).toHaveAttribute("aria-label", new RegExp("Task deadline"));

  await page.locator(`[data-calendar-record="planned:${task.id}"]`).click();
  const details = page.getByRole("dialog", { name: "Task details", exact: true });
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Edit task", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit task", exact: true });
  await expect(editor.getByLabel("Planned work date", { exact: true })).toHaveValue(day(13));
  await expect(editor.getByLabel("Due date", { exact: true })).toHaveValue(day(20));
  await editor.getByLabel("Planned work date", { exact: true }).fill(day(22));
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Task details", exact: true })).toBeVisible();
  expect((await (await request.get(`/api/tasks/${task.id}`)).json())).toMatchObject({ plannedDate: day(22), dueDate: day(20) });
});


async function homeDrag(page: Page, record: string, date: string, confirm = true) {
  const source = page.locator(`[data-calendar-record="${record}"]`).first();
  await source.scrollIntoViewIfNeeded();
  const start = await source.boundingBox();
  const target = await page.locator(`.home-calendar [data-date="${date}"]`).first().boundingBox();
  expect(start).not.toBeNull(); expect(target).not.toBeNull();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(start!.x + start!.width / 2 + 15, start!.y + start!.height / 2, { steps: 5 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height - 8, { steps: 20 });
  await page.mouse.up();
  if (confirm) await page.getByRole("alertdialog").getByRole("button", { name: "Reschedule", exact: true }).click();
}

test("Home drag moves planned work and deadlines, changing only the dragged date", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name === "mobile", "Pointer drag path; touch users edit dates in the task form.");
  const suffix = crypto.randomUUID().slice(0, 6), h = headers(baseURL!);
  const project = await (await request.post("/api/projects", { headers: h, data: { name: `Drag home project ${suffix}`, mutationId: crypto.randomUUID() } })).json();
  const planned = await (await request.post("/api/tasks", { headers: h, data: {
    title: `Planned drag ${suffix}`, plannedDate: "2027-06-08", dueDate: "2027-06-24", projectId: project.id, important: true, urgent: true, mutationId: crypto.randomUUID(),
  } })).json();
  const dated = await (await request.post("/api/tasks", { headers: h, data: {
    title: `Dated deadline ${suffix}`, dueDate: "2027-06-15", plannedDate: "2027-06-01", mutationId: crypto.randomUUID(),
  } })).json();
  const timed = await (await request.post("/api/tasks", { headers: h, data: {
    title: `Timed deadline ${suffix}`, dueAt: "2027-06-09T14:30:00.000Z", timezone: "America/New_York", mutationId: crypto.randomUUID(),
  } })).json();
  const pick = (t: Record<string, unknown>) => ({ plannedDate: t.plannedDate, dueDate: t.dueDate, dueAt: t.dueAt, timezone: t.timezone, status: t.status, important: t.important, urgent: t.urgent, projectId: t.projectId });
  const get = async (id: string) => (await request.get(`/api/tasks/${id}`)).json();
  await page.goto("/?date=2027-06-15");

  await homeDrag(page, `planned:${planned.id}`, "2027-06-10");
  await expect.poll(async () => (await get(planned.id)).plannedDate).toBe("2027-06-10");
  expect(pick(await get(planned.id))).toEqual({ ...pick(planned), plannedDate: "2027-06-10" });

  await homeDrag(page, `task:${dated.id}`, "2027-06-17");
  await expect.poll(async () => (await get(dated.id)).dueDate).toBe("2027-06-17");
  expect(pick(await get(dated.id))).toEqual({ ...pick(dated), dueDate: "2027-06-17" });

  await homeDrag(page, `task:${timed.id}`, "2027-06-11");
  await expect.poll(async () => (await get(timed.id)).dueAt).toBe("2027-06-11T14:30:00.000Z");
  expect(pick(await get(timed.id))).toEqual({ ...pick(timed), dueAt: "2027-06-11T14:30:00.000Z" });
});

test("Home stale drag shows the conflict, rolls back, and keeps the server value", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name === "mobile", "Pointer drag path.");
  const h = headers(baseURL!);
  const task = await (await request.post("/api/tasks", { headers: h, data: { title: `Stale drag ${crypto.randomUUID().slice(0, 6)}`, plannedDate: "2027-07-07", mutationId: crypto.randomUUID() } })).json();
  await page.goto("/?date=2027-07-07");
  await expect(page.locator(`.home-calendar [data-date="2027-07-07"] [data-calendar-record="planned:${task.id}"]`)).toBeVisible();
  const changed = await (await request.patch(`/api/tasks/${task.id}`, { headers: h, data: { title: `${task.title} changed`, expectedRevision: task.revision, mutationId: crypto.randomUUID() } })).json();
  await homeDrag(page, `planned:${task.id}`, "2027-07-09");
  await expect(page.getByRole("alert").filter({ hasText: "Task changed" })).toBeVisible();
  await expect(page.locator(`.home-calendar [data-date="2027-07-07"] [data-calendar-record="planned:${task.id}"]`)).toBeVisible();
  expect(await (await request.get(`/api/tasks/${task.id}`)).json()).toMatchObject({ plannedDate: "2027-07-07", revision: changed.revision });
});

test("Home crowded date shows a keyboard-reachable +N more popover", async ({ page, request, baseURL }, info) => {
  const day = info.project.name === "mobile" ? "2027-08-19" : "2027-08-18";
  for (let i = 0; i < 9; i++) await request.post("/api/tasks", { headers: headers(baseURL!), data: { title: `Crowd ${i} ${crypto.randomUUID().slice(0, 4)}`, plannedDate: day, mutationId: crypto.randomUUID() } });
  await page.goto(`/?date=${day}`);
  const more = page.locator(`.home-calendar [data-date="${day}"] :is(a, button, [role=button], [role=link], [tabindex])`).filter({ hasText: /^\+\d+ more$/ }).first();
  await expect(more).toBeVisible();
  await more.focus();
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  const popover = page.locator(".fc-popover, [role=dialog]").filter({ has: page.locator("[data-calendar-record]") }).first();
  await expect(popover).toBeVisible();
  const item = popover.locator("[data-calendar-record]").first();
  await item.focus();
  await expect(item).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

test("Home day capture button selects the capture date by keyboard", async ({ page }, info) => {
  const day = info.project.name === "mobile" ? "2027-09-23" : "2027-09-22";
  await page.goto(`/?date=${day}`);
  const button = page.getByRole("link", { name: `Capture on ${Number(day.slice(8))} September 2027`, exact: true });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".quick-capture-card").getByLabel("Planned work date", { exact: true })).toHaveValue(day);
  await expect(page.locator(".home-calendar-help")).toBeVisible();
});

test("Home month navigation changes the title and highlights today", async ({ page }) => {
  await page.goto("/");
  const title = page.locator(".home-calendar h2");
  await expect(title).toHaveText(/^\w+ \d{4}$/);
  const current = await title.textContent();
  await expect(page.locator(".home-calendar .calendar-today")).toBeVisible();
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(title).not.toHaveText(current!);
  const next = await title.textContent();
  await page.getByRole("button", { name: "Previous period", exact: true }).click();
  await expect(title).toHaveText(current!);
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(title).toHaveText(next!);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(title).toHaveText(current!);
});
