---
title: Relay PRD v3
version: 3.2
status: draft for review
date: 2026-11-17
supersedes: "[[Initial PRD]] (v2.0) and repo docs/PRD.md (v2.4)"
---

# Relay — PRD v3 (Core first)

> [!summary] One line
> A calm, fast personal planner: **projects hold tasks, tasks go on the calendar, and one Today screen tells me what matters now.** Three screens, nothing else. AI comes after the core feels great.

## 1. Why v3

v2 tried to be an AI organizer, a task manager, a calendar, an audit log and a recovery system all at once. Building it produced a cluttered, generic UI: forms on every screen, helper paragraphs, visible reorder arrows and dropdowns on cards, and seven nav items.

v3 cuts the MVP to the non-negotiables and treats **clean, quick and calm** as requirements, not polish.

## 2. Non-negotiables (MVP)

1. **Uncluttered workspace.** Projects contain tasks. Tasks can be put on the calendar as events. Everything is visible and editable with quick gestures.
2. **Easy input.** Capturing a task or event takes one shortcut and one line of text.
3. **Accessible anywhere.** Deployed and signed in from laptop or phone, and installable as an app (PWA).
4. **Clean UI and smooth animation.** This counts as an acceptance criterion, not "Phase 4 polish".
5. **Optional links.** A task doesn't need a project. An event doesn't need a task.
6. **Kanban-style status board.** Inside the Projects screen, tasks are grouped by status and dragged between groups. There's no separate kanban screen (decided 2026-11-17).
7. **Calendar view.**
8. **Three central screens: Today, Projects, Calendar.** That is where 90% of the time goes.

Anything not serving one of these is out of the MVP.

## 3. Screens

Navigation is three items plus a search/quick-add trigger and an avatar menu (Settings, Sign out). On desktop it's a slim icon rail or top bar. On mobile it's a bottom tab bar with a center **+** button.

**Moving between screens:**
- The order is fixed: **Today ← → Projects ← → Calendar**. `Ctrl+←` and `Ctrl+→` move one screen left or right, and `1`, `2`, `3` jump straight to a screen.
- These shortcuts only work when you're not typing in a text field, because inside one `Ctrl+←/→` jumps between words.
- On macOS, `Ctrl+←/→` switches desktops, so the Mac binding is `⌘⌥←/→`.
- **The transition must feel instant.** The shell (navigation and header) stays put and only the content area animates. It slides in the direction of travel, with a short fade, in 150–200 ms. All three screens are prefetched and their data is cached, so there's never a loading flash between them. A key press interrupts any animation that's still running, so holding the key never queues animations up.
- The active indicator in the navigation slides to the new item (a shared layout animation).
- With reduced motion on, it's a plain crossfade.
- Each screen keeps its scroll position and view state when you come back to it, e.g. the calendar's week, or an expanded project.

### 3.1 Today (home)
Purpose: open the app, know in 5 seconds what matters, start working.

Today is **one timeline of the day**, not a dashboard of sections. The timeline is the screen's single hero element.

- **Header:** the date, a one-sentence summary computed from data (e.g. "4 things today · next: Design review in 40 min"), and the Capture button.
- **Catch-up line (only when needed):** one line above the timeline, e.g. "2 overdue · Review". Clicking it expands the overdue tasks in place, each with one-tap *Today*, *Tomorrow* or *Pick date* actions. It never takes over the page.
- **Timeline:** today's events and scheduled task blocks in time order, with a live **now line** running through them. Tasks *due* today but not scheduled sit in a short "Due today, unscheduled" group at the top, with a one-tap *Schedule* action that opens Schedule mode (§3.3).
- **Urgency comes from time:** the now line, the countdown to the next item, and "time left today". It doesn't come from more sections or red badges.
- **Day clear:** when everything today is done, the timeline is replaced by a calm "Day clear" state with a small completion moment (§6).

Not on Today: coming up and future deadlines (they live on the Calendar) and loose tasks (they live on Projects, under "No project").

**Quick capture button** in the Today header, always visible, labelled with its shortcut (`+ Capture  N`). It opens the same quick add as the shortcut (§4), so there's no form on the page itself. If the day is empty, say so in one line, and the capture button is the obvious next step.
	
### 3.2 Projects (split view)
One screen, two panes. The task board is the hero element.

**Left pane: project list**
- **No project** is pinned first. It holds every loose task, so loose tasks always have a home.
- Projects are grouped by status: **Active, Planned, Paused** and a collapsed **Done**. Drag a project between groups to change its status, or within a group to reorder it.
- Each row shows the name, a thin progress bar (done tasks / total) and the next deadline. Nothing else is visible.
- `↑/↓` moves through projects. `Ctrl+N` (or `+` at the list top) creates a project inline.

