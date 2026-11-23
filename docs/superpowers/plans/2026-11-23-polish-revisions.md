# Polish revisions (2026-11-23)

Ten UI revisions on `main` (user-authorized). No schema, API or business-rule changes.

## Libraries
- **motion** (already installed): strike-through, check pop, flame layers, day-clear entrance.
- **canvas-confetti** (new, ~4 KB, zero deps): small burst on task completion and on the day turning clear.
  Respects `disableForReducedMotion`.
- Everything else uses existing deps (lucide icons, FullCalendar options, CSS gradients).

## Tasks
1. **Completion feel** — `task-complete.tsx`: on click, immediately mark the row `is-completing`
   (green check pop + animated line-through across the title via CSS `text-decoration` / a scaleX line),
   fire a small confetti burst from the button, then PATCH and refresh. Revert on error.
2. **Momentum fire** — new `momentum-flame.tsx`: stacked SVG flame layers animated with motion; height,
   speed, flicker amplitude and colour heat scale with score (0 = embers only, 100 = tall violent blaze).
   Sits behind/above `.momentum-number`. Static under reduced motion. Text equivalent stays the score/status.
3. **Day clear** — `day-clear.tsx`: centred block (flex both axes, min-height), large gradient check badge,
   heading "Day clear" + encouraging line showing tasks/hours finished; confetti once when it appears in-session.
4. **Capacity card done bar** — `today-glance.tsx`: layered bar (blue = planned, green = completed on top),
   text "Xh of Yh done"; card gets green accent (`is-complete`) when completed ≥ planned > 0.
   Uses existing `capacity.completedMinutes`.
5. **Gradients** — `--primary-gradient` / `--success-gradient` tokens; applied to primary buttons,
   progress fills, momentum track, chart bars, day-clear badge.
6. **Calendar default view** — default `Week` instead of `Agenda` when no `?view=`.
7. **Event ordering** — FullCalendar `eventOrder="order,start,title"` so events sort by time within a day.
   (Today timeline already sorts by start.)
8. **Remove calendar "Today" button.**
9. **New event icon** — `CalendarPlus` icon in the New event trigger, like Capture.
10. **Ctrl/⌘+B** toggles the sidebar (`navigation.tsx`), skipped while typing/dialogs (`isShortcutBlocked`).

## Verify
typecheck, lint, unit tests; dev-server screenshots of Today and Calendar on an isolated DB.
