# Relay v3 Phase 1 (Today and Shell): Progress

Branch `v3/phase-1-today-opus`, base `v3/phase-1-design` @ `465b217`. Plan: `docs/superpowers/plans/2026-11-18-relay-v3-phase-1-today-and-shell.md`.

## Approved decisions (all four defaults accepted)

1. Mobile: bottom tab bar with a centre + (Capture).
2. Desktop: keep the sidebar, add a sliding active indicator.
3. Bind `N` to Capture now.
4. Remove the mini calendar and the Open calendar link.

## Tasks

- [x] 1. Branch and docs
- [x] 2. Screen order, shortcuts and view-state memory
- [x] 3. Slide transition and sliding active indicator
- [x] 4. Today data (pure and tested)
- [x] 5. Today screen
- [x] 6. Capture button and `N`
- [x] 7. Mobile bottom tab bar (commit: see `feat(shell): mobile bottom tab bar`)
- [x] 8. Tests, Impeccable critique and final review

## Decisions / rulings

- Overdue: `dueDate < today`, or a timed `dueAt` whose owner-zone date `< today`. A timed deadline earlier today stays "due today".
- Event "done": task blocks are done when their task is Done; plain timed events when `end <= now`; plain all-day events are informational.
- Capture dialog closes on save; the confirmation (plus an Open link for loose tasks) moves into the Undo toast.
- Capture type: click Task / Project / Event, or use the arrow keys, Home and End; reopening resets to Task.
- Name-only capture: save one of each type with just a name. An Event is all-day today (Calendar has no date-click, so no other date).
- Ctrl+Left on Today goes to Calendar and Ctrl+Right on Calendar goes to Today, sliding in the direction of the key.
- Screen shortcuts: `neighbor` returns null at the ends (no wrap) and from unknown paths; `1/2/3` still jump from anywhere. Guard `isShortcutBlocked` lives in `src/lib/screens.ts` for reuse by `N` (Task 6).
- Scroll memory keys window scroll per screen in `sessionStorage`; the calendar week and expanded project state are restored by their own state in later phases.
- Task 3: `ScreenTransition` (enter-only, keyed by pathname so a new key press remounts and cancels; first load is not animated; unknown direction = 150 ms fade; reduced motion = 100 ms fade). Motion leaves `transform: none` at rest (asserted in e2e) so fixed side panels are not trapped. `.workspace-main` gets `overflow-x: clip` because the 24 px slide-in briefly widened the page (caught by the existing scrollWidth assertion).
- Sliding indicator: one `motion.span` per nav scope (`nav-indicator-desktop` / `-mobile`) carries the active fill; `.nav-link.active` keeps only the colour and accent icon. `MotionConfig reducedMotion="user"` makes it jump under reduced motion.
- Caching: `experimental.staleTimes.dynamic = 30` (still the documented name in Next 16.4; works alongside `force-dynamic`). Screens prefetched via `router.prefetch` use the `static` period (5 min default). Mutations still call `router.refresh()`, which drops the client router cache, so other screens refetch. Verified in e2e: a project created from Today's quick capture shows on the already-visited Projects screen, and revisits show no `Loading workspace` skeleton (dev server).
- Scroll memory is now keyed by pathname (`/projects` and `/projects/abc` have separate slots).
- Screenshots come only from isolated test databases.
- Task 4: `todayTimeline` keeps a crossing-midnight event's real start/end (UI clamps). Minutes to next = ceil. Done tasks due today with no event today count toward total (so finishing the only due task gives "clear"). A day with only all-day events is "active" with 0 counted. TDD: RED (module missing) -> GREEN 11/11.
- Task 5: Today is one window-scrolling list (no grid): catch-up line, "Due today" group (Schedule links to `/calendar`), timeline with time column ("All day", "until 01:00", "from 23:00" for midnight-crossing), type icon + sr-only text, TaskComplete on task blocks. Now line is a client row (useSyncExternalStore, 30 s tick, hidden outside [earliest timed start, latest timed end]); scrolls itself into view only when no scroll position is stored. Header sentence is server-rendered (fresh on refresh). No Capture button yet (Task 6). Removed `home` from ManualCalendar, `captureKindEvent`, `date`/`captureDate` on `/`, and all `.home-*`/`.today-*`/`.quick-capture-card`/`.calendar-day-capture`/`.progress-count` CSS. Screenshots via `RELAY_SCREENSHOTS=1 npx playwright test screens` (light, 1440x900 + 390x844).
- Task 6: one `CaptureProvider` (src/components/capture-dialog.tsx) inside Navigation hosts the Radix Capture dialog, the `N` listener (no modifiers/repeat, `isShortcutBlocked`) and `useCapture().open(trigger?)` for Task 7. Layout loads projects/tasks/timezone for it. `CaptureButton` in the Today header (primary) and the empty state (outline). `notifyMutation(response, refresh, { message, openHref })`; QuickCapture gains `onDone` and `inlineConfirmation` (palette unchanged). Closing the inline event form also closes the dialog. Focus returns to the trigger or prior focus. e2e: tests/e2e/capture.spec.ts (task check via toast Open link + API, since a dateless task is not on Today); shell.spec cache test now captures via the dialog.
- Task 7: hamburger drawer removed. At <= 760px (existing breakpoint kept; switching to 768 would ripple through all mobile rules) a slim header holds wordmark, search and compact `AccountMenu` (Settings is in it); a fixed bottom `nav aria-label="Workspace"` has Today, Projects, accent + (Capture), Calendar in 4 equal columns, accent active state, aria-current, 44px targets, safe-area padding, hairline, no shadow. `.workspace-main` gets bottom padding; sonner `mobileOffset` clears the bar; Today header CaptureButton hidden on mobile (+ is the primary). e2e: new tab-bar test in shell.spec; drawer steps removed from shell/phase13 specs. Screens: docs/phase1-screens/today-mobile.png, projects-mobile.png.

