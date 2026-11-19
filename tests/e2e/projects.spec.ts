import { test, expect, type Locator, type Page } from "@playwright/test";

type Task = { id: string; title: string; status: string; projectId: string | null };
type Event = { id: string; title: string; projectId: string | null; taskId: string | null };

test.beforeEach(({}, info) => { test.skip(info.project.name === "mobile", "Desktop spec; narrow screens are checked by hand."); });

const column = (page: Page, status: string) => page.locator(".board-pane").getByRole("region", { name: new RegExp(`^${status}`) });
const card = (page: Page, title: string) => page.locator("article.task-card").filter({ has: page.getByRole("button", { name: title, exact: true }) });

async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!, b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 24), { steps: 12 });
  await page.mouse.up();
}

test("acceptance 1: create a project, add 5 tasks, drag by mouse and keyboard, drag the project to Active, Undo, refresh", async ({ page }) => {
  const stamp = crypto.randomUUID().slice(0, 6), name = `Launch ${stamp}`;
  const titles = [1, 2, 3, 4, 5].map((n) => `Step ${n} ${stamp}`);
  await page.goto("/projects");

  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("New project name").fill(name);
  await page.keyboard.press("Enter");
  await expect(page.locator(".board-title")).toHaveText(name);
  const planned = page.getByRole("region", { name: /^Planned/ });
  await expect(planned.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-current", "true");

  const add = page.getByLabel("Add task to To do");
  for (const title of titles) {
    await add.fill(title);
    await add.press("Enter");
    await expect(column(page, "To do").getByRole("button", { name: title, exact: true })).toBeVisible();
    await expect(add).toHaveValue("");
  }

  // Mouse: To do -> Doing, To do -> Done.
  await drag(page, card(page, titles[0]), column(page, "Doing"));
  await expect(column(page, "Doing").getByRole("button", { name: titles[0], exact: true })).toBeVisible();
  await expect(page.getByText("Moved to Doing.").first()).toBeVisible();
  await drag(page, card(page, titles[1]), column(page, "Done"));
  await expect(column(page, "Done").getByRole("button", { name: titles[1], exact: true })).toBeVisible();
  await expect(page.getByText("Moved to Done.").first()).toBeVisible();

  // Keyboard: pick up with Enter, arrow right into Doing, drop with Enter.
  await page.getByRole("button", { name: `Move ${titles[2]}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: `Move ${titles[2]}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300); // let the sensor settle on the new target before dropping
  await page.keyboard.press("Enter");
  await expect(column(page, "Doing").getByRole("button", { name: titles[2], exact: true })).toBeVisible();
  await expect(page.getByText("Moved to Doing.")).toHaveCount(2);
  // Escape cancels a keyboard drag.
  await page.getByRole("button", { name: `Move ${titles[3]}`, exact: true }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(column(page, "To do").getByRole("button", { name: titles[3], exact: true })).toBeVisible();

  // Project: Planned -> Active by mouse.
  const row = page.locator("li.project-row").filter({ hasText: name });
  await drag(page, row, page.getByRole("region", { name: /^Active/ }).getByRole("heading"));
  await expect(page.getByRole("region", { name: /^Active/ }).getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();

  // Undo from the toast: complete via the ⋯ menu, then undo it.
  await card(page, titles[4]).hover();
  await page.getByRole("button", { name: `Actions for ${titles[4]}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Complete" }).click();
  await expect(column(page, "Done").getByRole("button", { name: titles[4], exact: true })).toBeVisible();
  await page.locator("[data-sonner-toast]").filter({ hasText: "Task completed." }).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone.")).toBeVisible();
  await expect(column(page, "To do").getByRole("button", { name: titles[4], exact: true })).toBeVisible();

  const board = async () => Promise.all(["To do", "Doing", "Done"].map((status) => column(page, status).locator(".task-card-title").allTextContents()));
  const before = await board();
  expect(before.map((c) => c.length)).toEqual([2, 2, 1]);
  await page.reload();
  await expect(page.locator(".board-title")).toHaveText(name);
  await expect(page.getByRole("region", { name: /^Active/ }).getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(column(page, "Done").locator(".task-card-title")).toHaveText(before[2]);
  expect(await board()).toEqual(before);
  const saved = (await (await page.request.get("/api/tasks")).json() as Task[]).filter((t) => t.title.endsWith(stamp));
  expect(saved).toHaveLength(5);
});

test("acceptance 4: a loose task under No project and a standalone event", async ({ page }) => {
  const stamp = crypto.randomUUID().slice(0, 6), taskTitle = `Loose ${stamp}`, eventTitle = `Standalone ${stamp}`;
  await page.goto("/projects");
  await page.getByRole("button", { name: /^No project/ }).click();
  await expect(page.locator(".board-title")).toHaveText("No project");
  await page.getByLabel("Add task to To do").fill(taskTitle);
  await page.keyboard.press("Enter");
  await expect(column(page, "To do").getByRole("button", { name: taskTitle, exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Capture" });
  await dialog.getByRole("radio", { name: "Event" }).click();
  await dialog.getByLabel("Event title").fill(eventTitle);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Upcoming events" }).getByRole("link", { name: new RegExp(eventTitle) })).toBeVisible();

  await page.reload();
  await expect(column(page, "To do").getByRole("button", { name: taskTitle, exact: true })).toBeVisible();
  const task = (await (await page.request.get("/api/tasks")).json() as Task[]).find((t) => t.title === taskTitle)!;
  expect(task.projectId).toBeNull();
  const event = (await (await page.request.get("/api/events")).json() as Event[]).find((e) => e.title === eventTitle)!;
  expect(event).toMatchObject({ projectId: null, taskId: null });

  // The details sheet opens from the card; Escape returns focus to it.
  await page.getByRole("button", { name: taskTitle, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: taskTitle });
  await expect(sheet.getByLabel("Project")).toHaveValue("none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: taskTitle, exact: true })).toBeFocused();
});

test("the Inbox route is gone", async ({ page }) => {
  expect((await page.goto("/inbox"))!.status()).toBe(404);
});

// Phase screenshots on the isolated test server. Run: RELAY_SCREENSHOTS=1 npx playwright test projects --project=desktop -g screenshots
test("screenshots", async ({ page, request, baseURL }) => {
  test.skip(!process.env.RELAY_SCREENSHOTS, "Set RELAY_SCREENSHOTS to capture phase screenshots.");
  test.setTimeout(90_000);
  const dir = "docs/phase2-screens";
  const post = async (path: string, data: object) => {
    const response = await request.post(path, { headers: { origin: baseURL! }, data: { ...data, mutationId: crypto.randomUUID() } });
    expect(response.ok()).toBe(true); return response.json();
  };
  const { timezone } = await (await request.get("/api/preferences")).json();
  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(Date.now() + offset * 86_400_000);
  const blog = await post("/api/projects", { name: "Garden blog", status: "Active", description: "Weekly posts about the vegetable patch.", deadline: day(12) });
  const flat = await post("/api/projects", { name: "Move flat", status: "Active", deadline: day(30) });
  await post("/api/projects", { name: "Learn Portuguese", status: "Planned" });
  await post("/api/projects", { name: "Bike rebuild", status: "Paused" });
  await post("/api/projects", { name: "Tax return 2025", status: "Done" });
  const tasks: [string, string, object?][] = [
    ["Draft the tomato post", "Doing", { dueDate: day(2), important: true }], ["Photograph the raised beds", "To do", { dueDate: day(5) }],
    ["Outline the compost series", "To do"], ["Reply to reader comments", "To do"], ["Pick a new theme", "Done"], ["Set up the newsletter", "Done"],
  ];
  for (const [i, [title, status, extra]] of tasks.entries()) await post("/api/tasks", { title, status, projectId: blog.id, position: i, ...extra });
  await post("/api/tasks", { title: "Book the van", projectId: flat.id, dueDate: day(-1) });
  await post("/api/tasks", { title: "Buy stamps", projectId: null });
  const start = new Date(Date.now() + 2 * 86_400_000); start.setUTCMinutes(0, 0, 0);
  await post("/api/events", { title: "Interview the allotment club", start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString(), timezone, projectId: blog.id });

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/projects?project=${blog.id}`);
    await expect(page.locator(".board-title")).toHaveText("Garden blog");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/projects-1440-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await card(page, "Reply to reader comments").hover();
  await page.getByRole("button", { name: "Actions for Reply to reader comments" }).click();
  await page.getByRole("menuitem", { name: "Move to project" }).hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/projects-menu.png` });
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Draft the tomato post", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/projects-sheet.png` });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/projects-1366.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/projects-390-list.png` });
  await page.getByRole("button", { name: /^Garden blog/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/projects-390-board.png`, fullPage: true });
});
