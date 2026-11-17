import { test, expect } from "@playwright/test";
import { join } from "node:path";

test("toast Undo and persistent history restore exact cascades without reviving older deletions", async ({ page, request, browser, baseURL }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const headers = { origin: baseURL! }, name = `Recover ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/");
  await page.getByLabel("Quick capture", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Capture task", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Change undone.", { exact: true })).toBeVisible();
  expect((await (await request.get("/api/tasks")).json()).some((t: { title: string }) => t.title === name)).toBe(false);
  const p = await (await request.post("/api/projects", { headers, data: { name, mutationId: crypto.randomUUID() } })).json();
  const t = await (await request.post("/api/tasks", { headers, data: { title: `${name} child`, projectId: p.id, mutationId: crypto.randomUUID() } })).json();
  const childEvent = async (title: string, taskId?: string) => (await request.post("/api/events", { headers, data: {
    title, taskId, start: "2027-03-15", end: "2027-03-16", allDay: true, timezone: "Asia/Jakarta", mutationId: crypto.randomUUID(),
  } })).json();
  const older = await childEvent(`${name} older`, t.id), linked = await childEvent(`${name} linked`, t.id), independent = await childEvent(`${name} independent`);
  const oldPreview = await (await request.get(`/api/events/${older.id}/deletion`)).json();
  await request.post(`/api/events/${older.id}/deletion`, { headers, data: { ...oldPreview, mutationId: crypto.randomUUID() } });
  await page.goto(`/projects/${p.id}`);
  await page.getByLabel("Check-in", { exact: true }).fill(`${name} note`);
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(page.getByText(`${name} note`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete project?" }).getByText(`${name} linked`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm soft deletion", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect((await request.get(`/api/events/${independent.id}`)).status()).toBe(200);
  await page.goto("/history");
  await page.getByLabel("History view").selectOption("deleted");
  const row = page.getByRole("article", { name: `soft-delete project: ${name}`, exact: true });
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(row.getByText("Recovered", { exact: true })).toBeVisible();
  await page.reload();
  expect((await request.get(`/api/tasks/${t.id}`)).status()).toBe(200);
  expect((await request.get(`/api/events/${linked.id}`)).status()).toBe(200);
  expect((await request.get(`/api/events/${older.id}`)).status()).toBe(404);
  await page.goto(`/projects/${p.id}`);
  await expect(page.getByText(`${name} note`, { exact: true })).toBeVisible();
  const bob = await browser.newContext({ baseURL, storageState: join(process.env.RELAY_TEST_DIR!, "bob.json") });
  try {
    expect((await (await bob.request.get("/api/history")).json()).some((a: { entityId: string }) => a.entityId === p.id)).toBe(false);
  } finally { await bob.close(); }
  expect(errors).toEqual([]);
  await page.goto("/history");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `history-${info.project.name}.png`), caret: "initial" });
});

test("history exposes conflicts without overwriting later edits and rejects foreign recovery", async ({ page, request, browser, baseURL }) => {
  const headers = { origin: baseURL! }, mutationId = crypto.randomUUID();
  const response = await request.post("/api/tasks", { headers, data: { title: `Stale recovery ${mutationId}`, mutationId } });
  const t = await response.json(), operationId = response.headers()["x-relay-operation-id"];
  expect(operationId).toBeTruthy();
  const patch = await request.patch(`/api/tasks/${t.id}`, { headers, data: { title: `${t.title} newer`, expectedRevision: 1, mutationId: crypto.randomUUID() } });
  expect(patch.status()).toBe(200);
  await page.goto("/history");
  const row = page.getByRole("article", { name: `create task: ${t.title}`, exact: true });
  await row.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row.getByRole("alert")).toContainText("changed");
  expect((await (await request.get(`/api/tasks/${t.id}`)).json()).title).toBe(`${t.title} newer`);
  const bob = await browser.newContext({ baseURL, storageState: join(process.env.RELAY_TEST_DIR!, "bob.json") });
  try {
    expect((await bob.request.post(`/api/history/${operationId}/undo`, { headers, data: { mutationId: crypto.randomUUID() } })).status()).toBe(404);
  } finally { await bob.close(); }
});

test("project editor uses the current persisted status after Undo, not its previous form state", async ({ page, request, baseURL }) => {
  const headers = { origin: baseURL! };
  const p = await (await request.post("/api/projects", { headers, data: { name: `Form recovery ${crypto.randomUUID()}`, mutationId: crypto.randomUUID() } })).json();
  await page.goto(`/projects/${p.id}`);
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Active");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("Planned");
  await page.getByLabel("Project name").fill(`${p.name} renamed`);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await (await request.get(`/api/projects/${p.id}`)).json()).status).toBe("Planned");
});

test("toast Undo remains clickable above event details and preserves the saved time", async ({ page, request, baseURL }) => {
  const headers = { origin: baseURL! };
  const e = await (await request.post("/api/events", { headers, data: {
    title: `Time recovery ${crypto.randomUUID()}`, start: "2027-03-14T09:00:00Z", end: "2027-03-14T10:00:00Z", timezone: "UTC", mutationId: crypto.randomUUID(),
  } })).json();
  await page.goto(`/calendar?date=2027-03-14&event=${e.id}`);
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Start", { exact: true }).fill("2027-03-15T09:00");
  await page.getByLabel("End", { exact: true }).fill("2027-03-15T10:00");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reschedule", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/events/${e.id}`)).json()).start).toBe(e.start);
  await expect(page.getByText("Change undone.", { exact: true })).toBeVisible();
  await page.goto(`/calendar?date=2027-03-14&event=${e.id}`);
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("2027-03-14T09:00");
  await page.getByLabel("Event title").fill(`${e.title} renamed`);
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit event", exact: true })).toHaveCount(0);
  expect((await (await request.get(`/api/events/${e.id}`)).json()).start).toBe(e.start);
});

test("event editor discards canceled time changes when reopening to rename the event", async ({ page, request, baseURL }) => {
  const e = await (await request.post("/api/events", { headers: { origin: baseURL! }, data: {
    title: `Canceled event ${crypto.randomUUID()}`, start: "2027-03-14T09:00:00Z", end: "2027-03-14T10:00:00Z", timezone: "UTC", mutationId: crypto.randomUUID(),
  } })).json();
  await page.goto(`/calendar?date=2027-03-14&event=${e.id}`);
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Start", { exact: true }).fill("2027-03-15T09:00");
  await page.getByLabel("End", { exact: true }).fill("2027-03-15T10:00");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("2027-03-14T09:00");
  await page.getByLabel("Event title").fill(`${e.title} renamed`);
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit event", exact: true })).toHaveCount(0);
  expect((await (await request.get(`/api/events/${e.id}`)).json()).start).toBe(e.start);
});
