import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { testWorkspace } from "../support/auth";
import { eq } from "drizzle-orm";
import { session } from "../../src/lib/db/schema";

test("protected pages reject anonymous users and forged sessions", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    for (const endpoint of ["preferences", "projects", "tasks", "events", "search"]) {
      expect((await context.request.get(`/api/${endpoint}`)).status()).toBe(401);
    }
    await context.addCookies([{ name: "better-auth.session_token", value: "forged.signature", domain: "127.0.0.1", path: "/" }]);
    expect((await context.request.get("/api/preferences")).status()).toBe(401);
    expect((await context.request.get("/api/auth/test-login")).status()).toBe(404);
    await expect(page.getByText("Google sign-in needs configuration.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login$/);
  } finally { await context.close(); }
});

test("an expired signed cookie is denied by the running application's session boundary", async ({ browser, baseURL }) => {
  const workspace = await testWorkspace({
    path: join(process.env.RELAY_TEST_DIR!, "workspace.db"), baseURL: baseURL!, secret: process.env.RELAY_TEST_SECRET!,
  });
  const cookies = await workspace.helpers.getCookies({ userId: workspace.bob.id });
  workspace.db.update(session).set({ expiresAt: new Date(0) }).where(eq(session.userId, workspace.bob.id)).run();
  workspace.close();
  const context = await browser.newContext({ baseURL });
  try {
    await context.addCookies(cookies);
    expect((await context.request.get("/api/tasks")).status()).toBe(401);
    const page = await context.newPage();
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/login$/);
  } finally { await context.close(); }
});

test("authenticated shell follows the system theme, is navigable, responsive, and shows exactly three screens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await expect(nav.getByRole("link")).toHaveText(["Today", "Projects", "Calendar"]);
  await nav.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: /^Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel("Timezone")).toBeVisible();
  expect(errors).toEqual([]);
});

test("old History and Chat bookmarks land on Today", async ({ page }) => {
  for (const path of ["/history", "/chat"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  }
});

test("a search result for a loose task opens its panel while Inbox is hidden", async ({ page, request, baseURL }) => {
  const title = `Loose search ${crypto.randomUUID()}`;
  expect((await request.post("/api/tasks", { headers: { origin: baseURL! }, data: { title, mutationId: crypto.randomUUID() } })).ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Inbox" })).toHaveCount(0);
  await page.getByRole("button", { name: "Search and commands" }).first().click();
  const palette = page.getByRole("dialog", { name: "Search and commands", exact: true });
  await palette.getByLabel("Search workspace").fill(title);
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await palette.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/inbox\?task=/);
  await expect(page.getByRole("dialog", { name: "Task details" }).getByRole("heading", { name: title })).toBeVisible();
});

test("preferences persist after reload and remain owner-isolated", async ({ page, browser, baseURL }, info) => {
  await page.goto("/settings");
  await page.getByLabel("Timezone").fill("America/Los_Angeles");
  await page.getByLabel("Week starts on").selectOption("0");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Timezone")).toHaveValue("America/Los_Angeles");
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `settings-${info.project.name}.png`), fullPage: true, caret: "initial" });
  const bob = await browser.newContext({ baseURL, storageState: join(process.env.RELAY_TEST_DIR!, "bob.json") });
  try {
    expect(await (await bob.request.get("/api/preferences")).json()).toMatchObject({ timezone: "Asia/Jakarta", weekStart: 1 });
  } finally { await bob.close(); }
});

test("keyboard focus and reduced motion remain usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByLabel("Timezone").fill("Not/AZone");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted fields." })).toBeVisible();
  await expect(page.getByLabel("Timezone")).toHaveValue("Not/AZone");
});

test("mutation origin and submitted ownership are not trusted", async ({ request }) => {
  expect((await request.patch("/api/preferences", { data: { timezone: "UTC", weekStart: 1, expectedRevision: 0 } })).status()).toBe(403);
  const response = await request.patch("/api/preferences", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { timezone: "UTC", weekStart: 1, expectedRevision: 0, ownerId: "someone-else" },
  });
  expect(response.status()).toBe(400);
});

