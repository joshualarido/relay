import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { Temporal } from "temporal-polyfill";
import { openDatabase } from "../../src/lib/db";
import { task } from "../../src/lib/db/schema";
import { eq } from "drizzle-orm";

test("seeded full Today dashboard screenshots (isolated test DB)", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "Desktop full Today screenshot");
  mkdirSync("docs/phase4-screens", { recursive: true });
  const headers = { origin: baseURL! };
  const tz = "Asia/Jakarta";
  const today = Temporal.Now.plainDateISO(tz);
  const todayStr = today.toString();

  // Create 3 active projects
  const relay = await (
    await request.post("/api/projects", {
      headers,
      data: { name: "Relay v3", status: "Active", deadline: today.add({ days: 12 }).toString(), mutationId: crypto.randomUUID() },
    })
  ).json();
  const site = await (
    await request.post("/api/projects", {
      headers,
      data: { name: "Personal Site", status: "Active", deadline: today.add({ days: 20 }).toString(), mutationId: crypto.randomUUID() },
    })
  ).json();
  const infra = await (
    await request.post("/api/projects", {
      headers,
      data: { name: "VPS Migration", status: "Active", mutationId: crypto.randomUUID() },
    })
  ).json();

  // Today's timeline: 2 events + 2 scheduled task blocks + 1 due-today task
  await request.post("/api/events", {
    headers,
    data: {
      title: "Design sync with Alex",
      allDay: false,
      timezone: tz,
      start: Temporal.PlainDateTime.from(`${todayStr}T10:00`).toZonedDateTime(tz).toInstant().toString(),
      end: Temporal.PlainDateTime.from(`${todayStr}T10:45`).toZonedDateTime(tz).toInstant().toString(),
      projectId: relay.id,
      taskId: null,
      location: "https://meet.google.com/abc-defg-hij",
      mutationId: crypto.randomUUID(),
    },
  });
  await request.post("/api/events", {
    headers,
    data: {
      title: "Gym session",
      allDay: false,
      timezone: tz,
      start: Temporal.PlainDateTime.from(`${todayStr}T17:30`).toZonedDateTime(tz).toInstant().toString(),
      end: Temporal.PlainDateTime.from(`${todayStr}T18:30`).toZonedDateTime(tz).toInstant().toString(),
      projectId: null,
      taskId: null,
      location: "",
      mutationId: crypto.randomUUID(),
    },
  });

  await request.post("/api/tasks", {
    headers,
    data: {
      title: "Ship Momentum dashboard on Today",
      projectId: relay.id,
      startAt: Temporal.PlainDateTime.from(`${todayStr}T14:00`).toZonedDateTime(tz).toInstant().toString(),
      endAt: Temporal.PlainDateTime.from(`${todayStr}T15:30`).toZonedDateTime(tz).toInstant().toString(),
      allDay: false,
      timezone: tz,
      important: true,
      mutationId: crypto.randomUUID(),
    },
  });
  await request.post("/api/tasks", {
    headers,
    data: {
      title: "Review DNS records & SSL renewal",
      projectId: infra.id,
      dueDate: todayStr,
      mutationId: crypto.randomUUID(),
    },
  });

  // Seed completed tasks across the last 6 days in the isolated test DB so the weekly bar chart & Momentum shine
  const dbPath = `${process.env.RELAY_TEST_DIR}/workspace.db`;
  const db = openDatabase(dbPath);
  const completedSpec: [number, string, string][] = [
    [0, relay.id, "Polish Spotlight search bar"],
    [0, relay.id, "Add instant task archiving"],
    [1, relay.id, "Build Schedule mode drop rules"],
    [1, site.id, "Write portfolio case study"],
    [1, infra.id, "Rotate SSH keys on VPS"],
    [2, relay.id, "Implement mobile swipe gestures"],
    [2, site.id, "Optimize hero images"],
    [4, relay.id, "Add PWA manifest and icons"],
    [4, infra.id, "Configure automated backups"],
    [5, relay.id, "Ship capture token parser"],
    [5, site.id, "Update typography tokens"],
  ];

  for (const [daysAgo, projectId, title] of completedSpec) {
    const created = await (
      await request.post("/api/tasks", {
        headers,
        data: { title, projectId, status: "Done", mutationId: crypto.randomUUID() },
      })
    ).json();
    const d = today.subtract({ days: daysAgo }).toString();
    const completedAt = Temporal.PlainDateTime.from(`${d}T15:00`).toZonedDateTime(tz).toInstant().toString();
    db.update(task).set({ completedAt, startAt: d, endAt: today.subtract({ days: daysAgo - 1 }).toString(), allDay: true }).where(eq(task.id, created.id)).run();
  }
  db.$client.close();

  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByText("On track")).toBeVisible();
    await page.screenshot({ path: `docs/phase4-screens/today-full-${scheme}.png`, fullPage: true });
  }
});
