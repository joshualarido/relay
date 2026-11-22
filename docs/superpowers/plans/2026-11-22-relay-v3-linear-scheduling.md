# Relay v3.3 Revision Plan — Linear Scheduling, Usable Time, Recurring Tasks & Capture

**Date:** 2026-11-22
**Status:** Draft for review (awaiting authorization to implement)
**Authority:** Revises `docs/PRD.md` (v3.2 → v3.3)

---

## 1. Goals & Locked Decisions

1. **Remove task time-blocking; adopt linear, capacity-budgeted scheduling.**
   - Tasks are scheduled to an **execution date** (`YYYY-MM-DD`, nullable) and ordered linearly within that day (`dayOrder`), never bound to a clock slot.
   - Tasks no longer have a separate due date (`dueDate`/`dueAt` dormant in SQLite); hard deadlines live on **projects** (with optional time) and fixed commitments live on **events** (with datetime).
   - **Usable time** per day = that day's **working-hours window** (per-weekday default in Settings, overridable per specific date) minus any timed events overlapping that window.
   - **Task type weights** (cost against usable time): defaults **`Instant = 15m`**, **`Medium = 45m`**, **`Deep = 90m` (1.5h)**, all customizable in Settings.
2. **Recurring tasks (created from Capture & editable in details).**
   - Patterns: `Daily`, `Weekdays`, `Weekly` (selected weekdays), `Monthly` (day of month), `Custom` (`every N days/weeks`), plus optional `endDate`.
   - **On completion:** marks the current task `Done` (preserving `completedAt` for `TodayProgress` momentum/streaks) and atomically spawns the next `To do` occurrence on the next rule date in one Undoable operation.
   - **On missed date:** **auto-advance** — if an open recurring task has `executionDate < today`, it advances to the next scheduled occurrence on or after `today` (never clogs Catch-up).
   - **Calendar preview:** projects upcoming occurrences virtually on Calendar without pre-inserting future rows.
3. **Capture revisions.**
   - Keep the fast single-line title input on top (deterministic `#project`, `@date`, `!` tokens continue working).
   - Add compact contextual controls directly **under the title**:
     - **Task:** Execution date, Task type (`Instant` / `Medium` / `Deep`), Recurring toggle + rule picker, Project.
     - **Project:** Deadline (date + optional time).
     - **Event:** Datetime (date + start/end time, or All-day toggle) + optional Project.
4. **Deadlines in Today + Option A Today layout.**
   - **Top:** `TodayGlance` capacity bar (`planned / usable`, quick per-day working hours override, remaining count, next timed event/deadline).
   - **Schedule & Deadlines:** today's events + **project deadlines due today** (timed or date-only), chronological with live now-line for timed items.
   - **Today's Queue:** linear, drag-to-reorder task list for today (`taskType` weight pills, repeat indicator, quick complete, mobile swipes).
   - **Progress sidebar:** keep `TodayProgress` intact; update `computeMomentum`'s `followThroughPct` to read `executionDate`.
5. **Local DB reset authorized at handoff.**
   - At the end of verified implementation, take an integrity-checked private backup, reset the local SQLite database, run fresh migrations, and leave it clean/unseeded.

---

## 2. Schema & Data Model Changes

Keep legacy columns (`task.startAt`, `task.endAt`, `task.allDay`, `task.dueDate`, `task.dueAt`, `task.timezone`) dormant in SQLite so existing activity snapshots remain structurally valid; stop reading/writing them in active v3.3 workflows.

- **`preferences` table:**
  - `workingHoursJson`: text JSON — per-weekday `{ enabled: boolean; start: string; end: string }` (`"09:00"`–`"17:00"` Mon–Fri, disabled Sat–Sun by default).
  - `taskTypeMinutesJson`: text JSON — `{ Instant: number; Medium: number; Deep: number }` (default `{ Instant: 15, Medium: 45, Deep: 90 }`).
- **New `day_working_hours_override` table:**
  - `ownerId`, `date` (`YYYY-MM-DD`), `enabled` (bool), `start` (`HH:MM`), `end` (`HH:MM`), `updatedAt`. Unique index on `(ownerId, date)`.
- **`task` table:**
  - `executionDate`: text (`YYYY-MM-DD`, nullable)
  - `dayOrder`: integer (default `0`)
  - `recurrenceRule`: text JSON nullable (`{ frequency: "daily" | "weekdays" | "weekly" | "monthly" | "custom"; interval: number; weekdays?: number[]; dayOfMonth?: number; endDate?: string | null }`)
  - `recurrenceSeriesId`: text nullable
- **`project` table:**
  - `deadlineAt`: text nullable (ISO instant when a time is set)
  - `deadlineTimezone`: text nullable (IANA zone paired with `deadlineAt`)
  - Keep `deadline` (`YYYY-MM-DD`) for date-only deadlines; mutually exclusive with `deadlineAt`.

---

## 3. Implementation Packages