test("logout invalidates the session", async ({ browser, baseURL }) => {
  const workspace = await testWorkspace({
    path: join(process.env.RELAY_TEST_DIR!, "workspace.db"),
    baseURL: baseURL!,
    secret: process.env.RELAY_TEST_SECRET!,
  });
  const cookies = await workspace.helpers.getCookies({ userId: workspace.bob.id });
  workspace.close();
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  await context.addCookies(cookies);
  try {
    const page = await context.newPage();
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get("/api/preferences")).status()).toBe(401);
  } finally { await context.close(); }
});

test("shared dark text, muted, error and action tokens meet readable contrast", async ({ page }) => {
  await page.goto("/");
  const ratios = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
    function luminance(token: string) {
      context.fillStyle = styles.getPropertyValue(token).trim();
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data).map((v) => {
        const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
      });
      return .2126 * r + .7152 * g + .0722 * b;
    }
    return [
      ["--foreground", "--background"], ["--foreground", "--card"], ["--muted-foreground", "--card"],
      ["--muted-foreground", "--background"], ["--destructive", "--card"], ["--primary-foreground", "--primary"],
      ["--control-border", "--card"], ["--control-border", "--background"],
    ].map(([text, background]) => {
      const a = luminance(text), b = luminance(background);
      return { text, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  for (const pair of ratios) expect(pair.ratio, `${pair.text} on ${pair.background}`).toBeGreaterThanOrEqual(pair.text === "--control-border" ? 3 : 4.5);
});

test("keyboard switches screens with a sliding transition, cached revisits and no shortcut while typing", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop keyboard shortcuts");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  const current = () => nav.locator("[aria-current=page]");
  const skeleton = page.getByRole("status", { name: "Loading workspace" });
  await page.goto("/");
  await expect(current()).toHaveText("Today");
  await page.keyboard.press("Control+ArrowRight");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(current()).toHaveText("Projects");
  await page.keyboard.press("Control+ArrowRight");
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(current()).toHaveText("Calendar");
  await expect(nav.locator(".nav-indicator")).toHaveCount(1);
  // Every screen has now been visited: revisits paint from the router cache without the skeleton.
  let sawSkeleton = false;
  await page.exposeFunction("relaySkeleton", () => { sawSkeleton = true; });
  await page.evaluate(() => new MutationObserver(() => {
    if (document.querySelector("[aria-label='Loading workspace']")) (window as unknown as { relaySkeleton: () => void }).relaySkeleton();
  }).observe(document.body, { childList: true, subtree: true }));
  await page.keyboard.press("Control+ArrowLeft");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(current()).toHaveText("Projects");
  await page.keyboard.press("Control+ArrowLeft");
  await expect(page).toHaveURL(/\/$/);
  await expect(current()).toHaveText("Today");
  await expect(skeleton).toHaveCount(0);
  expect(sawSkeleton).toBe(false);
  // The slide leaves no transform behind, so fixed panels inside the page stay viewport-sized.
  await expect.poll(() => page.locator(".screen-transition").evaluate((el) => getComputedStyle(el).transform)).toBe("none");

  // A capture made on Today shows on the already-cached Projects screen (mutations call router.refresh()).
  const title = `Cached capture ${crypto.randomUUID().slice(0, 8)}`;
  await page.keyboard.press("n");
  const capture = page.getByRole("dialog", { name: "Capture" });
  await capture.getByLabel("Capture type").selectOption("project");
  await capture.getByLabel("Project name").fill(title);
  await capture.getByRole("button", { name: "Create project" }).click();
  await expect(capture).toHaveCount(0);
  await expect(page.getByText("Project created.")).toBeVisible();
  await page.keyboard.press("Control+ArrowRight");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("main").getByText(title).first()).toBeVisible();
  await page.keyboard.press("Control+ArrowLeft");
  await expect(page).toHaveURL(/\/$/);

  // The command palette's search field blocks shortcuts as well.
  await page.getByRole("button", { name: "Search and commands" }).first().click();
  await page.getByRole("dialog", { name: "Search and commands", exact: true }).getByLabel("Search workspace").fill("x");
  await page.keyboard.press("Control+ArrowRight");
  await expect(page).toHaveURL(/\/$/);
});

test("mobile tab bar navigates the three screens and + opens Capture", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "mobile only");
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Workspace" });
  for (const [name, url] of [["Projects", /\/projects$/], ["Calendar", /\/calendar$/], ["Today", /\/$/]] as const) {
    await bar.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(bar.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await bar.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("dialog", { name: "Capture" })).toBeVisible();
});
