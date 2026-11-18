import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";

const headers = (origin: string) => ({ origin });
const monthDate = "2027-03-15";
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
// v3: planned work is an all-day event linked to the task.
const plan = async (request: APIRequestContext, origin: string, taskId: string, date: string) => (await request.post("/api/events", { headers: headers(origin), data: {
  title: "Plan", taskId, allDay: true, start: date, end: nextDay(date), timezone: "UTC", mutationId: crypto.randomUUID(),
} })).json();

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
  // The title is set by datesSet on the client, so a non-empty title proves the calendar is mounted.
  await expect(page.locator(".home-calendar .calendar-controls h2")).not.toBeEmpty();
  const capture = page.locator(".quick-capture-card input[name=title]");
  await page.getByLabel("Capture type", { exact: true }).selectOption("project");
  const dateInput = page.locator(".quick-capture-card").getByLabel("Deadline", { exact: true });
  await expect(async () => {
    await page.locator(`.home-calendar [data-date="${captureDate}"] .calendar-day-capture`).click();
    await expect(dateInput).toHaveValue(captureDate, { timeout: 2_000 });
  }).toPass();
  await capture.fill(`Phase 1.3 project ${suffix}`);
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
  expect(tasks.some((t: { title: string }) => t.title === `Phase 1.3 task ${suffix}`)).toBe(true);
  expect(events.some((e: { title: string; start: string }) => e.title === `Phase 1.3 event ${suffix}` && e.start === captureDate)).toBe(true);
  expect((await request.get("/api/tasks", { headers: headers(baseURL!) })).status()).toBe(200);
});

test("Home date click keeps a typed draft", async ({ page, request }, info) => {
  const title = `Draft kept ${crypto.randomUUID().slice(0, 6)}`;
  const captureDate = info.project.name === "mobile" ? "2027-03-25" : "2027-03-18";
  await page.goto(`/?date=${monthDate}`);
  if (info.project.name === "mobile") await page.locator(".home-calendar .calendar-frame").evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect(page.locator(".home-calendar .calendar-controls h2")).not.toBeEmpty();
  const capture = page.locator(".quick-capture-card input[name=title]");
  await capture.fill(title);
  await expect(async () => {
    await page.locator(`.home-calendar [data-date="${captureDate}"] .calendar-day-capture`).click();
    await expect(page).toHaveURL(new RegExp(`captureDate=${captureDate}`), { timeout: 2_000 });
  }).toPass();
  await expect(capture).toHaveValue(title);
  await page.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(page.getByText("Task captured.", { exact: true })).toBeVisible();
  const tasks: { title: string }[] = await (await request.get("/api/tasks")).json();
  expect(tasks.filter((task) => task.title === title)).toHaveLength(1);
});

test("Home calendar renders real categories and keeps linked planned events independent from deadlines", async ({ page, request, baseURL }, info) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  // One record per day in a per-project month so the +N more limit never hides them.
  const month = info.project.name === "mobile" ? "2027-05" : "2027-04";
  const day = (n: number) => `${month}-${n}`;
  const project = await (await request.post("/api/projects", { headers: headers(baseURL!), data: {
    name: `Calendar project ${suffix}`, deadline: day(12), mutationId: crypto.randomUUID(),
  } })).json();
  const task = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: {
    title: `Calendar task ${suffix}`, dueDate: day(20), mutationId: crypto.randomUUID(),
  } })).json();
  const planned = await plan(request, baseURL!, task.id, day(13));
  const deadlineTask = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: {
    title: `Deadline task ${suffix}`, dueDate: day(14), mutationId: crypto.randomUUID(),
  } })).json();
  const event = await (await request.post("/api/events", { headers: headers(baseURL!), data: {
    title: `Calendar event ${suffix}`, allDay: true, start: day(15), end: day(16),
    timezone: "Asia/Jakarta", mutationId: crypto.randomUUID(),
  } })).json();
  await page.goto(`/?date=${day(13)}`);
  await expect(page.locator(`[data-calendar-record="event:${planned.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="task:${deadlineTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="project:${project.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="event:${event.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-calendar-record="task:${deadlineTask.id}"]`)).toHaveAttribute("aria-label", new RegExp("Task deadline"));

  await page.locator(`[data-calendar-record="task:${task.id}"]`).click();
  const details = page.getByRole("dialog", { name: "Task details", exact: true });
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Edit task", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit task", exact: true });
  await expect(editor.getByLabel("Due date", { exact: true })).toHaveValue(day(20));
  await editor.getByLabel("Due date", { exact: true }).fill(day(22));
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Task details", exact: true })).toBeVisible();
  expect((await (await request.get(`/api/tasks/${task.id}`)).json())).toMatchObject({ dueDate: day(22) });
  expect((await (await request.get(`/api/events/${planned.id}`)).json())).toMatchObject({ start: day(13), taskId: task.id });
});


