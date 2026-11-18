---
title: Relay v3 Phase 1 - Today and Shell
date: 2026-11-18
status: awaiting approval
spec: "[[Relay PRD v3]] (v3.2)"
roadmap: "[[2026-11-17 Relay v3 Roadmap]]"
---

# Relay v3 Phase 1 (Today and Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make moving between the three screens instant and keyboard-driven, and turn Today into one timeline of the day with a now line, a catch-up line, a Capture button and a "Day clear" state.

**Scope note.** The roadmap's Phase 1 is "Design reset and Today". The visual reset (`DESIGN.md`, "paper and graphite") is already done and approved on `v3/phase-1-design` (`465b217`). So this phase is the *behaviour* half: shell navigation and Today. The Calendar side panel (Schedule mode, drag from a panel onto the calendar) belongs to **Phase 3** and is not built here. (The first brief for the stopped thread wrongly included it.)

**Base:** branch `v3/phase-1-design` @ `465b217`. **New branch:** `v3/phase-1-today-opus` (the first attempt, `v3/phase-1-today`, ran on the wrong model and is abandoned).

**Models:** orchestrator and reviewers Opus 5.5 medium; workers and research Opus 5.5 low. Always.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SQLite + Drizzle, `motion`, Vitest, Playwright. **No new dependencies.**

## Global Constraints

- Work only on branch `v3/phase-1-today-opus` in a new T3 worktree. Commit per task. Never push, merge or rebase `main`.
- Never touch `data/relay.db` or the OAuth config. Tests use the isolated `testWorkspace()` from `tests/support/auth.ts`.
- No schema changes and no migrations in this phase. Today reads existing tasks and events.
- Read `node_modules/next/dist/docs/` before touching routing, prefetch or caching code (AGENTS.md rule).
- Follow `DESIGN.md`: no boxes around sections, no helper paragraphs, one primary button per screen, one hero element (the timeline), motion 150-200 ms, controls quiet.
- Every data change keeps its Undo toast.
- Out of scope: Projects board, Calendar changes, Schedule mode, token parsing in quick add, command palette changes, PWA, deploy.

## Decisions for you (answer or accept the default)

