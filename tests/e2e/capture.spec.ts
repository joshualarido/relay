import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { Temporal } from "temporal-polyfill";

function upcomingFriday(timezone: string): string {
  const today = Temporal.Now.plainDateISO(timezone);
  const delta = (5 - today.dayOfWeek + 7) % 7;
  return today.add({ days: delta }).toString();
}

function tomorrowDate(timezone: string): string {
  return Temporal.Now.plainDateISO(timezone).add({ days: 1 }).toString();
}

async function touchSwipe(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  dx: number,
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Swipe target has no bounding box");
  const startX = box.x + (dx > 0 ? box.width * 0.2 : box.width * 0.8);
  const startY = box.y + box.height * 0.5;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: Math.round(startX), y: Math.round(startY), id: 1 }],
  });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: Math.round(startX + (dx * i) / steps), y: Math.round(startY), id: 1 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

test("acceptance #2: Capture tokens (#project, @fri, @fri 14:00-15:00, !), removable chips, unknown #project, Tab toggle, and Undo", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop capture & keyboard flow");
  const headers = { origin: baseURL! };
  const stamp = crypto.randomUUID().slice(0, 6);
  const projectName = `Relay${stamp}`;
  const project = await (
    await request.post("/api/projects", {
      headers,
      data: { name: projectName, status: "Active", mutationId: crypto.randomUUID() },
    })
  ).json();

  const prefs = (await (await request.get("/api/preferences")).json()) as { timezone: string };
  const expectedFri = upcomingFriday(prefs.timezone);

  // N typed into an input field does not open Capture.
  await page.goto("/settings");
  const timezoneInput = page.getByLabel("Timezone");
  await expect(timezoneInput).toBeVisible();
  await timezoneInput.focus();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "Capture" })).toHaveCount(0);

  // Acceptance #2: "Fix login bug #relay @fri" lands in the project with Friday's due date, and Undo removes it.
  await page.goto("/");
  const captureBtn = page.getByRole("button", { name: "Capture", exact: true }).first();
  await expect(captureBtn).toBeVisible();
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Capture" });
  const input = dialog.getByLabel("Quick capture");
  await expect(input).toBeFocused();

  const bugTitle = `Fix login bug ${stamp}`;
  await input.fill(`${bugTitle} #${projectName.toLowerCase()} @fri`);
  const chips = dialog.getByRole("list", { name: "Detected tokens" });
  await expect(chips.getByText(projectName)).toBeVisible();
  await expect(chips.locator("li")).toHaveCount(2);

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Task captured." }).last();
  await expect(toast).toBeVisible();

  type TaskRow = { id: string; title: string; projectId: string | null; dueDate: string | null; important: boolean | null };
  const tasksAfterCreate = (await (await request.get("/api/tasks")).json()) as TaskRow[];
  const created = tasksAfterCreate.find((t) => t.title === bugTitle);
  expect(created).toBeDefined();
  expect(created?.projectId).toBe(project.id);
  expect(created?.dueDate).toBe(expectedFri);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone.")).toBeVisible();
  const tasksAfterUndo = (await (await request.get("/api/tasks")).json()) as TaskRow[];
  expect(tasksAfterUndo.some((t) => t.title === bugTitle)).toBe(false);

  // @fri 14:00-15:00 creates a scheduled event; Tab toggles Task/Event.
  await captureBtn.click();
  await expect(dialog.getByLabel("Quick capture")).toBeFocused();
  const eventTitle = `Design review ${stamp}`;
  await dialog.getByLabel("Quick capture").fill(`${eventTitle} @fri 14:00-15:00`);
  await expect(dialog.getByRole("radio", { name: "Event" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  const events = (await (await request.get("/api/events")).json()) as {
    title: string;
    allDay: boolean;
    start: string;
    end: string;
  }[];
  const savedEvent = events.find((e) => e.title === eventTitle);
  expect(savedEvent).toBeDefined();
  expect(savedEvent?.allDay).toBe(false);

  // ! marks important; removable chips; unknown #project hints and still creates a loose task.
  await page.keyboard.press("n");
  const impTitle = `Urgent check ${stamp}`;
  await dialog.getByLabel("Quick capture").fill(`${impTitle} ! #unknown${stamp} @tomorrow`);
  await expect(dialog.getByText(/saves under No project/i)).toBeVisible();
  // Remove the @tomorrow chip
  await dialog.getByRole("button", { name: /^Remove / }).nth(2).click();
  await expect(dialog.getByRole("list", { name: "Detected tokens" }).locator("li")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);

  const tasksNow = (await (await request.get("/api/tasks")).json()) as TaskRow[];
  const impTask = tasksNow.find((t) => t.title === impTitle);
  expect(impTask).toBeDefined();
  expect(impTask?.important).toBe(true);
  expect(impTask?.projectId).toBeNull();
  expect(impTask?.dueDate).toBeNull();

  // Plain text creates a loose task, and Tab toggles Task <-> Event.
  await page.keyboard.press("n");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("radio", { name: "Event" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("radio", { name: "Task" })).toHaveAttribute("aria-checked", "true");
  const looseTitle = `Plain loose task ${stamp}`;
  await dialog.getByLabel("Quick capture").fill(looseTitle);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  const tasksFinal = (await (await request.get("/api/tasks")).json()) as TaskRow[];
  expect(tasksFinal.find((t) => t.title === looseTitle)?.projectId).toBeNull();
});

test("command palette (Ctrl+K and /), ? cheat sheet, and E / X on focused task", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop palette & keyboard shortcuts");
  const headers = { origin: baseURL! };
  const stamp = crypto.randomUUID().slice(0, 6);
  const project = await (
    await request.post("/api/projects", {
      headers,
      data: { name: `Alpha ${stamp}`, status: "Active", mutationId: crypto.randomUUID() },
    })
  ).json();
  const task = await (
    await request.post("/api/tasks", {
      headers,
      data: {
        title: `Keyboard target ${stamp}`,
        projectId: project.id,
        mutationId: crypto.randomUUID(),
      },
    })
  ).json();

  await page.goto("/");

  // `/` opens palette and "go to Calendar" navigates to Calendar.
  await page.keyboard.press("/");
  const palette = page.getByRole("dialog", { name: "Search and commands" });
  await expect(palette).toBeVisible();
  const searchInput = palette.getByLabel("Search workspace");
  await expect(searchInput).toBeFocused();
  await searchInput.fill("go to Calendar");
  await expect(palette.getByRole("option", { name: /Go to Calendar/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/calendar/);

  // Ctrl+K finds a project and navigates to its board.
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await searchInput.fill(`Alpha ${stamp}`);
  await expect(palette.getByRole("option", { name: new RegExp(`^Alpha ${stamp}`) })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/projects\\?project=${project.id}`));

  // Ctrl+K finds a task and opens its detail sheet.
  await page.keyboard.press("Control+k");
  await searchInput.fill(`Keyboard target ${stamp}`);
  await expect(palette.getByRole("option", { name: new RegExp(`^Keyboard target ${stamp}`) })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`task=${task.id}`));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // `?` opens the shortcut cheat sheet, and does not fire while typing in an input.
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Quick capture (Task or Event)")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // `E` opens the focused task's details; `X` completes the focused task.
  const taskLink = page.locator(`[data-task-link="${task.id}"]`);
  await taskLink.focus();
  await expect(taskLink).toBeFocused();
  await page.keyboard.press("e");
  await expect(page).toHaveURL(new RegExp(`task=${task.id}`));
  await page.keyboard.press("Escape");

  await taskLink.focus();
  await page.keyboard.press("x");
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Task completed." })).toBeVisible();
  const updated = (await (await request.get(`/api/tasks/${task.id}`)).json()) as { status: string };
  expect(updated.status).toBe("Done");

  // Typing ?, e, x, / inside an input field does not trigger global shortcuts.
  const addInput = page.getByLabel("Add task to To do");
  await addInput.focus();
  await addInput.type("?ex/");
  await expect(addInput).toHaveValue("?ex/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("mobile swipe gestures (right = complete, left = tomorrow, both undoable), mobile + capture, ⋯ menu, and local PWA install check", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== "mobile", "Phone viewport check for swipe and PWA");
  const headers = { origin: baseURL! };
  const stamp = crypto.randomUUID().slice(0, 6);
  const prefs = (await (await request.get("/api/preferences")).json()) as { timezone: string };
  const expectedTomorrow = tomorrowDate(prefs.timezone);

  // 1. PWA manifest & icon check from localhost.
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifestRes = await request.get(manifestHref!);
  expect(manifestRes.status()).toBe(200);
  const manifest = (await manifestRes.json()) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    theme_color: string;
    icons: { src: string; sizes: string; type: string }[];
  };
  expect(manifest.name).toBe("Relay");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of manifest.icons) {
    const iconRes = await request.get(icon.src);
    expect(iconRes.status()).toBe(200);
    expect(iconRes.headers()["content-type"]).toContain("image/png");
    const bytes = await iconRes.body();
    expect(bytes.subarray(0, 4).toString("hex")).toBe("89504e47"); // PNG magic bytes
  }

  // 2. Mobile `+` tab bar opens the same Capture dialog.
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("dialog", { name: "Capture" })).toBeVisible();
  await page.getByRole("button", { name: "Close capture" }).click();

  // 3. Swipe right to complete & swipe left to push to tomorrow on Projects mobile board, both undoable, plus ⋯ menu works.
  const project = await (
    await request.post("/api/projects", {
      headers,
      data: { name: `Mobile ${stamp}`, status: "Active", mutationId: crypto.randomUUID() },
    })
  ).json();
  const swipeDone = await (
    await request.post("/api/tasks", {
      headers,
      data: { title: `Swipe complete ${stamp}`, projectId: project.id, mutationId: crypto.randomUUID() },
    })
  ).json();
  const swipeTom = await (
    await request.post("/api/tasks", {
      headers,
      data: { title: `Swipe tomorrow ${stamp}`, projectId: project.id, mutationId: crypto.randomUUID() },
    })
  ).json();

  await page.goto(`/projects?project=${project.id}`);
  const doneCard = page.locator(`[data-task-card="${swipeDone.id}"]`);
  await expect(doneCard).toBeVisible();

  // Swipe right -> complete
  await touchSwipe(page, doneCard, 110);
  const completeToast = page.locator("[data-sonner-toast]").filter({ hasText: "Task completed." }).last();
  await expect(completeToast).toBeVisible();
  expect(((await (await request.get(`/api/tasks/${swipeDone.id}`)).json()) as { status: string }).status).toBe("Done");

  // Undo completion
  await completeToast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone.")).toBeVisible();
  expect(((await (await request.get(`/api/tasks/${swipeDone.id}`)).json()) as { status: string }).status).toBe("To do");

  // Swipe left -> push to tomorrow
  const tomCard = page.locator(`[data-task-card="${swipeTom.id}"]`);
  await touchSwipe(page, tomCard, -110);
  const tomToast = page.locator("[data-sonner-toast]").filter({ hasText: "Moved to tomorrow." }).last();
  await expect(tomToast).toBeVisible();
  expect(((await (await request.get(`/api/tasks/${swipeTom.id}`)).json()) as { dueDate: string | null }).dueDate).toBe(expectedTomorrow);

  // Undo tomorrow push
  await tomToast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone.")).toBeVisible();
  expect(((await (await request.get(`/api/tasks/${swipeTom.id}`)).json()) as { dueDate: string | null }).dueDate).toBeNull();

  // ⋯ menu fallback still works on mobile
  await page.getByRole("button", { name: `Actions for ${swipeTom.title}` }).click();
  await expect(page.getByRole("menuitem", { name: "Open details" })).toBeVisible();
  await page.keyboard.press("Escape");

  // No horizontal overflow on mobile
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("phase 4 verification screenshots", async ({ page, request, baseURL }, info) => {
  test.skip(process.env.RELAY_SCREENSHOTS !== "1", "Set RELAY_SCREENSHOTS=1 to capture docs/phase4-screens");
  mkdirSync("docs/phase4-screens", { recursive: true });
  const headers = { origin: baseURL! };
  const stamp = crypto.randomUUID().slice(0, 4);
  const p = await (
    await request.post("/api/projects", {
      headers,
      data: { name: "Relay", status: "Active", mutationId: crypto.randomUUID() },
    })
  ).json();
  await request.post("/api/tasks", {
    headers,
    data: { title: `Polish quick capture ${stamp}`, projectId: p.id, dueDate: tomorrowDate("Asia/Jakarta"), important: true, mutationId: crypto.randomUUID() },
  });

  if (info.project.name === "desktop") {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await page.keyboard.press("n");
      const dialog = page.getByRole("dialog", { name: "Capture" });
      await dialog.getByLabel("Quick capture").fill("Fix login bug #relay @fri !");
      await expect(dialog.getByRole("list", { name: "Detected tokens" }).locator("li")).toHaveCount(3);
      await page.screenshot({ path: `docs/phase4-screens/capture-1440-${scheme}.png` });
      await page.keyboard.press("Escape");

      await page.keyboard.press("/");
      const palette = page.getByRole("dialog", { name: "Search and commands" });
      await palette.getByLabel("Search workspace").fill("relay");
      await page.screenshot({ path: `docs/phase4-screens/palette-1440-${scheme}.png` });
      await page.keyboard.press("Escape");

      await page.keyboard.press("?");
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
      await page.screenshot({ path: `docs/phase4-screens/shortcuts-1440-${scheme}.png` });
      await page.keyboard.press("Escape");
    }
  } else {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await page.getByRole("button", { name: "Capture" }).click();
      await page.getByRole("dialog", { name: "Capture" }).getByLabel("Quick capture").fill("Fix login bug #relay @fri !");
      await page.screenshot({ path: `docs/phase4-screens/capture-390-${scheme}.png` });
      await page.getByRole("button", { name: "Close capture" }).click();
    }
  }
});
