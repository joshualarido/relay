import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { testWorkspace } from "../support/auth";
import { createProject } from "../../src/lib/projects";
import { createTask } from "../../src/lib/tasks";
import { createEvent } from "../../src/lib/events";

for (const kind of ["projects", "tasks", "events", "preferences"]) test(`pending ${kind} form keeps its submitted payload fixed until a failure returns`, async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/${kind}`, async (route) => {
    if (route.request().method() === "GET") return route.continue();
    await gate;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary failure." }) });
  });
  try {
    await page.goto(kind === "projects" ? "/projects" : kind === "tasks" ? "/inbox" : kind === "events" ? "/calendar" : "/settings");
    if (kind !== "preferences") await page.getByRole("button", { name: kind === "projects" ? "New project" : kind === "tasks" ? "Add task" : "New event", exact: true }).click();
    const input = page.getByLabel(kind === "projects" ? "Project name" : kind === "tasks" ? "Task title" : kind === "events" ? "Event title" : "Timezone", { exact: true });
    const value = kind === "preferences" ? "UTC" : "Preserve this submitted value";
    await input.fill(value);
    if (kind === "events") {
      await page.getByLabel("All-day event", { exact: true }).check();
      await page.getByLabel("Start", { exact: true }).fill("2027-03-15");
      await page.getByLabel("End", { exact: true }).fill("2027-03-16");
    }
    await page.getByRole("button", { name: kind === "projects" ? "Create project" : kind === "tasks" ? "Create task" : kind === "events" ? "Create event" : "Save preferences", exact: true }).click();
    await expect(input).not.toBeEditable();
    release();
    await expect(page.getByRole("alert").filter({ hasText: "Temporary failure." })).toBeVisible();
    await expect(input).toBeEditable();
    await expect(input).toHaveValue(value);
  } finally { release(); await page.unroute(`**/api/${kind}`); }
});

test("populated manual workspace stays coherent, accessible and persistent across process restarts", async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90_000);
  const directory = process.env.RELAY_TEST_DIR!, path = join(directory, "workspace.db"), secret = process.env.RELAY_TEST_SECRET!;
  const workspace = await testWorkspace({ path, baseURL: baseURL!, secret });
  const timings: Record<string, number> = {}, start = performance.now();
  const projects = Array.from({ length: 16 }, (_, i) => createProject(workspace.db, workspace.alice.id, {
    name: `Load project ${i}`, status: "Active", deadline: "2027-03-15", mutationId: crypto.randomUUID(),
  }));
  const tasks = Array.from({ length: 120 }, (_, i) => createTask(workspace.db, workspace.alice.id, {
    title: `Load task ${i}`, projectId: i < 60 ? projects[i % 16].id : null, priority: i % 2 ? "High" : "Medium",
    dueDate: "2027-03-15", mutationId: crypto.randomUUID(),
  }));
  Array.from({ length: 120 }, (_, i) => createEvent(workspace.db, workspace.alice.id, {
    title: `Load event ${i}`, start: `2027-03-${String(i % 28 + 1).padStart(2, "0")}`,
    end: `2027-03-${String(i % 28 + 2).padStart(2, "0")}`, allDay: true, timezone: "Asia/Jakarta", mutationId: crypto.randomUUID(),
  }));
  const cookies = await workspace.helpers.getCookies({ userId: workspace.alice.id });
  workspace.close();
  timings.seed = Math.round(performance.now() - start);
  await page.context().clearCookies(); await page.context().addCookies(cookies);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  for (const [route, heading] of [["/", "Today"], ["/projects", "Projects"], ["/inbox", "Inbox"], ["/calendar?date=2027-03-15", "Calendar"], ["/history", "History"]]) {
    const began = performance.now();
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    if (heading === "Calendar") await expect(page.locator("[data-calendar-record]").first()).toBeVisible();
    timings[route] = Math.round(performance.now() - began);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark");
  }
  await page.getByRole("button", { name: "Search and commands" }).click();
  const palette = page.getByRole("dialog", { name: "Search and commands", exact: true });
  await palette.getByLabel("Search workspace").fill("Load task");
  const began = performance.now();
  await palette.getByRole("button", { name: "Search", exact: true }).click();
  await expect(palette.getByText("120 matches; showing the first 100. Refine your filters to find the rest.", { exact: true })).toBeVisible();
  timings.search = Math.round(performance.now() - began);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Search and commands" })).toBeFocused();
  await page.screenshot({ path: join(directory, `workload-history-${info.project.name}.png`), caret: "initial" });
  const saved = await (await page.request.get(`/api/tasks/${tasks[0].id}`)).json();

  // A second loopback process uses the same isolated SQLite file and ordinary signed sessions.
  const origin = "http://127.0.0.1:3101", restartContext = await browser.newContext({ baseURL: origin });
  await restartContext.addCookies(cookies);
  try {
    for (let run = 0; run < 2; run++) {
      const log = createWriteStream(join(directory, `restart-${info.project.name}-${run}.log`));
      const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3101"], {
        env: { ...process.env, DATABASE_URL: path, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", NEXT_TELEMETRY_DISABLED: "1" },
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      server.stdout.pipe(log); server.stderr.pipe(log);
      try {
        await expect.poll(async () => {
          try { return (await restartContext.request.get("/login", { timeout: 1000 })).status(); } catch { return 0; }
        }, { timeout: 20_000 }).toBe(200);
        expect(await (await restartContext.request.get(`/api/tasks/${saved.id}`)).json()).toEqual(saved);
        const history = await (await restartContext.request.get("/api/history")).json();
        expect(history).toHaveLength(256);
      } finally {
        if (server.exitCode === null) { const exited = once(server, "exit"); server.kill(); await exited; }
        log.end();
      }
    }
  } finally { await restartContext.close(); }
  expect(errors).toEqual([]);
  writeFileSync(join(directory, `workload-${info.project.name}.json`), JSON.stringify({
    projects: 16, tasks: 120, events: 120, engine: "Chromium", viewport: info.project.use.viewport, timingsMs: timings, restartChecks: 2,
  }, null, 2));
});
