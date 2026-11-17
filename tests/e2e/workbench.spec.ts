import { test, expect } from "@playwright/test";

test("manual Home capture, search/palette and Focus persist without AI", async ({ page, request }, info) => {
  const errors: string[] = [], ai: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (r) => { if (/\/api\/chat|\/api\/ai|openai|anthropic/.test(r.url())) ai.push(r.url()); });
  const title = `Manual capture ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/");
  await page.getByLabel("Quick capture", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add task", exact: true })).toHaveCount(0);
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Search and commands" }).click();
  else await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search and commands", exact: true });
  await expect(palette).toBeVisible();
  await palette.getByLabel("Search workspace").fill(title);
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await palette.getByRole("link", { name: title, exact: true }).click();
  const details = page.getByRole("dialog", { name: "Task details", exact: true });
  await expect(details).toBeVisible();
  const countBefore = (await (await request.get("/api/tasks")).json()).length;
  await page.reload();
  await details.getByRole("button", { name: "Focus on this task" }).click();
  const focus = page.getByRole("dialog", { name: "Focus mode", exact: true });
  await expect(focus).toBeVisible();
  await expect(page).toHaveURL(/\?focus=/);
  await page.reload();
  await expect(focus).toBeVisible();
  await focus.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByLabel("Task status", { exact: true }).selectOption("Done");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(focus.getByText(/Completed at/)).toBeVisible();
  expect((await (await request.get("/api/tasks")).json()).length).toBe(countBefore);
  expect(ai).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${process.env.RELAY_TEST_DIR}/focus-${info.project.name}.png`, caret: "initial" });
});

test("manual completion updates project progress, Home, calendar and filtered search", async ({ page, request, baseURL }) => {
  const headers = { origin: baseURL! }, suffix = crypto.randomUUID().slice(0, 6);
  const p = await (await request.post("/api/projects", { headers, data: { name: `Integrated ${suffix}`, status: "Active", mutationId: crypto.randomUUID() } })).json();
  const t = await (await request.post("/api/tasks", { headers, data: { title: `Integrated task ${suffix}`, projectId: p.id, dueDate: "2027-03-15", important: true, mutationId: crypto.randomUUID() } })).json();
  await page.goto(`/projects/${p.id}?task=${t.id}`);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByLabel("Task status", { exact: true }).selectOption("Done");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByText(/Completed at/)).toBeVisible();
  await page.getByRole("button", { name: "Close task details" }).click();
  await expect(page.getByText("100% complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent activity", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Search and commands" }).click();
  const palette = page.getByRole("dialog", { name: "Search and commands", exact: true });
  await palette.getByLabel("Search workspace").fill(t.title);
  await palette.getByLabel("Status", { exact: true }).selectOption("Done");
  await palette.getByLabel("Important", { exact: true }).selectOption("true");
  await palette.getByLabel("Project", { exact: true }).selectOption(p.id);
  await palette.getByLabel("Deadline or planned date").fill("2027-03-15");
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await expect(palette.getByRole("link", { name: t.title, exact: true })).toBeVisible();
  await palette.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await page.goto("/projects");
  await expect(page.getByRole("article", { name: p.name, exact: true }).getByText("100% complete", { exact: true })).toBeVisible();
  await page.goto(`/calendar?date=2027-03-15&task=${t.id}`);
  await expect(page.getByRole("dialog", { name: "Task details", exact: true }).getByText("Done / Important", { exact: true })).toBeVisible();
});

test("palette capture cancels an older pending search instead of restoring stale results", async ({ page, request, baseURL }) => {
  const title = `Delayed search ${crypto.randomUUID()}`;
  await request.post("/api/tasks", { headers: { origin: baseURL! }, data: { title, mutationId: crypto.randomUUID() } });
  let release!: () => void, finished!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }), settled = new Promise<void>((resolve) => { finished = resolve; });
  await page.route("**/api/search?**", async (route) => {
    const response = await route.fetch();
    await gate;
    try { await route.fulfill({ response }); } finally { finished(); }
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Search and commands" }).click();
    const palette = page.getByRole("dialog", { name: "Search and commands", exact: true });
    await palette.getByLabel("Search workspace").fill(title);
    await palette.getByRole("button", { name: "Search", exact: true }).click();
    await expect(palette.getByRole("button", { name: "Searching...", exact: true })).toBeDisabled();
    await palette.getByLabel("Quick capture", { exact: true }).fill(`${title} captured`);
    await palette.getByRole("button", { name: "Capture task", exact: true }).click();
    await expect(palette.getByText("Task captured.", { exact: true })).toBeVisible();
    release(); await settled;
    await expect(palette.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
    await expect(palette.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  } finally { release(); await page.unroute("**/api/search?**"); }
});

test("search reopens without stale results", async ({ page, request, baseURL }) => {
  const headers = { origin: baseURL! };
  const p = await (await request.post("/api/projects", { headers, data: { name: `Search project ${crypto.randomUUID().slice(0, 6)}`, mutationId: crypto.randomUUID() } })).json();
  await page.goto(`/projects/${p.id}`);
  await page.getByRole("button", { name: "Search and commands" }).click();
  const palette = page.getByRole("dialog", { name: "Search and commands", exact: true });
  await palette.getByLabel("Search workspace").fill(p.name);
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await expect(palette.getByRole("link", { name: p.name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Search and commands" }).click();
  await expect(palette.getByRole("link", { name: p.name, exact: true })).toHaveCount(0);
});

test("pending capture cannot be dismissed before a failed save", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const url = "**/api/tasks";
    await page.route(url, async (route) => {
      await gate;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary failure; try again." }) });
    });
    try {
      await page.goto("/");
      await page.getByRole("button", { name: "Search and commands" }).click();
      const dialog = page.getByRole("dialog", { name: "Search and commands", exact: true });
      const input = dialog.getByLabel("Quick capture", { exact: true });
      await input.fill("Keep this unsaved text");
      await dialog.getByRole("button", { name: "Capture task", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
      await expect(input).not.toBeEditable();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Control+k");
      await dialog.getByRole("link", { name: "Projects", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(dialog).toBeVisible();
      release();
      await expect(dialog.getByRole("alert")).toContainText("Temporary failure");
      await expect(input).toHaveValue("Keep this unsaved text");
    } finally { release(); await page.unroute(url); }
});
