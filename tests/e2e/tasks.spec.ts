import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test("exact-text Inbox capture, URL details, dates, complete/reopen, reassignment and soft delete", async ({ page, request }) => {
  const title = `  Fix login and write tests ${crypto.randomUUID().slice(0, 6)}  `;
  const p = await (await request.post("/api/projects", { headers: { origin: "http://127.0.0.1:3100" }, data: { name: "Task destination", mutationId: crypto.randomUUID() } })).json();
  const modelCalls: string[] = [];
  page.on("request", (r) => { if (/openai|anthropic|\/api\/chat|\/api\/ai/.test(r.url())) modelCalls.push(r.url()); });
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill(title);
  await page.getByLabel("Effort (minutes)").fill("45");
  await page.getByLabel("Due date", { exact: true }).fill("2027-02-10");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: title.trim(), exact: true }).click();
  await expect(page).toHaveURL(/\?task=/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: title.trim(), exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("task")!;
  expect((await (await request.get(`/api/tasks/${id}`)).json()).title).toBe(title);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByLabel("Task status", { exact: true }).selectOption("Done");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(page.getByText("Completed at", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Reopen task", exact: true }).click();
  await expect(page.getByText("Completed at", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByLabel("Project", { exact: true }).selectOption(p.id);
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByRole("button", { name: "Close task details", exact: true }).click();
  await expect(page.getByRole("link", { name: title.trim(), exact: true })).toHaveCount(0);
  await page.goto(`/projects/${p.id}`);
  await page.getByRole("button", { name: "Task list", exact: true }).click();
  await page.getByRole("link", { name: title.trim(), exact: true }).click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete task?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm soft deletion", exact: true }).click();
  await expect(page.getByRole("link", { name: title.trim(), exact: true })).toHaveCount(0);
  expect(modelCalls).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("missing and foreign task selections show safe not-found, and failed save keeps input", async ({ page, request, browser, baseURL }) => {
  await page.goto("/inbox?task=missing");
  await expect(page.getByRole("dialog").getByText("Task not found.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task details", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill(" ");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted fields." })).toBeVisible();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(" ");
  await page.keyboard.press("Escape");
  const created = await (await request.post("/api/tasks", { headers: { origin: baseURL! }, data: { title: "Private task", mutationId: crypto.randomUUID() } })).json();
  const foreign = await browser.newContext({ baseURL, storageState: join(process.env.RELAY_TEST_DIR!, "bob.json") });
  try {
    expect((await foreign.request.get(`/api/tasks/${created.id}`)).status()).toBe(404);
    expect((await foreign.request.patch(`/api/tasks/${created.id}`, {
      headers: { origin: baseURL! }, data: { expectedRevision: 1, title: "Stolen", mutationId: crypto.randomUUID() },
    })).status()).toBe(404);
    const bobPage = await foreign.newPage();
    await bobPage.goto(`/inbox?task=${created.id}`);
    await expect(bobPage.getByRole("dialog").getByText("Task not found.", { exact: true })).toBeVisible();
    await expect(bobPage.getByText("Private task", { exact: true })).toHaveCount(0);
  }
  finally { await foreign.close(); }
  expect((await request.get("/api/tasks/missing")).status()).toBe(404);
});

test("task status/order controls persist and project completion requires acknowledgement", async ({ page, request, baseURL }, info) => {
  const p = await (await request.post("/api/projects", { headers: { origin: baseURL! }, data: { name: `Manual workflow ${info.project.name}`, mutationId: crypto.randomUUID() } })).json();
  const items = [];
  for (const title of ["First task", "Second task"]) items.push(await (await request.post("/api/tasks", {
    headers: { origin: baseURL! }, data: { title, projectId: p.id, mutationId: crypto.randomUUID() },
  })).json());
  await page.goto(`/projects/${p.id}`);
  const second = page.getByRole("article", { name: "Second task", exact: true });
  await second.getByRole("button", { name: "Move Second task earlier", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "To do", exact: true }).getByRole("article").first()).toHaveAttribute("aria-label", "Second task");
  await page.reload();
  await expect(page.getByRole("region", { name: "To do", exact: true }).getByRole("article").first()).toHaveAttribute("aria-label", "Second task");
  await second.getByLabel("Change task status").selectOption("Done");
  await expect(page.getByText("50% complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Done");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Complete project?" });
  await expect(confirmation).toContainText("1 unfinished task");
  await expect(confirmation).toContainText("First task");
  await confirmation.getByRole("button", { name: "Complete project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await (await request.get(`/api/tasks/${items[0].id}`)).json()).status).toBe("Done");
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `tasks-${info.project.name}.png`), fullPage: true, caret: "initial" });
});

test("desktop task pointer drag persists its new status", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name === "mobile", "Mobile completes status/order with the tested native controls; pointer drag is desktop-specific.");
  const p = await (await request.post("/api/projects", { headers: { origin: baseURL! }, data: { name: "Drag tasks", mutationId: crypto.randomUUID() } })).json();
  await request.post("/api/tasks", { headers: { origin: baseURL! }, data: { title: "Drag this task", projectId: p.id, mutationId: crypto.randomUUID() } });
  await page.goto(`/projects/${p.id}`);
  const handle = page.getByRole("button", { name: "Drag Drag this task", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  const target = await page.getByRole("region", { name: "Doing", exact: true }).boundingBox();
  await page.mouse.move(start!.x + 12, start!.y + 12);
  await page.mouse.down();
  await page.mouse.move(start!.x + 30, start!.y + 30, { steps: 5 });
  await page.mouse.move(target!.x + 70, target!.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole("region", { name: "Doing", exact: true }).getByRole("article", { name: "Drag this task" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Doing", exact: true }).getByRole("article", { name: "Drag this task" })).toBeVisible();
});

test("timed date filters use the deadline zone", async ({ page, request, baseURL }) => {
  const title = `Midnight ${crypto.randomUUID().slice(0, 6)}`;
  await request.post("/api/tasks", {
    headers: { origin: baseURL! }, data: { title, dueAt: "2027-01-01T18:00:00Z", timezone: "Asia/Jakarta", mutationId: crypto.randomUUID() },
  });
  await page.goto("/inbox");
  await page.getByLabel("Search tasks", { exact: true }).fill(title);
  await page.getByLabel("Filter planned or due date", { exact: true }).fill("2027-01-02");
  await expect(page.getByRole("article", { name: title, exact: true })).toBeVisible();
  await page.getByLabel("Filter planned or due date", { exact: true }).fill("2027-01-01");
  await expect(page.getByRole("article", { name: title, exact: true })).toHaveCount(0);
});

test("Escape restores task-link focus", async ({ page, request, baseURL }) => {
  const title = `Focus return ${crypto.randomUUID().slice(0, 6)}`;
  await request.post("/api/tasks", { headers: { origin: baseURL! }, data: { title, mutationId: crypto.randomUUID() } });
  await page.goto("/inbox");
  const link = page.getByRole("link", { name: title, exact: true });
  await link.click();
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(link).toBeFocused();
});
