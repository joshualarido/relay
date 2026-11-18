import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { Temporal } from "temporal-polyfill";
import { testWorkspace } from "../support/auth";
import { createTask } from "../../src/lib/tasks";

// Phase screenshots on the isolated test server only. Run: RELAY_SCREENSHOTS=1 npx playwright test screens
test.skip(!process.env.RELAY_SCREENSHOTS, "Set RELAY_SCREENSHOTS to capture phase screenshots.");
test.use({ colorScheme: "light" });

const dir = "docs/phase1-screens";
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
};
const openToday = async (page: Page) => {
  await page.goto("/");
  await expect(page.locator(".now-line")).toBeAttached();
  await page.evaluate(() => window.scrollTo(0, 0));
};

test("Today screen", async ({ page, request, baseURL }, info) => {
  const headers = { origin: baseURL! }, post = async (path: string, data: object) => {
    const response = await request.post(path, { headers, data: { ...data, mutationId: crypto.randomUUID() } });
    expect(response.ok()).toBe(true); return response.json();
  };
  const mobile = info.project.name === "mobile";
  if (!mobile) {
    const { timezone } = await (await request.get("/api/preferences")).json();
    const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(Date.now() + offset * 86_400_000);
    const at = (minutes: number) => new Date(Math.round(Date.now() / 900_000) * 900_000 + minutes * 60_000).toISOString();
    const home = await post("/api/projects", { name: "Home" });
    const writing = await post("/api/projects", { name: "Garden blog" });
    await post("/api/events", { title: "Run with Maya", start: at(-150), end: at(-90), timezone });
    await post("/api/events", { title: "Dentist", start: at(-45), end: at(0), timezone });
    const draft = await post("/api/tasks", { title: "Draft the tomato post", projectId: writing.id });
    await post("/api/events", { title: "Draft the tomato post", start: at(30), end: at(120), timezone, taskId: draft.id });
    const bills = await post("/api/tasks", { title: "Pay the water bill", projectId: home.id });
    await post("/api/events", { title: "Pay the water bill", start: at(150), end: at(180), timezone, taskId: bills.id });
    await post("/api/events", { title: "Dinner at Sam's", start: at(240), end: at(360), timezone });
    await post("/api/tasks", { title: "Return library books", dueDate: day(0), projectId: home.id });
    await post("/api/tasks", { title: "Renew passport photos", dueDate: day(-3) });
  }
  const sizes = mobile ? [[390, 844]] : [[1440, 900], [1366, 768]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await openToday(page);
      await shot(page, `today-${width}-${scheme}`);
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await openToday(page);
  if (mobile) {
    await page.getByRole("button", { name: /overdue/ }).click();
    await shot(page, "today-390-catch-up-open");
    await page.getByRole("button", { name: "Capture", exact: true }).click();
  } else {
    await page.keyboard.press("n");
  }
  await expect(page.getByRole("dialog", { name: "Capture" })).toBeVisible();
  await shot(page, `capture-${mobile ? 390 : 1440}-light`);
});

test("Today empty day and Day clear", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop only");
  const workspace = await testWorkspace({ path: join(process.env.RELAY_TEST_DIR!, "workspace.db"), baseURL: baseURL!, secret: process.env.RELAY_TEST_SECRET! });
  // Fresh users use the default zone (Asia/Jakarta).
  const today = Temporal.Now.plainDateISO("Asia/Jakarta").toString();
  createTask(workspace.db, workspace.alice.id, { title: "Water the seedlings", dueDate: today, mutationId: crypto.randomUUID() });
  const clearCookies = await workspace.helpers.getCookies({ userId: workspace.alice.id });
  const emptyCookies = await workspace.helpers.getCookies({ userId: workspace.bob.id });
  workspace.close();
  for (const [name, cookies] of [["today-1440-empty", emptyCookies], ["today-1440-day-clear", clearCookies]] as const) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto("/");
    if (name.endsWith("day-clear")) {
      await page.getByRole("button", { name: "Complete Water the seedlings" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Day clear" })).toBeVisible();
      await page.waitForTimeout(5_000); // let the Undo toast settle out of frame
    } else await expect(page.getByText("Nothing planned today", { exact: true }).last()).toBeVisible();
    await shot(page, name);
    await context.close();
  }
});
