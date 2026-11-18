import { test, expect } from "@playwright/test";

// Phase screenshots on the isolated test server only. Run: RELAY_SCREENSHOTS=1 npx playwright test screens
test.skip(!process.env.RELAY_SCREENSHOTS, "Set RELAY_SCREENSHOTS to capture phase screenshots.");
test.use({ colorScheme: "light" });

test("Today screen", async ({ page, request, baseURL }, info) => {
  const headers = { origin: baseURL! }, post = async (path: string, data: object) => {
    const response = await request.post(path, { headers, data: { ...data, mutationId: crypto.randomUUID() } });
    expect(response.ok()).toBe(true); return response.json();
  };
  if (info.project.name === "desktop") {
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
  await page.goto("/");
  await expect(page.locator(".now-line")).toBeAttached();
  await page.getByRole("button", { name: /overdue/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `docs/phase1-screens/today-${info.project.name}.png`, fullPage: false });
});