1. **Mobile navigation.** Default: replace the hamburger drawer with a **bottom tab bar** (Today, Projects, Calendar) and a center **+** Capture button, as the PRD says. Alternative: keep the drawer for now.
2. **Desktop navigation.** Default: keep the current sidebar (already approved in the redesign) and add shortcut hints and a sliding active indicator. Alternative: switch to a slim icon rail.
3. **`N` shortcut.** The Capture button shows `N`. Default: bind `N` now so the label is true, opening the existing quick capture (Task / Project / Event) in a dialog. Token parsing (`#project @fri`) stays in Phase 4.
4. **Calendar on Today.** Default: remove the embedded mini calendar from Today (it is the Calendar screen's job). The "Open calendar" link goes too.

## Review Focus

1. **No loading flash:** switching screens shows content (not the skeleton) after the first visit, and the first visit is prefetched.
2. **Shortcuts never fire while typing** in an input, textarea, select, contenteditable, or while a dialog/menu is open. `Ctrl+←/→` must still jump between words inside a text field.
3. **Holding the key** doesn't queue animations: a key press interrupts the running one.
4. **Time zone:** "today", the now line and overdue use the owner's preference zone, not the browser's.
5. **Day clear** shows only when there is at least one item today and all are done; an empty day gets the one-line empty state instead.
6. **Old bookmarks and links** still work: `/?task=…`, `/?focus=…`, `/?event=…` (search results and the capture "Open" link use them).

---

### Task 1: Branch and docs

**Files:** Create `docs/Phase 1 Progress.md`, `docs/superpowers/plans/2026-11-18-relay-v3-phase-1-today-and-shell.md` (copy of this plan). Modify `PRODUCT.md`.

- [ ] **Step 1:** Create the worktree and branch `v3/phase-1-today-opus` from `v3/phase-1-design`.
- [ ] **Step 2:** Update `PRODUCT.md`: replace the stale "Phase 1 delivers the manual foundation" purpose with the v3 one-liner ("projects hold tasks, tasks go on the calendar, one Today screen tells me what matters now") and the three-screen scope. Keep the personality and anti-references.
- [ ] **Step 3:** Copy this plan into `docs/superpowers/plans/`. Create the progress file.
- [ ] **Step 4:** Commit `docs: Phase 1 plan and product purpose`.

### Task 2: Screen order, shortcuts and view-state memory

**Files:** Create `src/lib/screens.ts`, `src/components/screen-shortcuts.tsx`, `tests/unit/screens.test.ts`. Modify `src/components/navigation.tsx`.

- [ ] **Step 1 (test first):** `screens.ts` exports the fixed order `["/", "/projects", "/calendar"]` and pure functions: `screenIndex(pathname)`, `neighbor(pathname, "left" | "right")` (clamped, no wrap), `direction(from, to)`. Unit-test all three, including nested paths (`/projects/abc` counts as Projects) and unknown paths.
- [ ] **Step 2:** `ScreenShortcuts` (client) listens on `keydown`: `Ctrl+←/→` (macOS: `⌘⌥←/→`) moves one screen; `1`, `2`, `3` jump. Ignore when focus is in `input`, `textarea`, `select`, `[contenteditable]`, when a `[role=dialog]` or open menu exists, when `event.repeat` is true for `1/2/3`, or when other modifiers are held. Uses `router.push` and `event.preventDefault()` only when it acts.
- [ ] **Step 3:** Prefetch: on mount call `router.prefetch` for all three screens.
- [ ] **Step 4:** View-state memory: store each screen's scroll offset in `sessionStorage` on leave and restore it on return (the calendar week and expanded project are restored by their own state in later phases; note it in the progress file).
- [ ] **Step 5:** Show each nav item's shortcut once as a tooltip (`1`, `2`, `3`) and keep `aria-label`s unchanged.
- [ ] **Step 6:** `npm run typecheck`, `npm run lint`, `npx vitest run`. Commit `feat(shell): screen order, keyboard shortcuts, prefetch`.

### Task 3: Slide transition and sliding active indicator

**Files:** Create `src/components/screen-transition.tsx`. Modify `src/app/(workspace)/layout.tsx`, `src/components/navigation.tsx`, `src/app/globals.css`, `next.config.ts`.

- [ ] **Step 1:** `ScreenTransition` wraps `{children}` inside `<main>`. Only the content animates: it slides in from the direction of travel (using `direction()` from Task 2) with a short fade, 150-200 ms, via `motion`. Enter-only: the old screen is replaced immediately so the switch never waits on an exit animation.
- [ ] **Step 2:** A new key press interrupts the running animation (cancel and start the new one). Reduced motion: a plain 100 ms crossfade, no slide.
- [ ] **Step 3:** The active indicator in the navigation is one element that slides between items (shared `layoutId`). Reduced motion: it jumps.
- [ ] **Step 4:** Data caching: set `experimental.staleTimes.dynamic` in `next.config.ts` (start at 30 s) so revisiting a screen paints from the router cache without a server round trip. Document in the progress file how mutations still refresh (they already call `router.refresh()`), and verify that a task captured on Today shows when you switch away and back.
- [ ] **Step 5:** Loading state: keep `loading.tsx` for the very first load only. Verify that switching between already-visited screens never shows it.
- [ ] **Step 6:** Playwright: press `Ctrl+→` twice then `Ctrl+←`, assert the URL and `aria-current` each time; assert the skeleton (`role=status`, "Loading workspace") is not visible after the first visit; assert typing in the capture input and pressing `Ctrl+←` does not navigate.
- [ ] **Step 7:** All checks. Commit `feat(shell): directional slide, sliding indicator, cached screens`.

### Task 4: Today data (pure and tested)

**Files:** Create `src/lib/today.ts`, `tests/unit/today.test.ts`. Modify `src/lib/workbench.ts` only if a helper must be shared.

- [ ] **Step 1 (test first):** `todayTimeline(db, ownerId, timezone, now)` returns:
  - `items`: today's events (timed and all-day) and task-linked blocks, sorted by time; all-day first. Each item has `kind` (`event` | `task-block`), title, start, end, `done`, `taskId?`, `projectName?`.
  - `dueUnscheduled`: tasks due today (and not Done) with no event today.
  - `overdue`: tasks past due and not Done (same rule as `homeData`).
  - `summary`: counts of remaining items and the next item with minutes until it.
  - `dayState`: `"empty"` (nothing today), `"active"` or `"clear"` (all done).
- [ ] **Step 2:** Test cases: a task with two sessions today; an event crossing midnight; an all-day event; the owner's time zone differing from UTC around midnight; Done tasks still shown but counted as done; soft-deleted rows excluded; overdue excludes today's due tasks.
- [ ] **Step 3:** Pure summary sentence builder: "4 things today · next: Design review in 40 min", "Nothing left today", "Nothing planned today", with singular and plural handled. Unit-tested.
- [ ] **Step 4:** `npx vitest run`. Commit `feat(today): timeline data and summary`.

### Task 5: Today screen

**Files:** Create `src/components/today-timeline.tsx`, `src/components/now-line.tsx`, `src/components/catch-up.tsx`. Rewrite `src/app/(workspace)/page.tsx`. Modify `src/app/globals.css`. Delete `.home-*` styles that become unused.

- [ ] **Step 1:** Header: the date, the summary sentence, and the Capture button (placeholder wired in Task 6). No "Open calendar" link, no mini calendar, no embedded capture form.
- [ ] **Step 2:** Timeline: items in time order with a time column, a small type icon (event vs task block) and the task check for task blocks (reuse `TaskComplete`; completing keeps Undo). Clicking a title opens the existing side panel (`?task=` / `?event=`, unchanged).
- [ ] **Step 3:** "Due today, unscheduled" group at the top, each row with a one-tap *Schedule* action that links to `/calendar` (Schedule mode itself is Phase 3; until then this opens the Calendar on today's date).
- [ ] **Step 4:** Now line: a client component that draws a line at the current time in the owner's time zone and updates every 30 s; hidden when the timeline has no items or when the time is outside the shown range. Scroll the timeline so the now line is visible on load.
- [ ] **Step 5:** Catch-up line (only when `overdue.length > 0`): one line above the timeline ("2 overdue · Review"). Clicking expands the overdue tasks in place, each with *Today*, *Tomorrow* and *Pick date* actions (PATCH task due date with the revision check and an Undo toast). Collapsed by default. Never takes over the page.
- [ ] **Step 6:** States: empty day = one line plus the Capture button as the obvious next step; Day clear = a calm "Day clear" state replaces the timeline with a short completion moment (check draws, 200 ms; no confetti; none with reduced motion).
- [ ] **Step 7:** Remove dead code (`ManualCalendar` props only Today used, `captureKindEvent` listener) without touching the Calendar screen's behaviour.
- [ ] **Step 8:** Screenshots at 1440×900, 1366×768 and 390×844, light and dark, into `docs/phase1-screens/`. All checks. Commit `feat(today): single timeline with now line, catch-up and Day clear`.

### Task 6: Capture button and `N`

**Files:** Create `src/components/capture-dialog.tsx`. Modify `src/components/navigation.tsx`, the Today header, `src/components/quick-capture.tsx`.

- [ ] **Step 1:** `CaptureDialog` (Radix dialog) holds the existing `QuickCapture`. The Capture button on Today (`+ Capture  N`) and the `N` key open it; `Esc` closes; focus returns to the trigger. `N` is ignored while typing or when another dialog is open.
- [ ] **Step 2:** Saving shows the existing confirmation with the "Open" link and Undo toast, then the dialog closes and Today refreshes (a new item appears without a manual reload).
- [ ] **Step 3:** If Decision 1 is the default: the mobile tab bar's center **+** opens the same dialog.
- [ ] **Step 4:** Remove the always-visible capture card from Today (already done in Task 5) and keep the palette capture working.
- [ ] **Step 5:** Playwright: open with `N`, capture a task, see it on Today, Undo from the toast.
- [ ] **Step 6:** All checks. Commit `feat(capture): Capture button and N shortcut`.

### Task 7: Mobile bottom tab bar (if Decision 1 is the default)

**Files:** Modify `src/components/navigation.tsx`, `src/app/globals.css`. 

- [ ] **Step 1:** At ≤ 768 px replace the header-and-drawer with a fixed bottom tab bar: Today, Projects, Calendar and a center **+**. 44 px touch targets, safe-area padding, active item in the accent.
- [ ] **Step 2:** Search and the account menu move to a slim top header. Swipe between screens is **not** added (it conflicts with row swipes).
- [ ] **Step 3:** The slide transition and shortcuts still work. Verify at 390×844 in Playwright: three tabs navigate, `+` opens Capture.
- [ ] **Step 4:** All checks. Commit `feat(shell): mobile bottom tab bar`.

### Task 8: Tests, Impeccable critique and final review

- [ ] **Step 1:** Update or replace the tests that relied on the old Today (embedded calendar and capture card): audit `tests/e2e/workbench.spec.ts`, `tests/e2e/phase13.spec.ts`, `tests/integration/workbench.test.ts`, `phase12.test.ts`, `phase13.test.ts`. Change only what the removed UI forced. Keep Calendar screen tests as they are (including the known FullCalendar drag failure, left for Phase 3).
- [ ] **Step 2:** Add one Playwright flow for Today: now line present, due-unscheduled group, catch-up expand and *Tomorrow* with Undo, Day clear after completing everything, empty day line.
- [ ] **Step 3:** Run the Impeccable critique on Today and the shell at both viewports. Fix every clutter finding; list anything not fixed in the progress file.
- [ ] **Step 4:** Full run: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build`, `npm run test:e2e`. Record results.
- [ ] **Step 5:** Whole-branch review against the Review Focus list. Fix findings, then write the final report: what happened, what finished, decisions still open.

## Done when (from the roadmap)

- Today passes the 5-second test at 1440×900 and 390×844.
- The Impeccable critique has no clutter findings.
- Switching screens has no loading flash.
- All checks green except the known FullCalendar drag test.
- Upgrade rehearsal is not needed (no schema changes).

## After this phase

The Reviewer bot checks the branch against this plan, then you check it by hand. **Merging needs your OK.** Phase 2 (Projects split view) gets its own plan after you approve this phase's result.
