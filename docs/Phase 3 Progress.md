# Phase 3 Progress — Calendar and Schedule Mode

**Branch:** `v3/phase-3-calendar-neon`  
**Status:** Complete (ready for user click-through verification)  
**Dev server:** Running on `http://127.0.0.1:3001` (requested for live inspection)

---

## What Finished

### 1. Pure Schedule & Calendar Helper (`src/lib/calendar-schedule.ts`)
- Implemented `groupUnscheduledTasks` (open tasks without linked events, grouped by project with **No project** first, supporting search and `includeTaskIds` for highlighted / `Shift+drop` tasks).
- Implemented `listDatelessProjects` (non-archived, non-Done projects with `deadline === null`).
- Implemented DST-safe drop payload builders (`buildTaskDropAction`, `buildProjectDropAction`), including 60-minute `Temporal.Instant` duration, task-to-day `dueAt: null` / `timezone: null` clearing, and rejecting project-to-time drops.
- Implemented `buildEventResizeEnd`, `defaultInlineTimedRange`, `buildInlineEventPayload`, and `isWorkingHour` (`09:00–18:00` default).
- Added unit test suite (`tests/unit/calendar-schedule.test.ts`).

### 2. Calendar Views, Filter Popover & Direct Editing (`src/components/manual-calendar.tsx`, `src/app/globals.css`)
- **Views & state:** Defaults to **Month** (`dayGridMonth`) on desktop and **Agenda** (`listMonth`) on narrow screens (`<= 760px`), with **Week** and **Day** one click away. Active view and date persist in URL params (`?view=&date=`) across saves, reloads, and Undo.
- **Uncluttered chrome:** Removed the permanent `<fieldset className="calendar-legend">` and moved **Event**, **Task deadline**, and **Project deadline** toggles into a compact Radix **Filter** popover. Preserved distinct icon + color styling per `DESIGN.md`.
- **Inline event creation:** Clicking an empty timed slot (Week/Day) or day/all-day cell (Month/Week/Day) opens a compact inline popover with title focused and 1-hour timed or 1-day all-day defaults (editable before save). `Enter` creates a standalone event (`POST /api/events`); `Esc` cancels and restores focus.
- **Direct move & event-only resize:** Optimistic drag-to-move (`reschedule: true` for events) and event-only bottom/end edge resize (`PATCH /api/events/[eventId]` with `end` only). Per-record mutation serialization prevents revision collisions; failures roll back immediately with an inline `role="alert"` error; successes show the Undo toast.

### 3. Schedule Mode (`src/components/schedule-panel.tsx`, `src/components/manual-calendar.tsx`, `src/app/(workspace)/calendar/page.tsx`)
- **Entry points:** `S` shortcut on Calendar (respecting `isShortcutBlocked`), Calendar **Schedule** button, and **Schedule** task actions on Today (`src/app/(workspace)/page.tsx`) and Projects (`src/components/projects/board.tsx`, `detail-sheet.tsx`, `projects-view.tsx`) navigating to `/calendar?schedule=1&task=<id>` (highlighting the task without opening the Task details modal).
- **Floating panel:** Draggable raised panel on desktop (opens near pointer/anchor), docked cleanly above the bottom tab bar on mobile (`<= 760px`), auto-focuses search, and animates scheduled items out with `motion` (respecting `prefers-reduced-motion`).
- **Working-hours dim & placement:** Subtly dims outside `09:00–18:00` in Week/Day views while open, suppresses inline empty-slot creation while placing, highlights valid hovered/focused targets (rejecting project-to-time drops with no highlight and no write), and supports `Shift+drop` / `Shift+Enter` for multiple independent sessions.
- **Keyboard & touch:** `↑`/`↓` selects in panel, `Enter` picks up, arrow keys move a visible target ghost across days/slots (capture-phase so `ScreenShortcuts` does not hijack), `Enter` / `Shift+Enter` drops, `Esc` cancels pick-up, second `Esc` closes panel and restores focus, with `aria-live` announcements. On mobile (`<= 760px`), tapping an item picks it up and switches **Agenda → Day** so timed slots and the all-day row are directly tappable.

