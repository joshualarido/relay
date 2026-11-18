import { test, expect } from "@playwright/test";

test("N opens Capture, a task saves with an Open link and Undo removes it", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop keyboard shortcut");
  const title = `Captured ${crypto.randomUUID().slice(0, 8)}`;
  const titles = async () => ((await (await page.request.get("/api/tasks")).json()) as { title: string }[]).map((t) => t.title);

  // N typed into a plain field is just text.
  await page.goto("/settings");
  const timezone = page.getByLabel("Timezone");
  await expect(timezone).toBeVisible();
  await timezone.focus();
  await expect(timezone).toBeFocused();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "Capture" })).toHaveCount(0);

  await page.goto("/");
  const button = page.getByRole("button", { name: "Capture", exact: true }).first();
  await expect(button).toBeVisible();
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Capture" });
  await expect(dialog.getByLabel("Quick capture")).toBeFocused();
  await expect(dialog.getByLabel("Quick capture")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await button.click();
  await dialog.getByLabel("Quick capture").fill(title);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  // A loose task has no date, so it is not on Today's timeline: check the toast and the API.
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Task captured." });
  await expect(toast.getByRole("link", { name: /Open/ })).toHaveAttribute("href", /task=/);
  expect(await titles()).toContain(title);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone.")).toBeVisible();
  expect(await titles()).not.toContain(title);
});

test("Capture type is a radio group; project and event capture need only a name", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop keyboard shortcut");
  const stamp = crypto.randomUUID().slice(0, 8), project = `Named project ${stamp}`, event = `Named event ${stamp}`;
  await page.goto("/");
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Capture" });
  const type = dialog.getByRole("radiogroup", { name: "Type" });
  const task = type.getByRole("radio", { name: "Task" }), projectRadio = type.getByRole("radio", { name: "Project" }), eventRadio = type.getByRole("radio", { name: "Event" });
  await expect(task).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByLabel("Quick capture")).toBeFocused();

  // Clicking a type keeps typing in the name field; arrows move and wrap.
  await projectRadio.click();
  await expect(projectRadio).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByLabel("Project name")).toBeFocused();
  await projectRadio.focus();
  await page.keyboard.press("ArrowRight");
  await expect(eventRadio).toHaveAttribute("aria-checked", "true");
  await expect(eventRadio).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(task).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(eventRadio).toHaveAttribute("aria-checked", "true");

  // Reopening resets to Task.
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await expect(task).toHaveAttribute("aria-checked", "true");

  // Project: name only, no Deadline field.
  await projectRadio.click();
  await expect(dialog.getByLabel("Deadline")).toHaveCount(0);
  await dialog.getByLabel("Project name").fill(project);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Project created.")).toBeVisible();
  const projects = (await (await page.request.get("/api/projects")).json()) as { name: string; deadline: string | null }[];
  expect(projects.find((p) => p.name === project)?.deadline ?? null).toBeNull();

  // Event: name only, saved immediately as an all-day event today.
  await page.keyboard.press("n");
  await eventRadio.click();
  await dialog.getByLabel("Event title").fill(event);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Event captured.")).toBeVisible();
  const events = (await (await page.request.get("/api/events")).json()) as { title: string; allDay: boolean; start: string }[];
  const saved = events.find((e) => e.title === event);
  expect(saved?.allDay).toBe(true);
  expect(saved?.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