**Right pane: the selected project's task board**
- A header with the title, description and deadline, each editable inline.
- Tasks are grouped by status as **To do / Done** (the **Doing** status was removed on 2026-11-21), laid out as kanban columns on wide screens. Drag a task between groups to change its status and within a group to reorder it. Checking a task completes it and animates it into Done.
- Typing at the bottom of a group adds a task with that status.
- A small strip shows this project's upcoming events.
- Moving a task to another project: drag it onto a project in the left pane, or use the context menu.

**Narrow screens:** the list and the board become two levels. Tap a project to open its board, and swipe back to return. Groups stack vertically, and you change a task's status with a long-press drag or the `⋯` menu.

### 3.3 Calendar
- Week view by default. Month and day views are one click away. Agenda is the mobile default.
- Drag an event to move it, and drag its edge to resize.
- Click empty space to create an event inline (title plus time; Enter to save).

**Schedule mode** — the main way to turn tasks into planned time.
- **Enter it** with `S` on the Calendar, the *Schedule* button in the calendar header, or *Schedule* on any task elsewhere (which opens the Calendar in Schedule mode with that task highlighted).
- **A floating panel opens next to the cursor** (or anchored to the button, if you clicked it). It's compact, can be dragged elsewhere, and stays open while you work. It contains:
  - a search field, focused immediately so you can type to filter;
  - **unscheduled tasks**, grouped by project (with *No project* first), each showing its due date if it has one;
  - **projects without a deadline**.
- **Drop targets:**

| Drag this | onto a **time slot** | onto a **day / all-day row** |
|---|---|---|
| Task | Creates a linked event, a time block 1 hour long by default. Resize it afterwards. | Sets the task's **due date** |
| Project | — (not allowed) | Sets the project's **deadline** |

- After a drop, the item animates out of the panel and lands on the calendar, with an Undo toast. The panel stays open for the next one.
- Shift+drop schedules a task and keeps it in the panel, so it can get several sessions.
- Keyboard: `↑/↓` picks an item, `Enter` "picks it up", arrow keys move a ghost across slots, `Enter` drops it, and `Esc` cancels. `Esc` with nothing picked up leaves Schedule mode.
- **Touch:** tap an item to pick it up, then tap a slot or day to place it. Drag also works, but tap-to-place is the reliable path on a phone.
- The calendar dims slightly outside working hours while in Schedule mode, so free time stands out. Free slots highlight under the dragged item.

- Three visual types, each shown with an icon as well as a color: **event**, **task deadline** and **project deadline**. Planned work is just an event linked to a task, so it needs no fourth type.
- No filter checkboxes or legends shown permanently. Filters live in one small popover.

## 4. Input

- **Global quick add:** `N` anywhere, the **Capture** button on Today, or the **+** button on mobile. It opens one input line. (`Ctrl/Cmd+K` opens the same box in search mode.)
  - Plain text creates a loose task.
  - **Deterministic tokens** (no AI): `#project` assigns a project, `@tomorrow`, `@fri` or `@17/12` sets the due date, `@fri 14:00-15:00` makes it a scheduled event, and `!` marks it important. Tokens render as removable chips as you type.
  - A Tab key or button toggles between Task and Event.
- The same palette also searches and navigates (projects, tasks, "go to calendar").
- **Inline editing everywhere:** click a title to rename it. Details open in a side sheet (desktop) or bottom sheet (mobile), never a separate page or modal form.
- **Gestures**
  - Drag: projects between status groups, tasks between status groups, task to project, task or project into the calendar (Schedule mode), and moving or resizing events.
  - Mobile swipe: right to complete, left to push to tomorrow.
  - Keyboard: `N` new, `/` search, `E` edit, `X` complete, `S` Schedule mode, `1/2/3` and `Ctrl+←/→` switch screens (see §3). Pressing `?` shows a shortcut cheat sheet. Each control's tooltip shows its shortcut once.
- Every action that changes data shows an **Undo** toast. There is no History page.

## 5. Data model (minimal)

| Entity | Fields |
|---|---|
| User | id, auth identity, timezone |
| Project | id, owner, name, description, status (Planned/Active/Paused/Done), deadline (date, optional), position, archivedAt, timestamps |
| Task | id, owner, **projectId (optional)**, title, notes, status (To do/Done), important (bool), dueDate (date, optional), position, completedAt, timestamps |
| Event | id, owner, **taskId (optional)**, projectId (optional), title, start, end, allDay, timestamps |

