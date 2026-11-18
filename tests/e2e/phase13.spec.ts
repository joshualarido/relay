import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const headers = (origin: string) => ({ origin });
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
// v3: planned work is an all-day event linked to the task.
const plan = async (request: APIRequestContext, origin: string, taskId: string, date: string) => (await request.post("/api/events", { headers: headers(origin), data: {
  title: "Plan", taskId, allDay: true, start: date, end: nextDay(date), timezone: "UTC", mutationId: crypto.randomUUID(),
} })).json();

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

// The Capture dialog opens with N on every viewport (the header button is hidden on mobile).
async function openCapture(page: Page) {
  await page.keyboard.press("n");
  return page.getByRole("dialog", { name: "Capture", exact: true });
}

test("Other routes still scroll when content is taller than the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto("/settings");
  const scrolled = await page.evaluate(() => {
    for (const el of [document.scrollingElement!, document.querySelector(".workspace-main")!]) { el.scrollTop = 200; if (el.scrollTop > 0) return true; }
    return false;
  });
  expect(scrolled).toBe(true);
});

test("Capture failure keeps input, shows an inline error, and retries without duplicates", async ({ page, request }, info) => {
  const title = `Retry capture ${info.project.name} ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/");
  let failed = false;
  await page.route("**/api/tasks", async (route) => {
    if (!failed && route.request().method() === "POST") {
      failed = true;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Could not save the task. Try again." }) });
    } else await route.continue();
  });
  const dialog = await openCapture(page);
  await dialog.getByLabel("Quick capture", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Could not save the task. Try again.");
  await expect(dialog.getByLabel("Quick capture", { exact: true })).toHaveValue(title);
  await dialog.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(page.getByText("Task captured.", { exact: true })).toBeVisible();
  const tasks = await (await request.get("/api/tasks")).json() as { title: string }[];
  expect(tasks.filter((t) => t.title === title)).toHaveLength(1);
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

test("Long titles wrap in Today without horizontal overflow", async ({ page, request, baseURL }, info) => {
  const { today } = await todayInWorkspace(request);
  const title = `${info.project.name}${"Longwordwithoutbreaks".repeat(10)} ${"wrapped words ".repeat(5)}`.slice(0, 200);
  const task = await (await request.post("/api/tasks", { headers: headers(baseURL!), data: { title, dueDate: today, mutationId: crypto.randomUUID() } })).json();
  expect(task.title).toHaveLength(200);
  await page.goto("/");
  const row = page.locator(".today-row").filter({ has: page.locator(`[data-task-link="${task.id}"]`) });
  await expect(row).toBeVisible();
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Today renders and captures with reduced motion", async ({ page, request }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Today", exact: true })).toBeVisible();
  const title = `Reduced motion ${info.project.name} ${crypto.randomUUID().slice(0, 6)}`;
  const dialog = await openCapture(page);
  await dialog.getByLabel("Quick capture", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Capture task", exact: true }).click();
  await expect(page.getByText("Task captured.", { exact: true })).toBeVisible();
  expect((await (await request.get("/api/tasks")).json()).some((t: { title: string }) => t.title === title)).toBe(true);
});

test("Today inline completion failure shows an inline error and keeps the task open", async ({ page, request, baseURL }) => {
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
  const row = page.getByRole("region", { name: "Due today" }).locator("li").filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await row.getByRole("button", { name: `Complete ${title}`, exact: true }).click();
  const alert = row.getByRole("alert");
  await expect(alert).toHaveText("Task changed. Review the latest version and try again.");
  expect((await (await request.get(`/api/tasks/${task.id}`)).json()).status).not.toBe("Done");
});
