# Relay v3 Phase 2: Projects split view

Source of truth: `Relay PRD v3.md` §3.2 (Projects), §4 (gestures, motion), MVP acceptance #1 and #4. Roadmap: Phase 2. Workflow: lean v2, one T3 thread, no subagents, no Superpowers.

**Goal:** Projects becomes one screen with two panes. The task board is the hero. The Inbox route is deleted.

**Branch:** `v3/phase-2-projects`, from `main` (3160797, includes Phase 0 and 1). Push nothing.

## Scope

1. **Left pane, project list.**
   - "No project" pinned first. It holds loose tasks.
   - Status groups: Active, Planned, Paused, and a collapsed Done.
   - Drag a project between groups to change status, within a group to reorder (order persists).
   - Row = name, thin progress bar (done / total), next deadline. Nothing else.
   - `↑/↓` moves selection. `Ctrl+N` or `+` at the list top creates a project inline.
2. **Right pane, task board for the selected project.**
   - Header: title, description, deadline, each editable inline.
   - Columns To do / Doing / Done on wide screens. Drag a task between columns (status) and within one (order, persists).
   - Typing at the bottom of a column adds a task with that status.
   - Strip of this project's upcoming events.
   - Move a task to another project: drag it onto a project in the left pane, or context menu.
3. **Side sheet** (desktop) / bottom sheet (mobile) for task and project details. No modal forms or separate pages. Shared-element transition card to sheet.
4. **`⋯` button and right-click menu** on every task and project row (touch-visible `⋯`, hover/focus on desktop). Menu holds: move to project, change status, complete, delete, plus the keyboard alternatives.
5. **Completion animation:** check draws, row strikes through and collapses into Done, Done count ticks up. Use the `motion` library, 150-250 ms, spring, respect reduced motion.
6. **Narrow screens:** two levels (list, then board). Tap project opens its board, swipe back returns. Columns stack. Status change by long-press drag or the `⋯` menu.
7. **Delete the Inbox route** and every link to it. Loose tasks live under "No project".
8. **Drag works three ways:** mouse, touch, keyboard (pick up with Enter or Space, arrows move, Enter drops, Esc cancels). Use dnd-kit or the library already in the repo.
9. **Every change shows an Undo toast** (existing plumbing).

## Out of scope
Calendar and Schedule mode (Phase 3), quick-add tokens, palette changes, swipe-to-complete on Today, PWA and deploy (Phase 4). New ideas go to a separate thread.

## Tests (lean)
- `npm run typecheck`, `npm run lint`, and unit/integration tests for the new logic (status change, reorder persistence, move task to project, No-project grouping, progress and next-deadline calculation).
- **One** Playwright spec, desktop only: `projects.spec`. It covers MVP acceptance #1 (create project, add 5 tasks, drag between columns, drag project Planned to Active, refresh, all persists), acceptance #4 (loose task with no project, standalone event), keyboard drag, and Undo.
- Do not run the full e2e suite and do not run mobile e2e (`RELAY_E2E_FULL` stays off). I run the full suite once at the end of the phase.

## Done when
- Acceptance #1 and #4 pass as above. Drag works by mouse, touch (manual check via viewport emulation is enough) and keyboard.
- Inbox route is gone, no dead links.
- Impeccable-style check by the builder against `DESIGN.md`: no card-in-card, one accent colour, controls on hover/focus, no clutter at 1440x900 and 390x844. Screenshots saved in `docs/phase2-screens`.
- Ends with `docs/Phase 2 Progress.md`: what was built, what to click to test it, open decisions. Short.

## Model
Opus 5.5 low (drag and drop plus persistence plus animation is tricky, so Sonnet is the wrong tool).
