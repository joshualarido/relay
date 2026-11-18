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
