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