---

## Commits on `v3/phase-3-calendar-neon`

1. `8c14cae` — `feat(calendar): add calendar-schedule helper and unit tests`
2. `f01c30b` — `feat(calendar): views, filter popover, inline create, resize, and Schedule mode`
3. `87537d1` — `fix(calendar): bounding-box hit-testing, edge resize handle, and Phase 3 E2E tests`
4. *(next commit)* — `docs(v3): Phase 3 verification screenshots and progress log`

---

## Verification Results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass (0 errors) |
| Lint | `npm run lint` | Pass (0 errors, 0 warnings) |
| Unit & Integration | `npx vitest run tests/unit/calendar-schedule.test.ts tests/integration/events.test.ts tests/integration/tasks.test.ts tests/integration/projects.test.ts` | Pass (4 files, 29 tests) |
| Production Build | `npm run build` | Pass |
| Desktop E2E (prod server) | `RELAY_TEST_SERVER=production npx playwright test tests/e2e/calendar.spec.ts --project=desktop` | Pass (8/8 tests in 31.2s, including MVP acceptance #3) |
| Viewport & Theme Check | Isolated prod capture across `1440×900`, `1366×768`, `390×844` (light + dark) | Pass (`Month` default desktop, `Agenda` default mobile, Agenda → Day on pick-up, `noOverflow: true`) |

### Screenshots (`docs/phase3-screens/`)
- `calendar-1440-month-light.png` / `calendar-1440-month-dark.png`
- `calendar-1440-week-schedule-light.png` / `calendar-1440-week-schedule-dark.png`
- `calendar-1366-month-light.png` / `calendar-1366-month-dark.png`
- `calendar-390-agenda-light.png` / `calendar-390-agenda-dark.png`
- `calendar-390-schedule-day-light.png` / `calendar-390-schedule-day-dark.png`

---

## Manual Click-Through Checklist (on `http://127.0.0.1:3001/calendar`)

1. Confirm **Month** is default on desktop, permanent filter checkboxes are gone, and **Filter** popover toggles Events / Task deadlines / Project deadlines.
2. Click an empty Month day cell → type title → `Enter` creates an all-day event (`Esc` cancels without writing). Switch to **Week** → click an empty time slot → `Enter` creates a 1-hour timed event.
3. Drag an event to move it, and drag the bottom edge of a timed event to resize it; confirm **Undo** reverses cleanly.
4. Press `S` (or click **Schedule**): drag a task onto a time slot (1-hour linked event), drag a task onto a day/all-day row (`dueDate` set), drag a project onto a day row (`deadline` set), and confirm dragging a project onto a time slot is rejected.
5. Hold `Shift` while dropping a task onto a time slot to schedule a second independent session.
6. Test keyboard placement (`↑`/`↓` → `Enter` → arrows → `Enter` / `Esc`) and click **Schedule** from a task on Today or Projects.
7. Narrow viewport to `390×844`: confirm **Agenda** default, open **Schedule**, tap a task, and confirm view switches to **Day** for tap-to-place.

---

## Open Decisions / Notes

- **Working hours:** Fixed `09:00–18:00` dim in Schedule mode (no settings UI/migration in Phase 3).
- **Detail dialogs:** Kept existing `EventPanel` / `TaskPanel` on Calendar for Phase 3 as planned.
- **FullCalendar v7 `dateClick`:** Bypassed FullCalendar 7.1.5's internal `DateClicking` (which can throw on `cellRows[row][col]` in `height="auto"` Month grids) in favor of deterministic bounding-box hit-testing on `.calendar-day-cell` and `.calendar-slot-lane` / `.calendar-time-col`.