async function tabTo(page: Page, target: Locator, max = 150) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Target was not reached by Tab traversal.");
}

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

test("Home drag moves deadlines, changing only the dragged date", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name === "mobile", "Pointer drag path; touch users edit dates in the task form.");
  const suffix = crypto.randomUUID().slice(0, 6), h = headers(baseURL!);
  const project = await (await request.post("/api/projects", { headers: h, data: { name: `Drag home project ${suffix}`, mutationId: crypto.randomUUID() } })).json();
  const dated = await (await request.post("/api/tasks", { headers: h, data: {
    title: `Dated deadline ${suffix}`, dueDate: "2027-06-15", projectId: project.id, important: true, mutationId: crypto.randomUUID(),
  } })).json();
  const timed = await (await request.post("/api/tasks", { headers: h, data: {
    title: `Timed deadline ${suffix}`, dueAt: "2027-06-09T14:30:00.000Z", timezone: "America/New_York", mutationId: crypto.randomUUID(),
  } })).json();
  const pick = (t: Record<string, unknown>) => ({ dueDate: t.dueDate, dueAt: t.dueAt, timezone: t.timezone, status: t.status, important: t.important, projectId: t.projectId });
  const get = async (id: string) => (await request.get(`/api/tasks/${id}`)).json();
  await page.goto("/?date=2027-06-15");

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
  const task = await (await request.post("/api/tasks", { headers: h, data: { title: `Stale drag ${crypto.randomUUID().slice(0, 6)}`, dueDate: "2027-07-07", mutationId: crypto.randomUUID() } })).json();
  await page.goto("/?date=2027-07-07");
  await expect(page.locator(`.home-calendar [data-date="2027-07-07"] [data-calendar-record="task:${task.id}"]`)).toBeVisible();
  const changed = await (await request.patch(`/api/tasks/${task.id}`, { headers: h, data: { title: `${task.title} changed`, expectedRevision: task.revision, mutationId: crypto.randomUUID() } })).json();
  await homeDrag(page, `task:${task.id}`, "2027-07-09");
  await expect(page.getByRole("alert").filter({ hasText: "Task changed" })).toBeVisible();
  await expect(page.locator(`.home-calendar [data-date="2027-07-07"] [data-calendar-record="task:${task.id}"]`)).toBeVisible();
  expect(await (await request.get(`/api/tasks/${task.id}`)).json()).toMatchObject({ dueDate: "2027-07-07", revision: changed.revision });
});