Rules:
- "Scheduling a task" = creating an Event with `taskId`. A task can have several sessions. Completing the task does not delete its events.
- Deleting a project deletes its child tasks together after confirmation, with one combined Undo restoring both. Loose tasks are never affected.
- Date-only deadlines stay on their calendar date in any time zone. Timed events are stored in UTC and shown in the user's time zone.
- Soft delete is used only to support Undo. It's single-user, with all rows scoped to the owner.

**Removed from the current schema:** check-ins, dependencies, priority (Low/Med/High), the important/urgent matrix, blockerReason, estimate, plannedDate (replaced by task-linked events). These columns and tables stay **dormant** in the database (no UI, no API) until a later cleanup, because old undo history still references them. **Kept as invisible plumbing:** the activity log and revision counters, which power Undo toasts and safe retries. There is no History page.

## 6. Design direction

Run **Impeccable** to define a fresh DESIGN.md before touching UI. The current warm brown and honey theme is open for replacement.

Rules for "uncluttered":
- **One primary action per screen.** No forms embedded in pages.
- **No helper or explanatory paragraphs** in the UI ("Displayed in Asia/Jakarta…", the history disclaimer and similar). If something needs explaining, the design is wrong.
- **Controls appear on hover or focus on desktop,** not permanently on cards. On touch screens, each card or row has one small `⋯` button, so actions are discoverable without hover. Accessibility alternatives live in that menu, the right-click menu and keyboard shortcuts, not as extra visible buttons.
- **One hero element per screen:** the day timeline on Today, the task board on Projects, and the time grid on Calendar. Everything else is visually secondary.
- **Hierarchy from type and space, not boxes.** No wall of same-weight bordered cards. Most grouping comes from spacing and headings, and borders are the exception.
- No card-in-card nesting. Use whitespace and type hierarchy before borders. Use one accent color.
- Density: show less, and let every element earn its place.

Motion, using the `motion` library:
- Layout animation when cards move between columns, list items reorder, or tasks complete (check, then collapse out).
- Shared-element transition from card to detail sheet.
- **Completion is the moment worth animating:** the check draws, the row strikes through and collapses out, and Done counts tick up. When Today is fully done, show a short, tasteful "Day clear" moment. No confetti spam. Everything else stays quiet.
- 150–250 ms, spring-based, with no page-load choreography. Respect reduced motion.
- Target: 60 fps drags on a mid-range phone.

### Mobile (to be validated once the desktop screens exist)
- Moving between screens uses the bottom tab bar only. There's no horizontal page swipe, which would clash with swiping rows to complete them.
- Projects: two levels (project list → task board) with stacked status groups.
- Scheduling: tap-to-place in Schedule mode, plus a "Schedule" sheet with suggested slots (next free hour, this evening, tomorrow morning).

## 7. Stack and hosting

Keep the existing stack: Next.js, TypeScript, Tailwind, shadcn/ui, dnd-kit, FullCalendar v7, Drizzle, Better Auth with Google, Zod, motion and Sonner.

Changes:
- **Hosting:** deploy to **Vercel** with **Turso (libSQL)** as the database. This keeps the SQLite schema and Drizzle code with a driver swap from `better-sqlite3`. A small VPS with a SQLite file is the alternative if you'd rather not use Turso.
- **Sign-in:** Google, allow-listed to my email only.
- **PWA:** manifest and icons so it installs on phone and desktop. Offline mode is out of scope.
- **Optimistic UI:** every gesture updates instantly and rolls back on server error. This is what makes it feel smooth.

## 8. Out of scope for MVP

AI of any kind (§10), the Inbox page, Chat page, History page, check-ins, task dependencies, Focus Mode, recurring tasks, external calendar sync, notifications, team features, analytics and native apps.

## 9. Build plan

**Phase 0 — Cut (≈1 day).** On a branch, remove the Inbox, Chat and History pages, check-ins, dependencies, priority and the matrix (the activity log and revisions stay as plumbing for Undo). Migrate the schema to §5 and convert existing `plannedDate` values into linked events. Navigation becomes three items. Done when the app runs with only Today, Projects and Calendar, and existing projects, tasks and events survive.

**Phase 1 — Design reset.** Impeccable writes the new DESIGN.md and PRODUCT.md. Rebuild the shell and navigation, then Today. Done when Today passes the "5-second test" on desktop and phone and an Impeccable critique raises no clutter findings.

**Phase 2 — Projects and tasks.** Split view with the project list (status groups and drag) and the task board (status groups as kanban columns and drag), the No project entry, side sheet, `⋯` and context menus, and completion animation.

