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
    for (const endpoint of ["preferences", "projects", "tasks", "events", "check-ins", "dependencies", "search", "history"]) {
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
    await page.goto("/history");
    await expect(page).toHaveURL(/\/login$/);
  } finally { await context.close(); }
});

test("authenticated shell is dark, navigable, responsive, and has honest AI state", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
  await expect(page.getByText("Assistant availability", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, `chat-${info.project.name}.png`), fullPage: true, caret: "initial" });
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

test("keyboard focus, mobile menu Escape, and reduced motion remain usable", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  if (info.project.name === "mobile") {
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Workspace navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
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
