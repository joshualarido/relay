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
- [ ] 3. Slide transition and sliding active indicator
- [ ] 4. Today data (pure and tested)
- [ ] 5. Today screen
- [ ] 6. Capture button and `N`
- [ ] 7. Mobile bottom tab bar
- [ ] 8. Tests, Impeccable critique and final review

## Decisions / rulings

- Overdue: `dueDate < today`, or a timed `dueAt` whose owner-zone date `< today`. A timed deadline earlier today stays "due today".
- Event "done": task blocks are done when their task is Done; plain timed events when `end <= now`; plain all-day events are informational.
- Capture dialog closes on save; the confirmation (plus an Open link for loose tasks) moves into the Undo toast.
- Screen shortcuts: `neighbor` returns null at the ends (no wrap) and from unknown paths; `1/2/3` still jump from anywhere. Guard `isShortcutBlocked` lives in `src/lib/screens.ts` for reuse by `N` (Task 6).
- Scroll memory keys window scroll per screen in `sessionStorage`; the calendar week and expanded project state are restored by their own state in later phases.
- Screenshots come only from isolated test databases.

## Commits

- Task 1: docs: Phase 1 plan and product purpose
- Task 2: feat(shell): screen order, keyboard shortcuts, prefetch

## Next action

Task 3: slide transition and sliding active indicator.
