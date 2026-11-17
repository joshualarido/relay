import { test, expect } from "@playwright/test";
import { join } from "node:path";

test("sidebar owns search and persisted collapse releases content width", async ({ page }, info) => {
  await page.goto("/");
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
    await expect(drawer.getByRole("button", { name: "Search and commands" })).toBeVisible();
    await drawer.getByRole("button", { name: "Search and commands" }).click();
    await expect(page.getByRole("dialog", { name: "Search and commands", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  } else {
    const sidebar = page.locator(".desktop-sidebar");
    const search = sidebar.getByRole("button", { name: "Search and commands" });
    await expect(search).toBeVisible();
    const title = await sidebar.locator(".wordmark").boundingBox();
    const searchBox = await search.boundingBox();
    expect(searchBox!.y).toBeGreaterThan(title!.y + title!.height);
    const before = (await page.locator("main").boundingBox())!.width;
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
    expect((await page.locator("main").boundingBox())!.width).toBeGreaterThan(before + 100);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
    expect(await page.locator(".desktop-sidebar").evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(90);
    await search.click();
    await expect(page.getByRole("dialog", { name: "Search and commands", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Search and commands", exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("settings fills its shell with enclosed cards and Chat has no repeated warnings", async ({ page }, info) => {
  await page.goto("/settings");
  const section = page.locator(".settings-grid > section").first();
  await expect(section).toBeVisible();
  expect(await section.evaluate((el) => ({
    border: parseFloat(getComputedStyle(el).borderLeftWidth),
    radius: parseFloat(getComputedStyle(el).borderRadius),
  }))).toEqual({ border: 1, radius: 14 });
  if (info.project.name === "desktop") {
    expect(await page.locator(".settings-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
  }
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Coming soon", exact: true })).toBeVisible();
  await expect(page.getByText("Assistant availability", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("event rescheduling is an app decision and Cancel preserves saved dates and edited input", async ({ page, request, baseURL }) => {
  const nativeDialogs: string[] = [];
  page.on("dialog", async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  const e = await (await request.post("/api/events", { headers: { origin: baseURL! }, data: {
    title: `App confirmation ${crypto.randomUUID()}`, allDay: true, start: "2027-02-08", end: "2027-02-09",
    timezone: "Asia/Jakarta", mutationId: crypto.randomUUID(),
  } })).json();
  await page.goto(`/calendar?date=2027-02-08&event=${e.id}`);
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Start", { exact: true }).fill("2027-02-10");
  await page.getByLabel("End", { exact: true }).fill("2027-02-11");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Reschedule event?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save event", exact: true })).toBeFocused();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("2027-02-10");
  expect((await (await request.get(`/api/events/${e.id}`)).json()).start).toBe("2027-02-08");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await confirmation.getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit event", exact: true })).toHaveCount(0);
  expect((await (await request.get(`/api/events/${e.id}`)).json()).start).toBe("2027-02-10");
  expect(nativeDialogs).toEqual([]);
});

test("Home creates all three types and detailed Inbox retains matrix classification", async ({ page, request }, info) => {
  const suffix = crypto.randomUUID().slice(0, 6);
  await page.goto("/");
  await expect(page.getByLabel("Quick capture", { exact: true })).toBeVisible();
  // The title label follows the capture type ("Project name", "Event title"), so target the field itself.
  const capture = page.locator(".quick-capture-card input[name=title]");
  await page.getByLabel("Capture type", { exact: true }).selectOption("project");
  await capture.fill(`Home project ${suffix}`);
  await page.getByLabel("Deadline", { exact: true }).fill("2027-04-01");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  const project = (await (await request.get("/api/projects")).json()).find((p: { name: string }) => p.name === `Home project ${suffix}`);
  expect(project).toBeTruthy();
  await page.getByLabel("Capture type", { exact: true }).selectOption("task");
  await capture.fill(`Home task ${suffix}`);
  await page.getByLabel("Planned work date", { exact: true }).fill("2027-04-01");
  await page.getByRole("button", { name: "Capture task", exact: true }).click();
  await page.getByLabel("Capture type", { exact: true }).selectOption("event");
  await capture.fill(`Home event ${suffix}`);
  await page.getByRole("button", { name: "Set event details", exact: true }).click();
  await page.getByLabel("All-day event").check();
  await page.getByLabel("Start", { exact: true }).fill("2027-04-01");
  await page.getByLabel("End", { exact: true }).fill("2027-04-02");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Priority matrix", exact: true }).click();
  await expect(page.getByRole("link", { name: `Home task ${suffix}`, exact: true })).toBeVisible();
  expect((await (await request.get("/api/events")).json()).some((e: { title: string }) => e.title === `Home event ${suffix}`)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/");
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `phase13-home-${info.project.name}.png`), fullPage: true });
});

test("project board previews affected tasks and rejects a stale completion without native dialogs", async ({ page, request, baseURL }) => {
  const headers = { origin: baseURL! }, suffix = crypto.randomUUID();
  const p = await (await request.post("/api/projects", { headers, data: { name: `Preview ${suffix}`, mutationId: crypto.randomUUID() } })).json();
  const t = await (await request.post("/api/tasks", { headers, data: { title: `Blocked child ${suffix}`, status: "Blocked", blockerReason: "Review required", projectId: p.id, mutationId: crypto.randomUUID() } })).json();
  await page.goto("/projects");
  const card = page.getByRole("article", { name: p.name, exact: true });
  await card.getByLabel("Project status").selectOption("Completed");
  const confirm = page.getByRole("alertdialog", { name: "Complete project?", exact: true });
  await expect(confirm).toContainText(t.title);
  await expect(confirm).toContainText("Review required");
  await request.post("/api/tasks", { headers, data: { title: "Added after preview", projectId: p.id, mutationId: crypto.randomUUID() } });
  await confirm.getByRole("button", { name: "Complete project", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /affected records changed/i })).toBeVisible();
  expect((await (await request.get(`/api/projects/${p.id}`)).json()).status).toBe("Planned");
  expect((await (await request.get(`/api/tasks/${t.id}`)).json()).status).toBe("Blocked");
  await card.getByLabel("Project status").selectOption("Completed");
  await confirm.getByRole("button", { name: "Complete project", exact: true }).click();
  await expect(page.getByRole("region", { name: "Completed", exact: true }).getByRole("article", { name: p.name, exact: true })).toBeVisible();
  expect((await (await request.get(`/api/tasks/${t.id}`)).json()).status).toBe("Done");
});

test("Focus gives task text useful width on mobile and short/zoomed layouts do not overflow", async ({ page, request, baseURL }, info) => {
  const title = `Readable focus ${crypto.randomUUID()}`;
  const task = await (await request.post("/api/tasks", { headers: { origin: baseURL! }, data: { title, important: true, urgent: true, mutationId: crypto.randomUUID() } })).json();
  await page.goto(`/inbox?focus=${task.id}`);
  const content = page.getByRole("dialog", { name: "Focus mode", exact: true }).getByRole("heading", { name: title, exact: true });
  const readable = async () => {
    await expect(content).toBeVisible();
    const fit = await content.evaluate((el) => {
      const box = el.closest('[role="dialog"]')!, style = getComputedStyle(box);
      const inner = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { ratio: el.getBoundingClientRect().width / inner, lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) };
    });
    expect(fit.ratio).toBeGreaterThan(0.9);
    expect(fit.lines).toBeLessThanOrEqual(3);
  };
  await readable();
  if (info.project.name === "desktop") {
    for (const [width, height] of [[1366, 768], [720, 450]]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await readable();
      await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `phase12-layout-${width}.png`), fullPage: true });
    }
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("dialog", { name: "Focus mode", exact: true })).toBeVisible();
  }
});

test("search result navigation clears its old matches before the next search", async ({ page, request, baseURL }) => {
  const title = `Fresh palette ${crypto.randomUUID()}`;
  await request.post("/api/tasks", { headers: { origin: baseURL! }, data: { title, mutationId: crypto.randomUUID() } });
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search and commands", exact: true });
  await palette.getByLabel("Search workspace").fill(title);
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await palette.getByRole("link", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Close task details", exact: true }).click();
  await page.getByRole("button", { name: "Search and commands", exact: true }).click();
  await expect(palette.getByRole("link", { name: title, exact: true })).toHaveCount(0);
});

test("matrix persists every quadrant and a rejected classification leaves saved choices intact", async ({ page, request, baseURL }) => {
  const title = `Matrix choices ${crypto.randomUUID()}`;
  const task = await (await request.post("/api/tasks", { headers: { origin: baseURL! },
    data: { title, mutationId: crypto.randomUUID() } })).json();
  const openMatrix = async () => {
    await page.goto("/inbox");
    // Clicks before hydration are ignored, so retry until the client-rendered matrix appears.
    await expect(async () => {
      await page.getByRole("button", { name: "Priority matrix", exact: true }).click();
      await expect(page.getByRole("region", { name: "Unclassified", exact: true })).toBeVisible({ timeout: 1000 });
    }).toPass();
  };
  await openMatrix();
  for (const [important, urgent, quadrant] of [
    ["true", "true", "Do first"], ["true", "false", "Schedule"],
    ["false", "true", "Handle quickly"], ["false", "false", "Reconsider"], ["", "false", "Unclassified"],
  ]) {
    await page.getByLabel(`Important: ${title}`, { exact: true }).selectOption(important);
    await expect(page.getByLabel(`Important: ${title}`, { exact: true })).toHaveValue(important);
    await page.getByLabel(`Urgent: ${title}`, { exact: true }).selectOption(urgent);
    await expect(page.getByLabel(`Urgent: ${title}`, { exact: true })).toHaveValue(urgent);
    await expect(page.getByRole("region", { name: quadrant, exact: true }).getByRole("link", { name: title, exact: true })).toBeVisible();
    await openMatrix();
    await expect(page.getByRole("region", { name: quadrant, exact: true }).getByRole("link", { name: title, exact: true })).toBeVisible();
  }
  await page.route(`**/api/tasks/${task.id}`, (route) => route.fulfill({ status: 409, contentType: "application/json",
    body: JSON.stringify({ error: "Task changed. Reload and try again." }) }));
  await page.getByLabel(`Important: ${title}`, { exact: true }).selectOption("true");
  await expect(page.getByRole("alert").filter({ hasText: "Task changed." })).toBeVisible();
  await expect(page.getByLabel(`Important: ${title}`, { exact: true })).toHaveValue("");
  expect((await (await request.get(`/api/tasks/${task.id}`)).json()).important).toBeNull();
});

test("revised supporting pages retain full-width responsive enclosed surfaces", async ({ page, request, baseURL }, info) => {
  const project = await (await request.post("/api/projects", { headers: { origin: baseURL! },
    data: { name: "Review the whole workspace", description: "Manual work, with room to breathe.", mutationId: crypto.randomUUID() } })).json();
  for (const [route, name] of [
    ["/settings", "settings"], ["/inbox", "inbox"], ["/history", "history"],
    ["/calendar?date=2027-03-15", "calendar"], ["/chat", "chat"], [`/projects/${project.id}`, "project-detail"],
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `phase12-${name}-${info.project.name}.png`), fullPage: true });
  }
});
