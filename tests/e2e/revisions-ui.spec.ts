import { test, expect } from "@playwright/test";
import { join } from "node:path";

test("empty active project shows yellow border highlight and clears when a task is added", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop spec");
  const headers = { origin: baseURL! };
  const suffix = crypto.randomUUID().slice(0, 6);
  const emptyProj = await (
    await request.post("/api/projects", {
      headers,
      data: { name: `Empty Active ${suffix}`, status: "Active", mutationId: crypto.randomUUID() },
    })
  ).json();
  const plannedProj = await (
    await request.post("/api/projects", {
      headers,
      data: { name: `Empty Planned ${suffix}`, status: "Planned", mutationId: crypto.randomUUID() },
    })
  ).json();

  await page.goto(`/projects?project=${emptyProj.id}`);

  const activeRow = page.locator("li.project-row", { has: page.locator(`[data-project-row="${emptyProj.id}"]`) });
  const plannedRow = page.locator("li.project-row", { has: page.locator(`[data-project-row="${plannedProj.id}"]`) });
  await expect(activeRow).toHaveAttribute("data-empty-active", "true");
  await expect(plannedRow).not.toHaveAttribute("data-empty-active", "true");
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, "empty-active-project.png") });

  // Add a task in the To do column -> highlight disappears immediately
  const addInput = page.getByLabel("Add task to To do");
  await addInput.fill(`First task ${suffix}`);
  await addInput.press("Enter");
  await expect(page.getByText(`First task ${suffix}`)).toBeVisible();
  await expect(activeRow).not.toHaveAttribute("data-empty-active", "true");
});

test("recurring events show repeat icon on calendar and support this-occurrence vs whole-series edit and delete", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop spec");
  test.setTimeout(60_000);
  const suffix = crypto.randomUUID().slice(0, 6);
  const title = `Standup ${suffix}`;

  await page.goto("/calendar?date=2027-02-10&view=week");
  await page.getByRole("button", { name: "New event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event title", { exact: true }).fill(title);
  await dialog.getByLabel("All-day event").check();
  await dialog.getByLabel("Start", { exact: true }).fill("2027-02-10");
  await dialog.getByLabel("End", { exact: true }).fill("2027-02-11");
  await dialog.getByLabel("Recurrence frequency").selectOption("daily");
  await dialog.getByLabel("Repeat end date (optional)").fill("2027-02-12");
  await dialog.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // Three occurrences appear (Feb 10, 11, 12), each marked recurring
  const cards = page.locator(`.calendar-record[data-recurring="true"]`, { hasText: title });
  await expect(cards).toHaveCount(3);
  await page.screenshot({ path: join(process.env.RELAY_TEST_DIR!, "calendar-recurring-events.png") });

  // Open the Feb 11 occurrence and rename ONLY this occurrence
  await page.locator(`.calendar-record[data-occurrence-date="2027-02-11"]`, { hasText: title }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: title, exact: true }).click();
  const titleInput = sheet.getByLabel("event title");
  await titleInput.fill(`${title} special`);
  await titleInput.press("Enter");

  const prompt = page.getByRole("alertdialog");
  await expect(prompt).toContainText("Edit recurring event");
  await prompt.getByRole("button", { name: "This occurrence", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: `${title} special`, exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Close event details" }).click();
  await expect(sheet).toHaveCount(0);

  // Feb 11 now shows the renamed detached event; Feb 10 & Feb 12 still show the original recurring series
  await expect(page.locator(`.calendar-record`, { hasText: `${title} special` })).toHaveCount(1);
  await expect(page.locator(`.calendar-record[data-recurring="true"]`, { hasText: title })).toHaveCount(2);

  // Open Feb 12 occurrence and delete ONLY this occurrence
  await page.locator(`.calendar-record[data-occurrence-date="2027-02-12"]`, { hasText: title }).first().click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(prompt).toContainText("Delete recurring event");
  await prompt.getByRole("button", { name: "This occurrence", exact: true }).click();
  await expect(page.locator(`.calendar-record[data-occurrence-date="2027-02-12"]`, { hasText: title })).toHaveCount(0);
  await expect(page.locator(`.calendar-record[data-occurrence-date="2027-02-10"]`, { hasText: title })).toHaveCount(1);

  // Open Feb 10 occurrence and delete the WHOLE series (removes master and detached override)
  await page.locator(`.calendar-record[data-occurrence-date="2027-02-10"]`, { hasText: title }).first().click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(prompt).toContainText("Delete recurring event");
  await prompt.getByRole("button", { name: "Whole series", exact: true }).click();
  await expect(page.locator(`.calendar-record`, { hasText: title })).toHaveCount(0);
});