### Package 1 — Schema, Migrations, Preferences & Core Domain Logic
- Add Drizzle migration for `preferences`, `day_working_hours_override`, `task`, and `project` columns.
- Create `src/lib/capacity.ts`:
  - Resolve effective working window for any date (override → weekday default).
  - Clip timed events overlapping the working window (merge overlapping events so double-booked time isn't subtracted twice; ignore events outside the working window).
  - Sum planned/remaining `taskType` minutes using the user's configured `taskTypeMinutes`.
  - Return `{ workingMinutes, eventMinutes, usableMinutes, plannedMinutes, remainingMinutes, overbookedMinutes, window }`.
- Create `src/lib/recurrence.ts`:
  - Zod schema for `RecurrenceRule`.
  - `nextOccurrenceDate(rule, fromDate)` (DST-safe via `Temporal.PlainDate`).
  - `advanceMissedRecurringTasks(db, ownerId, today)` — updates any open recurring task with `executionDate < today` to the next rule date `>= today` (respecting `endDate`).
  - `projectRecurringDates(rule, startAfter, rangeStart, rangeEnd)` for Calendar previews.
- Update `src/lib/preferences.ts` & `/api/preferences` + new `/api/working-hours/[date]` route for per-date overrides.
- Update `src/services/tasks.ts` & `/api/tasks*`:
  - Support `executionDate`, `dayOrder`, `recurrenceRule`, `recurrenceSeriesId`.
  - Atomic `completeTask`: when completing a recurring task, mark it `Done` and spawn the next `To do` occurrence in the same transaction + single Undo operation.
  - Add day-queue reorder endpoint/action (`dayOrder`).
- Update `src/services/projects.ts` & `/api/projects*`: support date-only (`deadline`) or timed (`deadlineAt` + `deadlineTimezone`) deadlines.
- Update `src/lib/momentum.ts`: compute `followThroughPct` from `executionDate`.
- Add unit & integration tests for capacity math, recurrence rules/auto-advance/Undo, timed project deadlines, and preferences.

### Package 2 — Today Screen (Capacity + Deadlines + Linear Queue)
- Update `src/lib/today.ts`:
  - Run `advanceMissedRecurringTasks` for `today`.
  - Compute day capacity via `src/lib/capacity.ts`.
  - Return `events` (today's timed & all-day events), `deadlines` (projects due today, timed or date-only), `tasks` (today's tasks ordered by `dayOrder`), `overdue` (non-recurring open tasks with `executionDate < today`), `capacity`, `summary`, `dayState`.
- Update `src/components/today-glance.tsx`:
  - Display usable time & planned load bar (e.g. `2h 45m / 5h 30m usable`, warning state if overbooked) with a quiet popover to edit today's working hours override.
  - Display remaining task count and next timed event or project deadline.
- Update `src/app/(workspace)/page.tsx` & Today components:
  - **Schedule & Deadlines** section: chronological list of today's events and today's project deadlines (with live `NowLine` for timed items).
  - **Today's Queue** section: linear drag-to-reorder task list (`@dnd-kit`) with `taskType` weight pills, recurrence badge, quick complete, `E`/`X` shortcuts, and mobile swipe right (complete) / left (push to tomorrow).
  - Keep **Catch-up** (non-recurring overdue tasks) and **TodayProgress** sidebar.

### Package 3 — Capture Revisions, Settings & Detail Sheets
- Update `src/components/quick-capture.tsx` & `src/lib/capture-parser.ts`:
  - Keep title input + live token chips at top.
  - Add compact, contextual fields **under the title**:
    - **Task:** Execution date picker (with quick `Today` / `Tomorrow` chips), `taskType` segmented control (`Instant 15m` / `Medium 45m` / `Deep 1.5h` reflecting user settings), Recurring toggle + rule controls, Project selector.
    - **Project:** Deadline date + optional time input.
    - **Event:** Date + Start/End time + All-day toggle + optional Project.
  - Sync tokens with the fields cleanly (typing `@tomorrow` populates execution date; manual field edits win cleanly).
- Update `src/components/preferences-form.tsx` (Settings):
  - Weekly working hours grid (Sun–Sat enable toggle + start/end time).
  - Task type durations (`Instant`, `Medium`, `Deep` minutes).
- Update `src/components/task-form.tsx`, `src/components/project-form.tsx`, and `src/components/projects/detail-sheet.tsx` for `executionDate`, `recurrenceRule`, and timed project deadlines.

### Package 4 — Calendar & Schedule Mode (Time-Agnostic Tasks + Capacity)
- Update `src/lib/calendar-schedule.ts`, `src/components/manual-calendar.tsx`, and `src/components/schedule-panel.tsx`:
  - Time grid displays **events** and **timed project deadlines**; all-day row displays all-day events, date-only project deadlines, and **day-level tasks** (plus virtual recurring previews).
  - Show each day's **usable time / planned load** badge in the day header (Week/Day) and cell header (Month), clickable to override that day's working hours.
  - **Schedule mode (`S`)**:
    - Dragging an unscheduled task onto a **day** sets its `executionDate` (no hour-slot time-blocking).
    - Dragging a project onto a **day** sets its `deadline`.
    - Dragging an event onto a **time slot** or **day** schedules the event.
    - Preserve keyboard pick-up/drop, tap-to-place, and Undo toasts.

### Package 5 — MCP Server, `relay-organizer` Skill, PRD & Verification
- Update `src/services/planning.ts` and `src/mcp/handlers.ts`:
  - Add `get_day_capacity` / working-hours override tools; update `schedule_task` to set `executionDate` (+ `dayOrder`), update `create_task`/`update_task` for `executionDate` & `recurrenceRule`, update `create_project`/`update_project` for timed deadlines, and update `get_today` response.
- Update `docs/skills/relay-organizer/SKILL.md` to plan around usable-time budgets, linear daily queues, recurring tasks, and `15m / 45m / 90m` defaults instead of time-blocking.
- Update `docs/PRD.md` (v3.3) to document the revisions.
- Run full verification: `npm run typecheck`, `npm run lint`, Vitest unit/integration suite, `npm run build`, Playwright desktop & mobile E2E (isolated test DB).
- Perform authorized local DB backup + clean reset + fresh migration verification.
