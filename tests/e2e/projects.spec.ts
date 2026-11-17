import { test, expect } from "@playwright/test";
import { join } from "node:path";

test("project create/edit/status/archive/delete persists and is owner protected", async ({ page, browser, baseURL }, info) => {
  const name = `Portfolio ${info.project.name} ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/projects");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill(name);
  await page.getByLabel("Description", { exact: true }).fill("A real project");
  const dialogBounds = await page.getByRole("dialog").boundingBox();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.y).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.getByRole("button", { name: "Create project", exact: true }).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === el || (hit !== null && el.contains(hit));
  })).toBe(true);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("0% complete", { exact: true })).toBeVisible();
  const url = new URL(page.url());
  const projectId = url.pathname.split("/").at(-1)!;
  const bob = await browser.newContext({ baseURL, storageState: join(process.env.RELAY_TEST_DIR!, "bob.json") });
  try {
    expect((await bob.request.get(`/api/projects/${projectId}`)).status()).toBe(404);
    expect((await bob.request.patch(`/api/projects/${projectId}`, {
      headers: { origin: baseURL! }, data: { expectedRevision: 1, name: "Stolen", mutationId: crypto.randomUUID() },
    })).status()).toBe(404);
  } finally { await bob.close(); }
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Active");
  await page.getByLabel("Deadline", { exact: true }).fill("2027-02-10");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive project", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unarchive project", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All projects", exact: true }).click();
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Archived projects", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: "Unarchive project", exact: true }).click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete project?" })).toBeVisible();
  await expect(page.getByRole("dialog").getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm soft deletion", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
});

test("project status/order has keyboard alternatives and failed validation preserves input", async ({ page, request }, info) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill(" ");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted fields." })).toBeVisible();
  const name = `Keyboard ${info.project.name} ${crypto.randomUUID().slice(0, 6)}`;
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  const card = page.getByRole("article", { name });
  await expect(card).toBeVisible();
  await card.getByLabel("Project status").selectOption("Paused");
  await expect(page.getByRole("region", { name: "Paused" }).getByRole("article", { name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Paused" }).getByRole("article", { name })).toBeVisible();
  const second = `${name} second`;
  expect((await request.post("/api/projects", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { name: second, status: "Paused", position: 1_000_000, mutationId: crypto.randomUUID() },
  })).ok()).toBe(true);
  await page.reload();
  const paused = page.getByRole("region", { name: "Paused", exact: true });
  const targetIndex = await paused.getByRole("article").count() - 2;
  await paused.getByRole("button", { name: `Move ${second} earlier`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(paused.getByRole("article").nth(targetIndex)).toHaveAttribute("aria-label", second);
  await page.reload();
  await expect(paused.getByRole("article").nth(targetIndex)).toHaveAttribute("aria-label", second);
  await page.getByLabel("Search projects").fill(name);
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("Search projects").fill("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `projects-${info.project.name}.png`), fullPage: true, caret: "initial" });
});

test("project drag moves status and refresh retains it", async ({ page, request }, info) => {
  test.skip(info.project.name === "mobile", "Touch uses the separately tested status/order controls; this scenario checks desktop pointer drag.");
  const name = `Drag ${crypto.randomUUID().slice(0, 6)}`;
  const response = await request.post("/api/projects", { headers: { origin: "http://127.0.0.1:3100" }, data: { name, mutationId: crypto.randomUUID() } });
  expect(response.ok()).toBe(true);
  await page.goto("/projects");
  await page.getByLabel("Search projects").fill(name);
  const handle = page.getByRole("button", { name: `Drag ${name}`, exact: true });
  const start = await handle.boundingBox();
  const target = await page.getByRole("region", { name: "Active", exact: true }).boundingBox();
  await page.mouse.move(start!.x + 12, start!.y + 12);
  await page.mouse.down();
  await page.mouse.move(start!.x + 30, start!.y + 30, { steps: 5 });
  await page.mouse.move(target!.x + 80, target!.y + 90, { steps: 15 });
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, "project-during-drag.png"), caret: "initial" });
  await page.mouse.up();
  await expect(page.getByRole("region", { name: "Active", exact: true }).getByRole("article", { name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Active", exact: true }).getByRole("article", { name })).toBeVisible();
  const project = await response.json();
  const child = await (await request.post("/api/tasks", { headers: { origin: "http://127.0.0.1:3100" },
    data: { title: `Drag child ${name}`, projectId: project.id, mutationId: crypto.randomUUID() } })).json();
  await page.getByLabel("Search projects").fill(name);
  const active = await handle.boundingBox();
  const completed = await page.getByRole("region", { name: "Done", exact: true }).boundingBox();
  await page.mouse.move(active!.x + 12, active!.y + 12);
  await page.mouse.down();
  await page.mouse.move(active!.x + 30, active!.y + 30, { steps: 5 });
  await page.mouse.move(completed!.x + 80, completed!.y + 90, { steps: 15 });
  await page.mouse.up();
  const confirmation = page.getByRole("alertdialog", { name: "Complete project?", exact: true });
  await expect(confirmation).toContainText(child.title);
  // dnd-kit briefly suppresses clicks after a drop; also verify keyboard confirmation.
  await confirmation.getByRole("button", { name: "Complete project", exact: true }).press("Space", { delay: 100 });
  await expect(page.getByRole("region", { name: "Done", exact: true }).getByRole("article", { name })).toBeVisible();
  expect((await (await request.get(`/api/tasks/${child.id}`)).json()).status).toBe("Done");
});