test("Home crowded date shows a keyboard-reachable +N more popover", async ({ page, request, baseURL }, info) => {
  const day = info.project.name === "mobile" ? "2027-08-19" : "2027-08-18";
  for (let i = 0; i < 9; i++) await request.post("/api/tasks", { headers: headers(baseURL!), data: { title: `Crowd ${i} ${crypto.randomUUID().slice(0, 4)}`, dueDate: day, mutationId: crypto.randomUUID() } });
  await page.goto(`/?date=${day}`);
  const more = page.locator(`.home-calendar [data-date="${day}"] :is(a, button, [role=button], [role=link], [tabindex])`).filter({ hasText: /^\+\d+ more$/ }).first();
  await expect(more).toBeVisible();
  await page.locator(".home-calendar").getByRole("button", { name: "Today", exact: true }).focus();
  await tabTo(page, more);
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  const popover = page.locator(".fc-popover, [role=dialog]").filter({ has: page.locator("[data-calendar-record]") }).first();
  await expect(popover).toBeVisible();
  const item = popover.locator("[data-calendar-record]").first();
  await tabTo(page, item, 20);
  await expect(item).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

test("Home day capture button selects the capture date by keyboard", async ({ page }, info) => {
  const day = info.project.name === "mobile" ? "2027-09-23" : "2027-09-22";
  await page.goto(`/?date=${day}`);
  const label = `${Number(day.slice(8))} September 2027`;
  // Tasks take no date, so the hint offers a capture date only for types that use one.
  await expect(page.getByRole("link", { name: `Go to ${label}`, exact: true })).toBeAttached();
  await page.getByLabel("Capture type", { exact: true }).selectOption("project");
  const button = page.getByRole("link", { name: `Capture on ${Number(day.slice(8))} September 2027`, exact: true });
  await page.locator(".home-calendar").getByRole("button", { name: "Today", exact: true }).focus();
  await tabTo(page, button);
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`captureDate=${day}`));
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
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

async function todayInWorkspace(request: APIRequestContext) {
  const { timezone } = await (await request.get("/api/preferences")).json();
  const ymd = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offset * 86_400_000));
  return { today: ymd(0), yesterday: ymd(-1) };
}

async function openPalette(page: Page, mobile: boolean) {
  void mobile;
  await page.getByRole("button", { name: "Search and commands" }).first().click();
  return page.getByRole("dialog", { name: "Search and commands", exact: true });
}

const noPageScroll = (page: Page) => page.evaluate(() => ({
  horizontal: document.documentElement.scrollWidth <= innerWidth,
  vertical: document.scrollingElement!.scrollHeight <= innerHeight,
}));

test("Home desktop and tablet geometry: 45/55 columns, single column below 1100px, no page scroll", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop and tablet viewports; mobile is covered separately.");
  for (const size of [{ width: 1440, height: 900 }, { width: 1366, height: 700 }]) {
    await page.setViewportSize(size);
    await page.goto(`/?date=${monthDate}`);
    await expect(page.locator(`.home-calendar [data-date="${monthDate}"]`)).toBeVisible();
    const workbench = (await page.locator(".home-workbench").boundingBox())!;
    const left = (await page.locator(".today-card").boundingBox())!;
    const calendar = (await page.locator(".home-calendar").boundingBox())!;
    expect(Math.abs((await page.locator(".quick-capture-card").boundingBox())!.y - calendar.y)).toBeLessThan(2);
    const ratio = left.width / workbench.width;
    expect(ratio).toBeGreaterThan(0.4); expect(ratio).toBeLessThan(0.5);
    expect(calendar.x).toBeGreaterThan(left.x + left.width);
    expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true });
  }
  for (const size of [{ width: 1024, height: 768 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(size);
    await page.goto(`/?date=${monthDate}`);
    await expect(page.locator(`.home-calendar [data-date="${monthDate}"]`)).toBeVisible();
    const capture = (await page.locator(".quick-capture-card").boundingBox())!;
    const today = (await page.locator(".today-card").boundingBox())!;
    const calendar = (await page.locator(".home-calendar").boundingBox())!;
    expect(today.y).toBeGreaterThan(capture.y + capture.height - 1);
    expect(calendar.y).toBeGreaterThan(today.y + today.height - 1);
    expect(Math.abs(calendar.width - today.width)).toBeLessThan(2);
    await expect(page.getByRole("heading", { name: "Today's tasks", exact: true })).toBeInViewport();
    await expect(page.locator(".home-calendar .calendar-controls")).toBeInViewport();
    const cell = (await page.locator(`.home-calendar [data-date="${monthDate}"]`).boundingBox())!;
    expect(cell.width).toBeGreaterThan(60); expect(cell.height).toBeGreaterThan(20);
    expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true });
  }
});