## Commits

- Task 1: docs: Phase 1 plan and product purpose
- Task 2: feat(shell): screen order, keyboard shortcuts, prefetch
- Task 3: feat(shell): directional slide, sliding indicator, cached screens
- Task 4: feat(today): timeline data and summary
- Task 5: feat(today): single timeline with now line, catch-up and Day clear
- Task 6: feat(capture): Capture button and N shortcut
- Task 8a: test(v3): Today flow and tests updated for the new Today
- Task 8b: 9f39c43 fix(today): Impeccable critique fixes and final screenshots
- Task 8c: f8f2ba4 fix(v3): final review — re-prefetch after refresh, tab cue, a11y
- Task 8d: docs(v3): Phase 1 hand-off

## Checks

Task 8a full run (2026-11-18, after test repair):

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npx vitest run`: 15 files, 99 tests passed
- `npm run build`: pass; the configured real database files (db, -wal, -shm) had identical size and mtime before and after the build
- `RELAY_TEST_SERVER=production npm run test:e2e` (desktop + mobile): 89 passed, 12 skipped, 1 failed (`capture.spec.ts` N shortcut: settings field not yet visible when focused in production; test now waits for visibility, rerun alone passed). The known FullCalendar drag test passed in this production run.
- Dev-server pre-run (`npm run test:e2e`, before repair): 44 failed, all from removed Home UI, plus `foundation.spec.ts` (needs `next start` build) and a dev-server ECONNRESET in `tasks.spec.ts`; both passed in the production run.

## Impeccable critique

Degraded run: single context (task forbids subagents); detector/live overlay not run; evidence = Playwright screenshots on the isolated test server (docs/phase1-screens/). Operate mode, Today + shell, 1440/1366/390, light and dark.

Scores (Nielsen, 0-4): status 4, real world 4, control 3, consistency 3, error prevention 3, recognition 4, efficiency 3, minimalist 3 -> 4 after fixes, recovery 3, help n/a. Total 30/36 before, 31/36 after.

5-second test. 1440x900: date, "5 things today, next: Draft the tomato post in 36 min", the now line between Dentist and the next block, 1 overdue - pass. 390x844: same summary under the title and the whole timeline above the fold - pass.

Fixed (one commit):
- Capture button key hint "N" invisible on the accent fill (empty box): `.bg-primary kbd` takes the button ink.
- Empty day said "Nothing planned today" twice and showed two Capture buttons (primary + outline): summary hidden on empty and clear days; only the in-line Capture shows (primary); on mobile the tab-bar + is the one Capture.
- Day clear said "Nothing left today" above "Day clear": summary hidden on clear days.
- Capture dialog title glued to the field row (unlayered `h2 { margin: 0 }` beats the `mb-6` utility): 16px gap.
- Mobile catch-up move buttons indented past the task title: aligned to the title edge.
- Header Capture button sat low against the title block: vertically centred.

Not fixed (by design, not clutter): complete circle sits left in Due today but right in the timeline (row layouts from Task 4; a move is a layout change, not a clutter fix); `.form-dialog h2` margin bug in other dialogs is outside Today/shell scope; Undo toast is visible in the Day-clear shot (required notification).

## Final review (orchestrator review of worker output, not certification)

- Important: after `router.refresh()` or the prefetch stale time, the prefetched screens were invalidated, so a screen switch showed the "Loading workspace" skeleton. Fixed: `ScreenShortcuts` re-prefetches each screen from the documented `onInvalidate` callback (prefetching guide, "Extending or ejecting Link"), with `kind: "full"` (in the public `AppRouterInstance.prefetch` type; no internal import) and a 1 s floor per screen so an immediate invalidation cannot loop hot. `shell.spec.ts` asserts no skeleton when switching after a mutation.
- Important: mobile active tab was colour-only. Fixed: weight 600 plus a `--secondary` pill behind the icon; targets stay 44 px (checked in today-390-light.png).
- Minor: now line's `aria-label` on an `li` replaced by sr-only "Now, " text. Fixed.
- Minor: catch-up move error fell back to an empty message on field errors. Fixed (field messages, then a default).
- Minor: no test that a timeline event opens its panel. Fixed: `today.spec.ts` clicks an event, checks `?event=` and the Event details dialog.
- Minor: an active day with only all-day items said "Nothing planned today". Fixed: "Nothing timed today" (unit test updated).

## Final checks (2026-11-18)

- `npm run typecheck`: pass; `npm run lint`: pass; `npx vitest run`: 15 files, 99 tests passed
- `npm run build`: pass (the phase's one production build, reused for the full suite; no code changed in between)
- `RELAY_TEST_SERVER=production npx playwright test tests/e2e/shell.spec.ts tests/e2e/today.spec.ts --project=desktop`: 12 passed, 1 skipped
- `RELAY_TEST_SERVER=production npm run test:e2e` (desktop + mobile; `RELAY_E2E_FULL` is not read anywhere): 90 passed, 12 skipped, 0 failed (3.5 min)
- Real database `relay/data/relay.db`: size 155648 and mtime 2026-11-18 07:38:31 unchanged before and after all runs
- Screenshots refreshed via `RELAY_SCREENSHOTS=1 npx playwright test tests/e2e/screens.spec.ts` (docs/phase1-screens/, 390 and desktop shots)

## Open decisions

- (a) The mobile + sits in the 3rd of 4 tab columns, not truly centred. Accept, or switch to a 5-slot grid / floating +?
- (b) Complete circle left in Due today vs right in the timeline, and the title margin in other dialogs: deferred to Phase 2.

## Revision round (review revisions)

Requested changes (the Deadline-removal item was dropped): (1) Capture gets inline Task / Project / Event type buttons, a radio group with arrow keys, Home/End and a reset to Task on reopen; (2) name-only capture for every type; (3) Event saves at once as an all-day event today in the owner's timezone; (4) Ctrl+Left on Today goes to Calendar and Ctrl+Right on Calendar goes to Today, sliding the way the key points.

Commits: 993ce80 (screen switching loops), 97cba28 (inline type toggle, name-only capture), 506715f (review fixes).

Review findings and fixes:
- Event missing from palette capture: fixed. The palette now receives the timezone, `timezone` is required, and the heading reads "Capture". Asserted in e2e.
- Slide hint mutated during render: fixed. The hint is `{ to, side }`, read purely, matched only by destination, overwritten by the next key and cleared in an effect after navigation commits (so a later click cannot reuse it).
- Dead `projects`/`tasks` in CaptureData: fixed; the layout no longer loads tasks for it.
- Dead `initialDate`: removed. The Calendar has no date-click handler, and none was invented.
- Retry identity now includes the event `start`. e2e asserts start is today in the owner's zone and end the next day. Radiogroup handles Home/End.

Checks: typecheck and lint clean; `npx vitest run` 15 files, 101 tests passed; edited specs on desktop (capture, shell) 13 passed, 1 skipped (mobile-only). `npm run build` passed. Full e2e in production mode (`RELAY_E2E_FULL=1 RELAY_TEST_SERVER=production npm run test:e2e`, desktop + mobile): 91 passed, 13 skipped, 0 failed. The real database (relay.db and -shm/-wal) was unchanged in size and modified time before and after. Screenshots refreshed: capture-task, capture-project, capture-event.

## How to test it

- Start your own dev server as usual (`npm run dev`, http://127.0.0.1:3000) and sign in.
- Today on desktop: summary line, single timeline with the now line, Due today, clicking an event opens its panel.
- Catch-up: open "N overdue · Review", move a task to today/tomorrow, then Undo from the toast.
- Capture: press N, and use the Capture button (or the mobile +); the title saves literally.
- Screen shortcuts: 1/2/3, and Ctrl+Left/Right (Cmd+Alt+arrows on Mac); switching after a change shows no skeleton.
- Phone width (~390 px): bottom tab bar, the active tab has a bold label and a pill behind its icon; + opens Capture.
- Dark mode: repeat a quick look at Today and the tab bar.

## Next action

User manual verification. No local database reset was authorised or done. Merging needs the user's OK.