**Phase 3 — Calendar.** Week, month and day views, inline create, move and resize, and **Schedule mode**: the floating panel, the drop rules, keyboard pick-up and drop, and tap-to-place.

**Phase 4 — Input and gestures (local only).** Quick add with tokens, the command palette, keyboard shortcuts (`?`, `E`, `X`), mobile swipes, local PWA manifest/icons, and branch cleanup.

**Deploy phase (deferred).** Deploy to Vercel with Turso (libSQL) and enforce the Google sign-in email allow-list.

### MVP acceptance
1. Create a project, add 5 tasks, drag tasks between To do and Done, drag the project from Planned to Active, and refresh: everything persists.
2. Capture "Fix login bug #relay @fri" in one line, and it lands in the right project with a Friday due date.
3. Press `S` on the Calendar and drag a task from the panel onto Thursday 10:00: a linked event appears. Drag another task onto Friday's day row: it gets that due date. Drag a project onto a day: it gets that deadline. All three can be undone.
4. Create a loose task and a standalone event, both with no links.
5. Today's timeline correctly shows today's events, scheduled blocks and due-today tasks, with a moving now line. The catch-up line counts overdue items correctly, and the summary line matches.
6. Every change can be undone from its toast.
7. Installable locally as a PWA from `localhost`, with swipe gestures tested on a phone viewport.
8. Typecheck, lint, the key Vitest tests and one Playwright flow per screen all pass.

## 10. After MVP — AI layer (in order)

1. **MCP server first.** Relay exposes tools such as `list_today`, `search`, `create_task`, `update_task`, `create_event` and `move_event`. Claude, MausBot or any MCP client can manage Relay right away, with no chat UI to build. This is the cheapest path to AI.
2. **In-app chat (BYO model).** Custom OpenAI-compatible base URL, key and model (e.g. 9Router) using the Vercel AI SDK. It reuses the same tool layer as the MCP server, and changes are proposed, then confirmed.
3. **Get me back on track.** After 3 or more idle days, Today offers a catch-up: what slipped, what's due soon, and a proposed plan (reschedule, pause, drop). You approve each item. Nothing changes silently.
4. **Natural-language input.** Quick add accepts free text ("finish slides before Wednesday and book a dentist next week") and previews structured items before creating them.
5. **Scheduling assistant.** "Find time for these 3 tasks this week" proposes calendar blocks around existing events.

Rules carried over from v2: the AI proposes and the app validates and executes. Every change goes through Zod-validated tools, with no raw SQL. Manual features keep working when the AI is down.

## 11. Decision log
- **2026-11-17 (v3.0):** cut the MVP to Today, Projects and Calendar. AI comes after the MVP.
- **2026-11-17 (v3.1):** a Capture button on Today. `Ctrl+←/→` and `1/2/3` switch screens with a directional slide.
- **2026-11-17 (v3.2):** Today is a single timeline. Projects is a split view whose task board, grouped by status and draggable, replaces a separate kanban screen. Loose tasks live under "No project". Task statuses stay To do / Doing / Done. Schedule mode (`S`) uses a floating panel near the cursor for dropping tasks and projects onto the calendar. Touch screens get a `⋯` button. One hero element per screen, and completion is the animation moment. The mobile approach is agreed in principle and will be validated later.
- **2026-11-17 (v3.2a, planning):** keep the activity log and revisions as invisible Undo plumbing. Removed fields stay dormant in the database instead of being dropped. Task statuses map Backlog/Next→To do, In Progress/Blocked→Doing; project Completed→Done.
- **2026-11-21 (Phase 4 planning & `862e077`):** removed the `Doing` task status (tasks are `To do` or `Done`). Deferred Vercel, Turso, and Google allow-list into a later Deploy phase; Phase 4 acceptance #7 is verified locally (`localhost` PWA install + phone-viewport swipes). Confirmed project deletion removes child tasks with one combined Undo, and archived projects stay as a collapsed group.
- **2026-11-22 (v3.3 — linear scheduling, usable time, recurring tasks & capture):** removed task time-blocking in favor of linear, time-agnostic task scheduling (`executionDate` + `dayOrder`) budgeted against each day's **usable time** (`working hours window − overlapping timed events`, with per-weekday defaults in Settings and per-date overrides). Default `taskType` weights updated to `Instant = 15m`, `Medium = 45m`, `Deep = 90m` (customizable in Settings). Tasks use `executionDate` only; hard deadlines live on projects (now supporting optional time + timezone) and surface on Today alongside events. Added recurring tasks created from Capture (atomic spawn-next on completion with combined Undo; missed occurrences auto-advance). Expanded Capture with contextual structured controls under the title for Task, Project, and Event.