test("Home mobile stacks Capture, Today, Calendar without overflow", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "390x844 mobile layout.");
  await page.goto(`/?date=${monthDate}`);
  await expect(page.locator(`.home-calendar [data-date="${monthDate}"]`)).toBeAttached();
  const ys = await Promise.all([".quick-capture-card", ".today-card", ".home-calendar"].map(async (s) => (await page.locator(s).boundingBox())!.y));
  expect(ys[0]).toBeLessThan(ys[1]); expect(ys[1]).toBeLessThan(ys[2]);
  expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true });
});

test("Other routes still scroll when content is taller than the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto("/settings");
  const scrolled = await page.evaluate(() => {
    for (const el of [document.scrollingElement!, document.querySelector(".workspace-main")!]) { el.scrollTop = 200; if (el.scrollTop > 0) return true; }
    return false;
  });
  expect(scrolled).toBe(true);
});

test("Today groups overdue and current-day work, completes inline, and updates connected views", async ({ page, request, baseURL }, info) => {
  const s = `${info.project.name.slice(0, 1)}${crypto.randomUUID().slice(0, 6)}`, h = headers(baseURL!);
  const { today, yesterday } = await todayInWorkspace(request);
  const make = async (data: Record<string, unknown>) => (await request.post("/api/tasks", { headers: h, data: { ...data, mutationId: crypto.randomUUID() } })).json();
  const project = await (await request.post("/api/projects", { headers: h, data: { name: `Today project ${s}`, mutationId: crypto.randomUUID() } })).json();
  await make({ title: `Overdue ${s}`, dueDate: yesterday, important: true });
  const planned = await make({ title: `Planned today ${s}`, projectId: project.id });
  await plan(request, baseURL!, planned.id, today);
  await make({ title: `Due today ${s}`, dueDate: today, projectId: project.id });
  await plan(request, baseURL!, (await make({ title: `Both today ${s}`, dueDate: today })).id, today);
  const done = await make({ title: `Done today ${s}` });
  await plan(request, baseURL!, done.id, today);
  await request.patch(`/api/tasks/${done.id}`, { headers: h, data: { status: "Done", expectedRevision: done.revision, mutationId: crypto.randomUUID() } });
  await plan(request, baseURL!, (await make({ title: `Past planned ${s}` })).id, yesterday);

  await page.goto("/");
  const card = page.locator(".today-card");
  const overdueGroup = card.getByRole("region", { name: "Overdue", exact: true });
  const todayGroup = card.getByRole("region", { name: "Planned and due today", exact: true });
  const row = (group: Locator, title: string) => group.locator("li").filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await expect(row(overdueGroup, `Overdue ${s}`)).toContainText("Inbox");
  await expect(card.getByRole("link", { name: `Past planned ${s}`, exact: true })).toHaveCount(0);
  for (const title of [`Planned today ${s}`, `Due today ${s}`, `Done today ${s}`]) await expect(row(todayGroup, title)).toBeVisible();
  await expect(card.getByRole("link", { name: `Both today ${s}`, exact: true })).toHaveCount(1);
  await expect(row(todayGroup, `Planned today ${s}`)).toContainText(`Today project ${s}`);
  await expect(row(todayGroup, `Done today ${s}`).getByLabel("Completed")).toBeVisible();

  const progress = card.locator(".progress-count");
  const [doneBefore, total] = (await progress.textContent())!.match(/^(\d+)\/(\d+) complete$/)!.slice(1).map(Number);
  expect(doneBefore).toBeGreaterThanOrEqual(1); expect(total).toBeGreaterThanOrEqual(4);
  expect(total).toBe(await todayGroup.locator("li").count());
  const overdueCount = Number(await overdueGroup.locator(".badge").textContent());
  expect(overdueCount).toBeGreaterThanOrEqual(1);

  await row(todayGroup, `Planned today ${s}`).getByRole("button", { name: `Complete Planned today ${s}`, exact: true }).click();
  await expect(progress).toHaveText(`${doneBefore + 1}/${total} complete`);
  await expect(row(todayGroup, `Planned today ${s}`).getByLabel("Completed")).toBeVisible();
  expect(Number(await overdueGroup.locator(".badge").textContent())).toBe(overdueCount);
  expect((await (await request.get(`/api/tasks/${planned.id}`)).json()).status).toBe("Done");

  const palette = await openPalette(page, info.project.name === "mobile");
  await palette.getByLabel("Search workspace").fill(`Planned today ${s}`);
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await expect(palette.getByRole("link", { name: `Planned today ${s}`, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/projects");
  await expect(page.getByLabel(`Today project ${s} progress`)).toHaveAttribute("value", "50");
});

test("Today shows empty-state copy when nothing is planned, due, or overdue", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: join(process.env.RELAY_TEST_DIR!, "bob.json") });
  try {
    const page = await context.newPage();
    const { today } = await todayInWorkspace(context.request);
    const tasks = await (await context.request.get("/api/tasks")).json() as { dueDate: string | null; dueAt: string | null }[];
    const events = await (await context.request.get("/api/events")).json() as { taskId: string | null }[];
    test.skip(events.some((e) => e.taskId) || tasks.some((t) => (t.dueDate ?? t.dueAt ?? "9999") <= `${today}T23:59`), "Bob already has Today work.");
    await page.goto("/");
    const group = page.locator(".today-card").getByRole("region", { name: "Planned and due today", exact: true });
    await expect(group.getByText("Nothing here yet. Capture a task or plan one on the calendar.", { exact: true })).toBeVisible();
    await expect(page.locator(".today-card .progress-count")).toHaveText("0/0 complete");
  } finally { await context.close(); }
});

