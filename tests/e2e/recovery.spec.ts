import { test, expect } from "@playwright/test";

test("captured loose task can be opened from its notice, and toast Undo removes it", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `Recover ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/");
  await page.keyboard.press("n");
  const capture = page.getByRole("dialog", { name: "Capture", exact: true });
  await capture.getByLabel("Quick capture", { exact: true }).fill(name);
  await capture.getByRole("button", { name: "Capture task", exact: true }).click();
  const open = page.getByRole("link", { name: "Open captured task", exact: true });
  const task = (await (await request.get("/api/tasks")).json()).find((t: { title: string }) => t.title === name);
  await expect(open).toHaveAttribute("href", `/inbox?task=${task.id}`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Change undone.", { exact: true })).toBeVisible();
  expect((await (await request.get("/api/tasks")).json()).some((t: { title: string }) => t.title === name)).toBe(false);
  expect(errors).toEqual([]);
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
