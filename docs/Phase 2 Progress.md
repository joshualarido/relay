# Relay v3 Phase 2 (Projects split view): Progress

Branch `v3/phase-2-projects` from `main` @ `3160797`. Plan: `docs/superpowers/plans/2026-11-19-relay-v3-phase-2-projects.md`. Single builder (Opus 5.5), no subagents.

## What was built

- **One Projects screen, two panes** (`src/components/projects/`). Left: "No project" pinned first, then Active, Planned, Paused and a collapsed Done (plus a collapsed Archived group, only when archived projects exist). Each row shows the name, a thin progress bar (done / total, with a text equivalent) and the next deadline. Right: the selected project's board.
- **Board header:** the title, description and deadline are all edited inline. The header also shows "x of y done", a strip of upcoming events, and To do / Doing / Done columns with "+ Add task" at the bottom of each column.
- **Drag (dnd-kit, one context across both panes):** tasks move between columns and within a column; dropping a task onto a project row (or No project) moves it there. Projects move between groups and within a group. Dragging a project to Done shows the existing completion confirmation. Drag works by mouse, by touch (long press, 250 ms) and by keyboard: focus the grip, Enter/Space picks up, the arrow keys move, Enter drops, Esc cancels.
- **`⋯` and right-click menus** on every task and project row: Open/Details, Complete/Reopen, Change status, Move to project, Move up/down (the keyboard alternative), Archive, Delete. Controls show on hover or focus; on touch the `⋯` stays visible.
- **Details sheet:** a side sheet on desktop and a bottom sheet on phones, with inline-saving fields (title, status, project, due date, important, notes; for projects: name, status, deadline, description, archive, delete). It grows out of the card that opened it (FLIP), and Esc returns focus to the card.
- **Completion:** the check draws, the title strikes through, the card moves into Done (motion layout spring, about 250 ms) and the column counts tick. Reduced motion turns all of this off.
- **Narrow screens:** two levels. Tap a project to open its board; the back button, a right swipe or the system back returns to the list. Columns stack vertically.
- **Undo toast on every change** (existing `notifyMutation`). Saves are optimistic, run one at a time, and roll back with an inline error on failure.
- **Inbox removed.** `/inbox` is now a 404. Task links go to `/projects?project=<id|none>&task=<id>`, and `/projects/<id>` redirects there. "Inbox" labels now say "No project".
- **Logic and tests:** `src/lib/project-board.ts` holds the move plans, progress, next deadline, grouping and upcoming events. It is covered by `tests/unit/project-board.test.ts` and by `tests/integration/project-board.test.ts`, which runs the plans against the real reorder services, including Undo and the stale-plan rejection.

Commits: `e60d22a` (logic and tests), `54b9ccc` (split view), `14b0797` (polish, screenshots, spec updates), plus this doc.

## Checks run

- `npm run typecheck`: pass. `npm run lint`: pass.
- `npx vitest run`: 17 files, 116 tests passed.
- `npx playwright test tests/e2e/projects.spec.ts --project=desktop` (dev server, isolated test DB): 3 passed, 1 skipped (the screenshot test runs only with `RELAY_SCREENSHOTS=1`). It covers acceptance 1 (create a project, add 5 tasks, mouse drags, keyboard drag and Esc cancel, drag the project Planned → Active, Undo, refresh and check that everything persists), acceptance 4 (a loose task under No project, a standalone event with no links, the details sheet and focus return) and that `/inbox` returns 404.
- Not run (as instructed): the full e2e suite, mobile e2e, and the production build.

## Test it by hand (http://localhost:3001/projects)

1. Click **+** next to "Projects" (or press Ctrl+N; see open decision 3). Type a name and press Enter. It lands in Planned and opens its board.
2. Type five tasks into **+ Add task** under To do.
3. Drag a card to Doing, then to Done. Click a card's circle and watch it check and slide into Done.
4. Drag the project row from Planned onto the **Active** heading.
5. Drag a card onto **No project** in the left list. Undo it from the toast.
6. Hover a card, open **⋯** and try Move to project, Change status and Move up. Right-click a card for the same menu.
7. Keyboard: Tab to a card's grip (⠿), press Enter, use the arrows, press Enter to drop or Esc to cancel. ↑/↓ on a project row moves the selection.
8. Click a card title to open the side sheet, change the due date and notes, then press Esc.
9. Click the title, description or deadline in the board header to edit them.
10. Refresh: everything stays. Narrow the window below 760px (or use device emulation) to see list → board, the back button and swipe back.

Screenshots (isolated test DB): `docs/phase2-screens/` — projects-1440-light.png, projects-1440-dark.png, projects-1366.png, projects-menu.png, projects-sheet.png, projects-390-list.png, projects-390-board.png.

## Design check (builder self-check against DESIGN.md, not certification)

- No card-in-card: cards sit on unboxed columns, and the sheet and menus are the only floating layers with a shadow.
- One accent: it marks the selected row, the checks and the event chip. Deadline colours appear only as small icons paired with text.
- Controls show only on hover or focus at 1440 and 1366. At 390 the `⋯` is visible and the grip is hidden.
- No helper paragraphs, and empty columns show only "+ Add task".

## Open decisions

1. **Deleting a project** still uses the existing cascade: its tasks are soft-deleted with it, and the dialog lists them. PRD §5 asks whether to delete the tasks or keep them as loose tasks. That needs a backend change, so it is left for a decision.
2. **Today and Calendar** still open tasks in the old modal panel. Only Projects uses the new sheet. Should the sheet replace the panel on those screens too?
3. **Ctrl+N** is wired up, but Chrome reserves Ctrl+N in a normal tab (it opens a new window). It works in an installed app (PWA) window. The **+** button always works.
4. **Archived projects** appear as a collapsed "Archived" group at the bottom of the list (the old archive view was a separate page). Keep it?
5. **New projects** start in Planned (the existing default, and it matches acceptance 1).
6. **Timed deadlines** (`dueAt`) are shown in the sheet but can't be edited there, since there is no date-time picker yet.
7. **Drop animation:** the overlay's drop animation is off. With it on, a card that moved to another column blocked the next drag. Cards still animate on completion and on menu moves.

## Stale e2e specs (not run, need a rewrite before the full suite)

URL assertions were updated in `shell.spec`, `recovery.spec`, `calendar.spec` and `foundation.spec`. These flows still drive the removed UI (the Inbox page, the old Add/Edit dialogs, the per-card status select and the reorder arrows), so they will fail until they are rewritten: `tasks.spec.ts` (most of it), `recovery.spec.ts` (project edit dialog), `workbench.spec.ts` (old project page), `foundation.spec.ts` line 21 (`/inbox`, "Add task" button), and `phase13.spec.ts` / `screens.spec.ts` if they open Projects.

## Ideas (not built)

- E / X shortcuts on a focused card (planned for Phase 4).
- Drag down to dismiss the bottom sheet on phones.
- Ask "delete or keep tasks" when deleting a project (see open decision 1).

## Local test server

`http://localhost:3001` runs `next dev` with your `.env` OAuth settings, `BETTER_AUTH_URL=http://localhost:3001`, and `DATABASE_URL` set to a private copy of your database (`data/relay-phase2-test.db`, made with SQLite backup, integrity ok). Changes there never reach `data/relay.db`.
