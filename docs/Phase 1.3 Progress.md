# Phase 1.3 Progress

## Execution Contract

- Phase: 1.3 daily Home workbench.
- Authorization: user explicitly requested execution in this thread.
- Execution: sequential single-agent implementation and author self-QA.
- Ordinary database reset: not authorized; preserve `data/relay.db` and user
  verification data.
- Scope: unified Home capture, Today execution, monthly Home calendar, separate
  task planned date/deadline, and viewport-fit Home with no page-level scrolling.
- Out of scope: AI, deployment, OAuth changes, navigation redesign, unrelated
  pages, and new dependencies.

## Current Checkpoint

- Phase 1.3 PRD and Phase 1.2 evidence reread.
- Next.js installed docs for App Router pages, search params, Server/Client
  boundaries, and mutation behavior reread.
- Impeccable context and craft-floor guidance loaded for the Home UI change.
- Planned-date migration `0006_fearless_edwin_jarvis.sql` adds nullable
  `task.planned_date`; current task create/update/search and old replay fallback
  now accept it without changing deadline fields.
- Workbench now derives deduplicated Today tasks and completion progress;
  Home/Quick Capture/Task forms/Task details/Task board/Calendar have the first
  Phase 1.3 integration pass, including planned-work calendar records.
- Focused task, upgrade, and typecheck checks pass.
- Exact next action: update stale Phase 1.2 browser expectations, add focused
  Phase 1.3 browser coverage, then run the separate author self-review.
- Running process/session: none known.

## Packages

| Package | Status |
| --- | --- |
| 1. Planned-date schema, migration, service/API | Complete; focused tests pass |
| 2. Workbench Today/calendar derivation | Complete; integration coverage passes |
| 3. Unified Home capture | Complete; browser coverage pending |
| 4. Today panel | Complete; browser coverage pending |
| 5. Home monthly calendar | Complete; browser coverage pending |
| 6. Viewport-fit responsive Home | Complete; browser coverage pending |
| 7. Integrated QA and handoff | Pending |

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

## Checks

No Phase 1.3 implementation checks have run yet.

## Findings

None recorded yet. Findings must be recorded here before fixes during the
separate author review pass.

## Reset Record

No reset performed or authorized.