test("Quick Capture failure keeps input, shows an inline error, and retries without duplicates", async ({ page, request }, info) => {
  const title = `Retry capture ${info.project.name} ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/");
  let failed = false;
  await page.route("**/api/tasks", async (route) => {
    if (!failed && route.request().method() === "POST") {
      failed = true;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Could not save the task. Try again." }) });
    } else await route.continue();
  });
  const card = page.locator(".quick-capture-card");
  await card.locator("input[name=title]").fill(title);
  await card.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(card.getByRole("alert")).toHaveText("Could not save the task. Try again.");
  await expect(card.locator("input[name=title]")).toHaveValue(title);
  await card.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(page.getByText("Task captured.", { exact: true })).toBeVisible();
  const tasks = await (await request.get("/api/tasks")).json() as { title: string }[];
  expect(tasks.filter((t) => t.title === title)).toHaveLength(1);
});

test("Home calendar items open the task panel, project page, and event panel", async ({ page, request, baseURL }, info) => {
  const s = crypto.randomUUID().slice(0, 6), h = headers(baseURL!);
  const month = info.project.name === "mobile" ? "2027-12" : "2027-11";
  const project = await (await request.post("/api/projects", { headers: h, data: { name: `Click project ${s}`, deadline: `${month}-10`, mutationId: crypto.randomUUID() } })).json();
  const task = await (await request.post("/api/tasks", { headers: h, data: { title: `Click task ${s}`, dueDate: `${month}-11`, mutationId: crypto.randomUUID() } })).json();
  const event = await (await request.post("/api/events", { headers: h, data: { title: `Click event ${s}`, allDay: true, start: `${month}-12`, end: `${month}-13`, timezone: "UTC", mutationId: crypto.randomUUID() } })).json();
  const open = async (record: string) => {
    await page.goto(`/?date=${month}-11`);
    const link = page.locator(`[data-calendar-record="${record}"]`);
    await link.scrollIntoViewIfNeeded();
    await link.click();
  };
  await open(`task:${task.id}`);
  await expect(page.getByRole("dialog", { name: "Task details", exact: true })).toBeVisible();
  await open(`event:${event.id}`);
  await expect(page.getByRole("dialog", { name: "Event details", exact: true })).toBeVisible();
  await open(`project:${project.id}`);
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}`));
  await expect(page.getByRole("heading", { level: 1, name: `Click project ${s}` })).toBeVisible();
});

