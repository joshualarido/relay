import { test, expect, type Browser } from "@playwright/test";
import { join } from "node:path";
import { Temporal } from "temporal-polyfill";
import { testWorkspace } from "../support/auth";
import { createTask } from "../../src/lib/tasks";
import { createEvent } from "../../src/lib/events";

// Fresh users keep the day deterministic; their preference zone is the default (Asia/Jakarta).
const zone = "Asia/Jakarta";

async function openAs(browser: Browser, baseURL: string, cookies: Parameters<import("@playwright/test").BrowserContext["addCookies"]>[0]) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies);
  return context;
}

test("Today shows the now line, due tasks, catch-up with Undo, Day clear and the empty day", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "One desktop flow is enough.");
  const now = Temporal.Now.zonedDateTimeISO(zone);
  const minutesIntoDay = now.hour * 60 + now.minute;
  test.skip(minutesIntoDay < 120 || minutesIntoDay > 22 * 60, "Within 2 h of local midnight the seeded day could straddle two dates.");

  const workspace = await testWorkspace({ path: join(process.env.RELAY_TEST_DIR!, "workspace.db"), baseURL: baseURL!, secret: process.env.RELAY_TEST_SECRET! });
  const today = now.toPlainDate();
  const owner = workspace.alice.id, mutationId = () => crypto.randomUUID();
  createTask(workspace.db, owner, { title: "Overdue report", dueDate: today.subtract({ days: 1 }).toString(), mutationId: mutationId() });
  createTask(workspace.db, owner, { title: "Due today note", dueDate: today.toString(), mutationId: mutationId() });
  const block = createTask(workspace.db, owner, { title: "Focus block", mutationId: mutationId() });
  createEvent(workspace.db, owner, {
    title: "Focus block", taskId: block.id, start: now.subtract({ minutes: 30 }).toInstant().toString(),
    end: now.add({ minutes: 30 }).toInstant().toString(), timezone: zone, mutationId: mutationId(),
  });
  createEvent(workspace.db, owner, {
    title: "Standup call", start: now.subtract({ minutes: 90 }).toInstant().toString(),
    end: now.subtract({ minutes: 60 }).toInstant().toString(), timezone: zone, mutationId: mutationId(),
  });
  const busyCookies = await workspace.helpers.getCookies({ userId: owner });
  const emptyCookies = await workspace.helpers.getCookies({ userId: workspace.bob.id });
  workspace.close();

  const context = await openAs(browser, baseURL!, busyCookies);
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("li.now-line")).toHaveText(/^Now, \d\d:\d\d$/);
    // A plain event in the timeline opens the event panel.
    await page.getByRole("link", { name: "Standup call", exact: true }).click();
    await expect(page).toHaveURL(/\?event=/);
    const panel = page.getByRole("dialog", { name: "Event details" });
    await expect(panel.getByRole("heading", { name: "Standup call" })).toBeVisible();
    await panel.getByRole("button", { name: "Close event details" }).click();
    await expect(panel).toHaveCount(0);
    const due = page.getByRole("region", { name: "Due today" });
    await expect(due.getByRole("link", { name: "Due today note", exact: true })).toBeVisible();

    const toggle = page.getByRole("button", { name: /1 overdue · Review/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("group", { name: "Move Overdue report" }).getByRole("button", { name: "Tomorrow" }).click();
    await expect(toggle).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: /1 overdue · Review/ })).toBeVisible();

    // Move it out again so only today's two items remain, then complete them.
    await page.getByRole("button", { name: /1 overdue · Review/ }).click();
    await page.getByRole("group", { name: "Move Overdue report" }).getByRole("button", { name: "Tomorrow" }).click();
    await expect(page.getByRole("button", { name: /overdue · Review/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Complete Due today note" }).click();
    await expect(page.getByRole("button", { name: "Complete Due today note" })).toHaveCount(0);
    await page.getByRole("button", { name: "Complete Focus block" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Day clear" })).toBeVisible();
  } finally { await context.close(); }

  const emptyContext = await openAs(browser, baseURL!, emptyCookies);
  try {
    const page = await emptyContext.newPage();
    await page.goto("/");
    await expect(page.getByText("Nothing planned today", { exact: true }).last()).toBeVisible();
    await expect(page.locator("li.now-line")).toHaveCount(0);
  } finally { await emptyContext.close(); }
});

test("mobile Today queue: whole-row long-press drag reorders and survives reload while tap, scroll, and swipes still work", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== "mobile", "Mobile touch interaction test");
  const headers = { origin: baseURL! };
  const stamp = crypto.randomUUID().slice(0, 6);
  const prefs = (await (await request.get("/api/preferences")).json()) as { timezone: string };
  const today = Temporal.Now.plainDateISO(prefs.timezone).toString();
  const tomorrow = Temporal.PlainDate.from(today).add({ days: 1 }).toString();

  const createTodayTask = async (title: string, dayOrder: number, taskType: "Instant" | "Medium" | "Deep" = "Medium") =>
    (await (
      await request.post("/api/tasks", {
        headers,
        data: { title, executionDate: today, dayOrder, taskType, mutationId: crypto.randomUUID() },
      })
    ).json()) as { id: string; title: string };

  // Seed enough tasks so the page overflows vertically and scroll can be verified on a phone viewport.
  const first = await createTodayTask(`Drag first ${stamp}`, 0, "Instant");
  const second = await createTodayTask(`Drag second ${stamp}`, 1, "Medium");
  const third = await createTodayTask(`Drag third ${stamp}`, 2, "Deep");
  const swipeDone = await createTodayTask(`Swipe done ${stamp}`, 3, "Instant");
  const swipeTom = await createTodayTask(`Swipe tomorrow ${stamp}`, 4, "Medium");
  for (let i = 0; i < 8; i++) {
    await createTodayTask(`Filler ${i + 1} ${stamp}`, 5 + i, "Instant");
  }

  await page.goto("/");
  await expect(page.locator(`[data-task-link="${first.id}"]`)).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  const trackedIds = [first.id, second.id, third.id];
  const readOrder = async () =>
    page.locator("ol.today-queue > li[data-task-row]").evaluateAll(
      (els, ids) =>
        els
          .map((el) => el.getAttribute("data-task-row") ?? "")
          .filter((id) => ids.includes(id)),
      trackedIds,
    );

  expect(await readOrder()).toEqual([first.id, second.id, third.id]);

  // 1) Whole-row long-press (~300ms) on the middle of the title link picks up, locks scroll, and reorders.
  const firstTitle = page.locator(`[data-task-link="${first.id}"]`);
  const thirdRow = page.locator(`ol.today-queue > li[data-task-row="${third.id}"]`);
  await firstTitle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await thirdRow.scrollIntoViewIfNeeded();
  const startBox = (await firstTitle.boundingBox())!;
  const targetBox = (await thirdRow.boundingBox())!;
  const startPt = { x: Math.round(startBox.x + startBox.width / 2), y: Math.round(startBox.y + startBox.height / 2) };
  const endPt = { x: Math.round(targetBox.x + targetBox.width / 2), y: Math.round(targetBox.y + targetBox.height * 0.75) };

  const scrollBeforeDrag = await page.evaluate(() => window.scrollY);
  const reorderResponse = page.waitForResponse(
    (res) => res.url().includes("/api/tasks/day-order") && res.request().method() === "POST",
  );

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startPt.x, y: startPt.y, id: 1 }],
  });
  await page.waitForTimeout(300);

  await expect(page.locator('[data-drag-ghost="true"][data-touch-picked="true"]')).toBeVisible();
  expect(await page.evaluate(() => document.body.classList.contains("is-touch-card-dragging"))).toBe(true);

  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: Math.round(startPt.x + ((endPt.x - startPt.x) * i) / steps),
          y: Math.round(startPt.y + ((endPt.y - startPt.y) * i) / steps),
          id: 1,
        },
      ],
    });
    await page.waitForTimeout(16);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeDrag);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  const orderRes = await reorderResponse;
  expect(orderRes.ok()).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains("is-touch-card-dragging"))).toBe(false);
  // Drop on the title link must not open the task details dialog or navigate.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(readOrder).toEqual([second.id, third.id, first.id]);

  // Order persists across reload.
  await page.reload();
  await expect(page.locator(`[data-task-link="${first.id}"]`)).toBeVisible();
  expect(await readOrder()).toEqual([second.id, third.id, first.id]);

  // 2) Short tap on a task title still opens the task details dialog.
  const secondTitle = page.locator(`[data-task-link="${second.id}"]`);
  await secondTitle.scrollIntoViewIfNeeded();
  const tapBox = (await secondTitle.boundingBox())!;
  await page.touchscreen.tap(tapBox.x + tapBox.width / 2, tapBox.y + tapBox.height / 2);
  await expect(page).toHaveURL(new RegExp(`\\?task=${second.id}`));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator('[data-drag-ghost="true"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 3) Immediate vertical swipe scrolls the page and does not trigger a drag.
  const secondRowEl = page.locator(`ol.today-queue > li[data-task-row="${second.id}"] .queue-row`);
  await secondRowEl.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const scrollBeforeSwipe = await page.evaluate(() => window.scrollY);
  const rowBox = (await secondRowEl.boundingBox())!;
  const sx = Math.round(rowBox.x + rowBox.width / 2);
  const sy = Math.round(rowBox.y + rowBox.height / 2);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: sx, y: sy, id: 1 }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: sx, y: Math.round(sy - (220 * i) / 8), id: 1 }],
    });
    await page.waitForTimeout(10);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator('[data-drag-ghost="true"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBeforeSwipe);
  await page.evaluate(() => window.scrollTo(0, 0));

  // 4) Horizontal swipe right completes, horizontal swipe left pushes to tomorrow.
  const swipeRow = async (taskId: string, dx: number) => {
    const loc = page.locator(`ol.today-queue > li[data-task-row="${taskId}"] .queue-row`);
    await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = (await loc.boundingBox())!;
    const startX = Math.round(box.x + (dx > 0 ? box.width * 0.2 : box.width * 0.8));
    const startY = Math.round(box.y + box.height * 0.5);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y: startY, id: 1 }],
    });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: Math.round(startX + (dx * i) / 8), y: startY, id: 1 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };

  await swipeRow(swipeDone.id, 110);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Task completed." }).last()).toBeVisible();
  await expect(page.locator(`ol.today-queue > li[data-task-row="${swipeDone.id}"]`)).toHaveCount(0);
  await expect
    .poll(async () => ((await (await request.get(`/api/tasks/${swipeDone.id}`)).json()) as { status: string }).status)
    .toBe("Done");

  await swipeRow(swipeTom.id, -110);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Moved to tomorrow." }).last()).toBeVisible();
  await expect
    .poll(async () => ((await (await request.get(`/api/tasks/${swipeTom.id}`)).json()) as { executionDate: string | null }).executionDate)
    .toBe(tomorrow);

  await cdp.detach();
});
