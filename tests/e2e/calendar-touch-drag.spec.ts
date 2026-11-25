import { test, expect } from "@playwright/test";

test.use({ hasTouch: true });

test("touch long-press drags a calendar card to another day and toss zone while taps and scroll still work", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === "mobile", "Desktop spec with touch emulation");
  const headers = { origin: baseURL! };
  const suffix = crypto.randomUUID().slice(0, 6);

  const task = await (
    await request.post("/api/tasks", {
      headers,
      data: {
        title: `Touch task ${suffix}`,
        executionDate: "2027-02-10",
        mutationId: crypto.randomUUID(),
      },
    })
  ).json();

  await page.goto("/calendar?date=2027-02-10&view=week");
  const card = page.locator(`[data-calendar-record="task:${task.id}"]`).first();
  await expect(card).toBeVisible();

  const cdp = await page.context().newCDPSession(page);

  async function touchDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    holdMs: number,
    steps = 10,
  ) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x, y: from.y, id: 1 }],
    });
    if (holdMs > 0) await page.waitForTimeout(holdMs);
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y, id: 1 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }

  // 1) Quick tap (< 300ms) opens the task details dialog instead of dragging
  const box1 = (await card.boundingBox())!;
  await page.touchscreen.tap(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator('[data-drag-ghost="true"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 2) Immediate vertical swipe (scroll gesture before 300ms) does NOT trigger drag
  const box2 = (await card.boundingBox())!;
  await touchDrag(
    { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 },
    { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 + 90 },
    20,
    5,
  );
  await expect(page.locator('[data-drag-ghost="true"]')).toHaveCount(0);
  expect((await (await request.get(`/api/tasks/${task.id}`)).json()).executionDate).toBe("2027-02-10");

  // 3) Long-press (~300ms) picks up the card with visual feedback, then drags to another day
  const box3 = (await card.boundingBox())!;
  const targetDay = (await page.locator('.calendar-day-cell[data-date="2027-02-12"]').first().boundingBox())!;
  const startPt = { x: box3.x + box3.width / 2, y: box3.y + box3.height / 2 };

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startPt.x, y: startPt.y, id: 1 }],
  });
  await page.waitForTimeout(360);

  // Pickup visual feedback: touch-picked ghost + unschedule drop zone visible before moving
  await expect(page.locator('[data-drag-ghost="true"][data-touch-picked="true"]')).toBeVisible();
  await expect(page.locator('[data-unschedule-zone="true"]')).toBeVisible();

  const endPt = { x: targetDay.x + targetDay.width / 2, y: targetDay.y + targetDay.height / 2 };
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: startPt.x + ((endPt.x - startPt.x) * i) / 10,
          y: startPt.y + ((endPt.y - startPt.y) * i) / 10,
          id: 1,
        },
      ],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect
    .poll(async () => (await (await request.get(`/api/tasks/${task.id}`)).json()).executionDate)
    .toBe("2027-02-12");

  // 4) Long-press and drag onto the unschedule drop zone unschedules the task
  const movedCard = page.locator(`[data-calendar-record="task:${task.id}"][data-date="2027-02-12"]`).first();
  await expect(movedCard).toBeVisible();
  const box4 = (await movedCard.boundingBox())!;
  const start4 = { x: box4.x + box4.width / 2, y: box4.y + box4.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: start4.x, y: start4.y, id: 1 }],
  });
  await page.waitForTimeout(360);
  const zone = page.locator('[data-unschedule-zone="true"]');
  await expect(zone).toBeVisible();
  const zoneBox = (await zone.boundingBox())!;
  const zonePt = { x: zoneBox.x + zoneBox.width / 2, y: zoneBox.y + zoneBox.height / 2 };
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start4.x + ((zonePt.x - start4.x) * i) / 10,
          y: start4.y + ((zonePt.y - start4.y) * i) / 10,
          id: 1,
        },
      ],
    });
    await page.waitForTimeout(16);
  }
  await expect(zone).toHaveAttribute("data-active", "true");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect
    .poll(async () => (await (await request.get(`/api/tasks/${task.id}`)).json()).executionDate)
    .toBeNull();
});