test("Palette labels a planned-only task date as Planned", async ({ page, request, baseURL }, info) => {
  const title = `Palette planned ${crypto.randomUUID().slice(0, 6)}`;
  const task = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: { title, mutationId: crypto.randomUUID() } })).json();
  await plan(request, baseURL!, task.id, "2027-10-20");
  await page.goto("/");
  const palette = await openPalette(page, info.project.name === "mobile");
  await palette.getByLabel("Search workspace").fill(title);
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await expect(palette.locator("li").filter({ has: page.getByRole("link", { name: title, exact: true }) })).toContainText("task / Planned 2027-10-20");
});

test("Long titles wrap in Today and the calendar without horizontal overflow", async ({ page, request, baseURL }, info) => {
  const { today } = await todayInWorkspace(request);
  const title = `${info.project.name}${"Longwordwithoutbreaks".repeat(10)} ${"wrapped words ".repeat(5)}`.slice(0, 200);
  const day = info.project.name === "mobile" ? "2027-10-27" : "2027-10-26";
  const task = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: { title, dueDate: today, mutationId: crypto.randomUUID() } })).json();
  const later = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: { title, dueDate: day, mutationId: crypto.randomUUID() } })).json();
  expect(task.title).toHaveLength(200);
  await page.goto(`/?date=${day}`);
  await expect(page.locator(`.home-calendar [data-date="${day}"]`)).toBeAttached();
  const row = page.locator(".today-card li").filter({ has: page.locator(`[data-task-link="${task.id}"]`) });
  await expect(row).toBeAttached();
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.locator(".today-card").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const record = page.locator(`[data-calendar-record="task:${later.id}"]`);
  await record.scrollIntoViewIfNeeded();
  await expect(record).toBeVisible();
  await expect.poll(async () => {
    const recordBox = await record.boundingBox(), cellBox = await page.locator(`.home-calendar [data-date="${day}"]`).boundingBox();
    return Boolean(recordBox && cellBox && recordBox.x + recordBox.width <= cellBox.x + cellBox.width + 1);
  }).toBe(true);
  expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true });
});

test("Home renders and captures with reduced motion", async ({ page, request }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's tasks", exact: true })).toBeVisible();
  const title = `Reduced motion ${info.project.name} ${crypto.randomUUID().slice(0, 6)}`;
  await page.locator(".quick-capture-card input[name=title]").fill(title);
  await page.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(page.getByText("Task captured.", { exact: true })).toBeVisible();
  expect((await (await request.get("/api/tasks")).json()).some((t: { title: string }) => t.title === title)).toBe(true);
});

test("Home collapses by available width with the sidebar: no cramped columns at 1280 and 1180", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop viewports with the sidebar.");
  for (const size of [{ width: 1280, height: 800 }, { width: 1180, height: 800 }, { width: 1366, height: 700 }]) {
    await page.setViewportSize(size);
    await page.goto(`/?date=${monthDate}`);
    await expect(page.locator(".home-calendar .calendar-controls h2")).not.toBeEmpty();
    const today = (await page.locator(".today-card").boundingBox())!, calendar = (await page.locator(".home-calendar").boundingBox())!;
    const singleColumn = calendar.y >= today.y + today.height - 1;
    if (!singleColumn) {
      expect((await page.locator(".quick-capture-card input[name=title]").boundingBox())!.width).toBeGreaterThanOrEqual(220);
      expect((await page.locator(`.home-calendar [data-date="${monthDate}"]`).boundingBox())!.width).toBeGreaterThanOrEqual(70);
    } else expect(size.width).toBeLessThan(1366);
    expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true });
  }
});

