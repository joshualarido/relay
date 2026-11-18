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
- [ ] 6. Capture button and `N`
- [ ] 7. Mobile bottom tab bar
- [ ] 8. Tests, Impeccable critique and final review

## Decisions / rulings

- Overdue: `dueDate < today`, or a timed `dueAt` whose owner-zone date `< today`. A timed deadline earlier today stays "due today".
- Event "done": task blocks are done when their task is Done; plain timed events when `end <= now`; plain all-day events are informational.
- Capture dialog closes on save; the confirmation (plus an Open link for loose tasks) moves into the Undo toast.
- Screen shortcuts: `neighbor` returns null at the ends (no wrap) and from unknown paths; `1/2/3` still jump from anywhere. Guard `isShortcutBlocked` lives in `src/lib/screens.ts` for reuse by `N` (Task 6).
- Scroll memory keys window scroll per screen in `sessionStorage`; the calendar week and expanded project state are restored by their own state in later phases.
- Task 3: `ScreenTransition` (enter-only, keyed by pathname so a new key press remounts and cancels; first load is not animated; unknown direction = 150 ms fade; reduced motion = 100 ms fade). Motion leaves `transform: none` at rest (asserted in e2e) so fixed side panels are not trapped. `.workspace-main` gets `overflow-x: clip` because the 24 px slide-in briefly widened the page (caught by the existing scrollWidth assertion).
- Sliding indicator: one `motion.span` per nav scope (`nav-indicator-desktop` / `-mobile`) carries the active fill; `.nav-link.active` keeps only the colour and accent icon. `MotionConfig reducedMotion="user"` makes it jump under reduced motion.
- Caching: `experimental.staleTimes.dynamic = 30` (still the documented name in Next 16.4; works alongside `force-dynamic`). Screens prefetched via `router.prefetch` use the `static` period (5 min default). Mutations still call `router.refresh()`, which drops the client router cache, so other screens refetch. Verified in e2e: a project created from Today's quick capture shows on the already-visited Projects screen, and revisits show no `Loading workspace` skeleton (dev server).
- Scroll memory is now keyed by pathname (`/projects` and `/projects/abc` have separate slots).
- Screenshots come only from isolated test databases.
- Task 4: `todayTimeline` keeps a crossing-midnight event's real start/end (UI clamps). Minutes to next = ceil. Done tasks due today with no event today count toward total (so finishing the only due task gives "clear"). A day with only all-day events is "active" with 0 counted. TDD: RED (module missing) -> GREEN 11/11.
- Task 5: Today is one window-scrolling list (no grid): catch-up line, "Due today" group (Schedule links to `/calendar`), timeline with time column ("All day", "until 01:00", "from 23:00" for midnight-crossing), type icon + sr-only text, TaskComplete on task blocks. Now line is a client row (useSyncExternalStore, 30 s tick, hidden outside [earliest timed start, latest timed end]); scrolls itself into view only when no scroll position is stored. Header sentence is server-rendered (fresh on refresh). No Capture button yet (Task 6). Removed `home` from ManualCalendar, `captureKindEvent`, `date`/`captureDate` on `/`, and all `.home-*`/`.today-*`/`.quick-capture-card`/`.calendar-day-capture`/`.progress-count` CSS. Screenshots via `RELAY_SCREENSHOTS=1 npx playwright test screens` (light, 1440x900 + 390x844).

## Commits

- Task 1: docs: Phase 1 plan and product purpose
- Task 2: feat(shell): screen order, keyboard shortcuts, prefetch
- Task 3: feat(shell): directional slide, sliding indicator, cached screens
- Task 4: feat(today): timeline data and summary
- Task 5: feat(today): single timeline with now line, catch-up and Day clear

## Next action

Task 6: Capture button (header right slot on Today + empty state) and `N`. Task 8 must repair e2e that relied on the old Today (see task-5-report.md).
