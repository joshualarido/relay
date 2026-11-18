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