test("Today focus rings stay inside the scrolling group", async ({ page, request, baseURL }) => {
  const { today } = await todayInWorkspace(request);
  await request.post("/api/tasks", { headers: headers(baseURL!), data: { title: `Focus ring ${crypto.randomUUID().slice(0, 6)}`, dueDate: today, mutationId: crypto.randomUUID() } });
  await page.goto("/");
  const group = page.locator(".today-card").getByRole("region", { name: "Planned and due today", exact: true });
  const button = group.locator(".complete-task").first();
  await expect(button).toBeVisible();
  await button.focus();
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  const fits = async (target: Locator) => target.evaluate((el) => {
    const style = getComputedStyle(el), ring = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    let scroller = el.parentElement!;
    while (getComputedStyle(scroller).overflowY === "visible") scroller = scroller.parentElement!;
    const r = el.getBoundingClientRect(), c = scroller.getBoundingClientRect();
    const left = c.left + scroller.clientLeft, top = c.top + scroller.clientTop;
    return { visible: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
      inside: r.left - ring >= left - 0.5 && r.top - ring >= top - 0.5 && r.right + ring <= left + scroller.clientWidth + 0.5 && r.bottom + ring <= top + scroller.clientHeight + 0.5 };
  });
  await expect(button).toBeFocused();
  expect(await fits(button)).toEqual({ visible: true, inside: true });
  const lastLink = group.locator(".task-title").last();
  await lastLink.focus();
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  await expect(lastLink).toBeFocused();
  expect(await fits(lastLink)).toEqual({ visible: true, inside: true });
});

test("Today inline completion failure shows a full-width error that does not overlap the title", async ({ page, request, baseURL }) => {
  const { today } = await todayInWorkspace(request);
  const title = `Fail complete ${crypto.randomUUID().slice(0, 6)}`;
  const task = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: { title, dueDate: today, mutationId: crypto.randomUUID() } })).json();
  await page.goto("/");
  let failed = false;
  await page.route(`**/api/tasks/${task.id}`, async (route) => {
    if (!failed && route.request().method() === "PATCH") {
      failed = true;
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Task changed. Review the latest version and try again." }) });
    } else await route.continue();
  });
  const row = page.locator(".today-card li").filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await row.getByRole("button", { name: `Complete ${title}`, exact: true }).click();
  const alert = row.getByRole("alert");
  await expect(alert).toHaveText("Task changed. Review the latest version and try again.");
  const a = (await alert.boundingBox())!, t = (await row.getByRole("link", { name: title, exact: true }).boundingBox())!, r = (await row.boundingBox())!;
  expect(a.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  expect(a.width).toBeGreaterThan(r.width * 0.9);
  expect((await (await request.get(`/api/tasks/${task.id}`)).json()).status).not.toBe("Done");
});

test("Short or zoomed Home (1440x450) scrolls the page instead of clipping the calendar", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop zoom equivalent.");
  await page.setViewportSize({ width: 1440, height: 450 });
  await page.goto(`/?date=${monthDate}`);
  const controls = page.locator(".home-calendar .calendar-controls");
  await expect(page.locator(".home-calendar .calendar-controls h2")).not.toBeEmpty();
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight > innerHeight)).toBe(true);
  for (const target of [controls, page.locator(`.home-calendar [data-date="${monthDate}"]`), page.locator(".home-calendar [data-date]").last()]) {
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeInViewport();
  }
  const calendarHeight = (await page.locator(".home-calendar").boundingBox())!.height;
  expect(calendarHeight).toBeGreaterThanOrEqual(400);
  const clipped = await page.evaluate(() => [...document.querySelectorAll(".home-page, .home-workbench, .home-left, .today-card, .home-calendar")]
    .filter((el) => getComputedStyle(el).overflowY === "hidden" && el.scrollHeight > el.clientHeight + 1).map((el) => el.className));
  expect(clipped).toEqual([]);
});
