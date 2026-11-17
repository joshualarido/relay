# Phase 1.3 Progress

## Execution Contract

- Phase: 1.3 daily Home workbench.
- Authorization: user explicitly requested execution in this thread.
- Execution: started as single-agent; finished as orchestrated subagent work
  (Opus workers, separate Opus reviewers, orchestrator review of each package).
  Git initialized 2026-11-17 with user authorization; commits 6fcfb83..2d6d95b.
  Testing kept proportionate at the user's request (personal project).
- Ordinary database reset: not authorized; preserve `data/relay.db` and user
  verification data.
- Scope: unified Home capture, Today execution, monthly Home calendar, separate
  task planned date/deadline, and viewport-fit Home with no page-level scrolling.
- Out of scope: AI, deployment, OAuth changes, navigation redesign, unrelated
  pages, and new dependencies.

## Current Checkpoint

- Implementation and automated acceptance complete at commit 2d6d95b.
- Local `data/relay.db` already has all 7 migrations including `planned_date`
  (read-only check); no reset performed.
- Exact next action: user manual verification (PRD §10 checklist). Findings go
  through regression, fix, review, and recheck. Do not start Phase 1.4.
- Running process/session: none started by this work (the user's own dev server
  on :3000 was left alone).

## Packages

| Package | Status |
| --- | --- |
| 1. Planned-date schema, migration, service/API | Complete; focused tests pass |
| 2. Workbench Today/calendar derivation | Complete; integration coverage passes |
| 3. Unified Home capture | Complete; browser coverage passes |
| 4. Today panel | Complete; browser coverage passes |
| 5. Home monthly calendar | Complete; browser coverage passes |
| 6. Viewport-fit responsive Home | Complete; browser coverage passes |
| 7. Integrated QA and handoff | Complete; awaiting user manual verification |

## Review Evidence

### Author self-review, pass 1

Findings recorded before fixes:

- Planned-work calendar links were not marked as task links, so task-panel
  focus restoration could miss a planned-date record.
- The detailed task board date filter ignored planned work dates even though the
  board now displays them.
- Existing Phase 1.2 Home browser tests still asserted the removed dashboard
  composition and Create menu.

Fixes:

- Planned calendar records now carry the task-link marker.
- Task board date filtering includes planned dates and names the combined filter.
- Stale browser assertions are being adapted to the Phase 1.3 Home workbench.

### Orchestrated reviews (pass 2)

Each package was reviewed by a separate reviewer agent before fixes; review
files are in `.artifacts/phase13-sdd/`. These are agent reviews of agent work,
not independent certification.

- Search/planned dates (commit 6fcfb83): no Critical/Important findings.
- Home calendar: Important — keyboard tests used programmatic focus; Home help
  text truncated on mobile. Also fixed: drag of planned work called the events
  API (gap audit, Critical). Fixed in 33f4ac4.
- Stale Phase 1.2 tests: Important — Focus test asserted a link hidden behind a
  modal. Fixed before the baseline commit.
- Home layout/Today: Important — clipped Today focus rings; cramped columns
  beside the sidebar; completion error squeezed into the check column; clipping
  on short/zoomed screens. Fixed in f8bad48 (height-scoped viewport fit,
  container-query collapse, inset focus, full-row error).
- Whole-phase review: Important — a calendar date click wiped the Quick Capture
  draft; a cleared date field still saved the clicked date. Fixed in 2d6d95b.
- Final gate found a regression from f8bad48: Quick Capture in the mobile
  command palette had a zero-width title column. Fixed in 2d6d95b.

## Checks

All against isolated test databases; never against `data/relay.db`.

- At f8bad48: `npm run typecheck` 0; `npm run lint` 0; `npm run test -- --run`
  71/71; `npm run build` 0; full `RELAY_TEST_SERVER=production npx playwright
  test` 127 passed, 10 skipped, 3 failed (stale filter label x2, palette layout
  regression).
- At 2d6d95b: typecheck 0, lint 0, build 0; Playwright `phase13`, `tasks`,
  `workbench` specs 63 passed, 7 skipped (desktop-only drags, viewport-specific
  layout tests), 0 failed. The full suite was not rerun after these fixes.
- Migrations on disposable copies: fresh database reaches 7 migrations with
  nullable `task.planned_date`; upgrade of a copy of the pre-0006 backup keeps
  its user and projects; integrity ok and no foreign-key errors on both.

## Findings

Open Minor items (accepted, not fixed): `/calendar` has no `+N more` limit (the
detailed view shows every record); the legacy-upgrade test assumes 0006 is the
latest-but-one migration; the Momentum chart test was removed with the chart.
Remaining Minor notes are in the review files.

## Reset Record

No reset performed or authorized.
