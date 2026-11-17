# Phase 1.3 Implementation PRD

**Status:** Draft for user review. No implementation has started.
**Date:** 2026-11-16
**Execution:** Sequential single-agent implementation and author self-QA.
**Goal:** Make Home Relay's single daily workbench for fast capture, today's execution,
and monthly planning without removing detailed management workflows.

Reading or saving this document does not start execution. The user will invoke it
through `/goal`. That invocation authorizes Phase 1.3 implementation only. It does
not authorize a database reset, deployment, a new phase, or changes to unrelated
pages.

## 1. Authority And Existing Constraints

Read `AGENTS.md`, `docs/PRD.md`, `PRODUCT.md`, `DESIGN.md`,
`docs/Phase 1.2 Implementation PRD.md`, `docs/Phase 1.2 Progress.md`, and the
current callers before implementation.

Phase 1.2 remains the baseline. Its manual CRUD, ownership, revision, idempotency,
history, Undo, lifecycle, timezone, accessibility, responsive, and no-AI rules
remain in force.

Phase 1.3 explicitly supersedes only the Phase 1.2 Home composition:

- Home becomes a two-column daily workbench.
- Home keeps Quick Capture and Today's Tasks.
- Home uses a full monthly calendar instead of the Home Upcoming card.
- Home is a viewport-fit workbench with no page-level scrolling at supported
  desktop and mobile sizes; dense task/calendar regions may scroll internally.
- Home does not render the previous metrics, matrix, projects, momentum, resume,
  or Upcoming dashboard composition in the primary daily layout.
- Detailed Projects, Inbox, Calendar, History, Settings, Chat, task panels, event
  panels, Focus, search, and recovery remain available.

Do not silently change product behavior when an existing requirement conflicts with
this document. Record the contradiction in the Phase 1.3 progress document and stop
for clarification if it affects persisted data, ownership, recovery, or security.

## 2. Product Problem And Daily Workflow

Relay is intended to help one owner capture work, organize it lightly, schedule
what matters, execute today, and resume after interruption. The current Home
requires too many surfaces and makes capture and daily planning feel separate.

The Phase 1.3 daily loop is:

1. **Capture:** write one item without navigating away.
2. **Place:** optionally choose Task, Project, or Event and provide a useful date
   context.
3. **Orient:** see overdue deadlines and work planned for today.
4. **Plan:** scan the month and move planned work or deadlines independently.
5. **Execute:** complete tasks inline and see progress update immediately.
6. **Manage deeply when needed:** use existing detailed pages and panels for
   descriptions, dependencies, check-ins, lifecycle, and recovery.

Home should answer three questions quickly:

- What can I capture right now?
- What needs attention today?
- What commitments and deadlines are coming up?

No automatic recommendations, AI calls, generated follow-up tasks, or hidden
prioritization rules are introduced.

## 3. Scope And Non-Goals

### Included

- Home two-column layout.
- Unified Quick Capture for Task, Project, and Event.
- Simplified task/project/event entry using existing server APIs and forms.
- Today's Tasks execution panel with overdue work and completion progress.
- Full monthly Home calendar with real database records.
- Separate task planned date and task deadline semantics.
- Calendar date-click capture context.
- Calendar item click-through to existing detail/edit interfaces.
- Independent rescheduling of planned dates, task deadlines, project deadlines,
  and events.
- Responsive desktop, tablet, and mobile layout.
- Focused regression coverage and Phase 1.3 documentation.

### Not Included

- AI, recommendations, chat implementation, or natural-language parsing work.
- Recurring tasks, recurring events, notifications, reminders, or background jobs.
- Time-blocking tasks as a second event system.
- A new calendar dependency or form framework.
- Sidebar or navigation redesign.
- Replacing existing detail panels, project boards, Inbox, or Calendar routes.
- Removing access to upcoming commitments.
- New project/task hierarchy, subtasks, or automatic task creation.
- Deployment, OAuth changes, external calendar integrations, or Cloudflare setup.
- Resetting or deleting the user's ordinary database.

Phase 1.3 QA must use isolated disposable SQLite databases. Existing user data,
including any data created during Phase 1.2 manual verification, must be preserved.

## 4. Data And Scheduling Contract

### Task planned date

Add one nullable date-only task field, named `plannedDate` in TypeScript and
`planned_date` in SQLite.

- It represents the local calendar day on which the owner intends to work.
- It is not a deadline and does not make a task overdue.
- It stores `YYYY-MM-DD` without UTC conversion.
- It uses the owner's saved timezone when interpreting relative dates.
- It is independent from `dueDate` and `dueAt`.
- Clearing it does not clear or change the task deadline.
- Changing `dueDate` or `dueAt` does not change it.
- A planned date may coexist with a task deadline.
- A task may have neither, either, or both.

Task deadlines retain the existing semantics:

- `dueDate` is a date-only deadline.
- `dueAt` is a timed deadline with an IANA timezone.
- A task cannot have both `dueDate` and `dueAt`.
- Date-only values remain on their intended local calendar date.
- Timed values preserve their instant and timezone behavior.

Time-specific work belongs to Events in this phase. `plannedDate` is intentionally
date-only; Phase 1.3 does not add a second timed task scheduling model.

### Calendar record categories

The Home month calendar may render up to four record categories:

| Category | Source | Meaning | Color |
| --- | --- | --- | --- |
| Planned work | `task.plannedDate` | Day the owner intends to work | `#8FB59A` |
| Task deadline | `task.dueDate` or local day of `task.dueAt` | When the task is due | `#F59E0B` |
| Project deadline | `project.deadline` | Project target date | `#8B5CF6` |
| Event | `event.start` and `event.end` | Scheduled time commitment | `#3B82F6` |

The planned-work color must be added as a shared token, remain readable against
the warm dark surfaces, and be paired with a category label or icon. Color alone
must never carry meaning. Existing project, task-deadline, and event colors remain
unchanged.

If a task has both a planned date and a deadline, the calendar may show two concise
items. Their accessible names must state whether the item is planned work or a
task deadline, and both open the same existing task detail interface.

### Persistence and migration

- Add a versioned migration after the current latest migration.
- Fresh databases include `planned_date`.
- Populated upgrades preserve every existing task, deadline, activity snapshot,
  mutation identity, and recovery record.
- Existing tasks receive `NULL`; do not infer planned dates from deadlines,
  creation timestamps, status, or legacy priority.
- Existing Undo/Restore snapshots remain readable and must not accidentally add,
  remove, or overwrite `plannedDate` when restoring an old task snapshot.
- Update all task create, edit, list, detail, search, calendar, and recovery
  boundaries to validate ownership and the new field.
- Keep the field nullable so Quick Capture can remain fast.

## 5. Home Information Architecture

Home uses the existing workspace shell and page padding.

```text
Home
|-- Quick Capture
|-- Daily Workbench
|   |-- Left column, about 45%
|   |   |-- Quick Capture
|   |   `-- Today's Tasks
|   `-- Right column, about 55%
|       `-- Monthly Calendar
```

The actual DOM should keep meaningful heading order and should not duplicate a
second visual card shell around an already enclosed component.

The Home route itself must fit inside the available viewport below the workspace
shell. Do not make the document body or `.home-page` the scroll container.
When content exceeds a region's available height, contain scrolling in the Today
list or calendar region and keep its heading and controls visible. Do not clip
records, focus targets, errors, or dialogs to create the appearance of a fit.

### Left column

#### Quick Capture

- Appears first.
- Uses existing card tokens, border, radius, spacing, and focus behavior.
- Defaults to Task.
- Provides a compact Task/Project/Event type control.
- Keeps the title input as the primary field.
- Task capture may expose a compact optional planned-date control.
- Project capture may use the existing project form with the title prefilled.
- Event capture may use the existing event form with the selected date prefilled,
  because an event still needs a valid time/range or all-day choice.
- No separate page navigation is required.
- Failed validation or network requests keep the entered title and other fields.
- Successful saves clear only the completed capture and refresh affected views.
- Mutation IDs, owner validation, history, Undo, and notifications remain unchanged.

Existing natural-language parsing must be preserved if it exists in the current
implementation. Phase 1.3 does not create a parser or guess dates from arbitrary
text.

#### Today's Tasks

This is the primary execution area, not a recommendation feed.

- Show unfinished tasks with a deadline overdue in the owner's timezone.
- Show tasks planned for the owner's local current date.
- Show tasks due on the owner's local current date.
- Show a task once even when it matches multiple conditions.
- Keep overdue items visibly distinct from planned and due-today items.
- Preserve inline completion, task links, project context, classification, blocker
  and dependency warnings, and existing task actions.
- Completed tasks that were planned or due today may remain visible as completed
  rows so progress is meaningful; completed overdue work is not reintroduced solely
  because its old deadline was missed.
- Show progress as completed current-day tasks over total current-day tasks.
- Show the overdue count separately when overdue work is present.
- Do not mark a task overdue because its planned date passed.
- A past planned date remains editable from the task detail interface and calendar;
  it does not silently change status or deadline.
- Empty state explains how to capture or schedule the first task.

The panel may have separate labeled groups for `Overdue` and `Today`. Grouping is
presentation only and must not mutate task status or classification.

### Right column

#### Monthly Calendar

- Occupies the full right column height available beside the left column.
- Uses the existing FullCalendar v7 integration and dark theme.
- Opens in month view.
- Provides previous-month, next-month, and Today controls.
- Highlights the current date.
- Displays the complete visible month grid, including leading/trailing days as
  supported by the existing calendar library.
- Renders real owner-scoped database records only.
- Uses concise titles and accessible category labels.
- Handles crowded dates with the existing library overflow behavior such as
  `+N more`; the overflow control must be keyboard reachable.
- Clicking a calendar item opens the existing task, event, or project detail/edit
  interface without creating a replacement editor.
- Clicking a date returns to Home with capture date context and makes quick creation
  available for that day.
- Preserves the existing timezone text and date-only/timed distinction.
- Does not remove the detailed `/calendar` route or its month/week/day/agenda views.

Calendar movement rules:

- Dragging planned work changes only `plannedDate`.
- Dragging a date-only task deadline changes only `dueDate`.
- Dragging a timed task deadline changes only `dueAt`, preserving its timed
  deadline representation and existing duration/instant rules.
- Dragging a project deadline changes only `project.deadline`.
- Dragging an event preserves its existing duration and timezone behavior.
- Every consequential movement uses the existing confirmation, revision check,
  idempotency, notification, and visual rollback behavior.
- A rejected or stale move restores the original visible position.
- A task planned-date move must never update `dueDate`, `dueAt`, importance, urgency,
  status, or project assignment.

## 6. Responsive And Accessibility Requirements

### Desktop

- Two columns at normal desktop widths.
- Left column approximately 45%, calendar approximately 55%.
- Both columns align at the top.
- Calendar fills the available column without forcing the page into a fixed-height
  viewport.

### Tablet

- Preserve two columns only while both remain usable.
- Collapse to one column before text, controls, or calendar cells become cramped.

### Mobile

- Stack Quick Capture, Today's Tasks, and Calendar vertically in that order.
- Keep the Home route viewport-fit and free of page-level scrolling; use compact
  layout and bounded internal regions for the Today list and month grid.
- Calendar remains usable at approximately 390x844.
- Prevent page-wide horizontal overflow.
- If the calendar grid requires internal scrolling, contain it within the calendar
  region and keep navigation/title controls visible.
- Keep date and item interactions reachable without drag.

### Accessibility

- Use semantic headings, lists, buttons, labels, and regions.
- Preserve visible focus and keyboard operation for capture, completion, navigation,
  date selection, overflow, and calendar items.
- Use text or icons alongside category colors.
- Keep error messages inline and associated with fields.
- Preserve dialogs' Escape behavior, focus trapping, focus restoration, pending
  protection, and accessible names.
- Respect reduced motion.
- Calendar records and Today progress need accessible text equivalents.
- Do not rely on hover-only actions or pointer-only rescheduling.

## 7. Architecture And File Map

Reuse the existing App Router, React, TypeScript, SQLite/Drizzle, Better Auth,
Zod, FullCalendar v7, Radix, Sonner, and test harness.

Expected files:

| Area | Files |
| --- | --- |
| Home composition | `src/app/(workspace)/page.tsx`, `src/app/globals.css` |
| Capture | `src/components/quick-capture.tsx`, `src/components/create-menu.tsx`, existing `task-form.tsx`, `project-form.tsx`, `event-form.tsx` |
| Today | Existing `TaskComplete`, `TaskSelection`, task action components; add one focused Today component only if composition needs it |
| Calendar | `src/components/manual-calendar.tsx`, existing Calendar page only for shared compatibility |
| Workbench reads | `src/lib/workbench.ts`, `src/lib/dates.ts` where date-only helpers are required |
| Task data | `src/lib/db/schema.ts`, `src/lib/tasks.ts`, task API routes |
| Search/recovery | `src/lib/activity.ts`, `src/lib/lifecycle.ts`, `src/lib/workbench.ts`, affected APIs only where the new field crosses the boundary |
| Migration | New migration in `drizzle/` |
| Tests | Existing workbench, tasks, calendar, recovery, and phase 1.2 suites |
| Evidence | `docs/Phase 1.3 Progress.md`, created only when implementation starts |

Keep route handlers thin. Keep validation, date semantics, ownership, mutations,
revisions, and recovery in `src/lib`. Do not add a client cache, state-management
layer, calendar abstraction, form framework, or dependency for this revision.

## 8. Implementation Sequence

Work in coherent packages. Add focused regressions before behavior changes, run
the affected checks, then run accumulated checks. Do not modify unrelated pages.

1. **Data contract and migration.**
   Add `plannedDate`, validation, task create/update support, migration, old
   snapshot compatibility, and integration coverage for fresh/upgrade behavior.

2. **Workbench derivation.**
   Extend Home reads for local Today grouping, progress, planned dates, and
   month calendar records. Preserve existing timezone boundaries and owner scope.

3. **Quick Capture.**
   Reuse the existing unified capture concept and forms. Add type selection,
   optional date context, direct task/project defaults, event prefill, pending
   protection, input preservation, and creation regressions.

4. **Today panel.**
   Compose the left execution panel with inline completion, grouping, progress,
   empty/error states, existing actions, and cross-view refresh checks.

5. **Home calendar.**
   Extend the existing FullCalendar wrapper for planned-work records, separate
   task deadline records, date-click capture context, month controls, overflow,
   item links, independent drag behavior, confirmation, rollback, and mobile
   keyboard alternatives.

6. **Home layout and visual pass.**
   Replace only the Home dashboard composition and add the minimum shared CSS
   needed for the two-column/stacked layout. Preserve established warm surfaces,
   borders, typography, control states, and sidebar behavior.

7. **Integrated review and QA.**
   Perform a separate author self-review for correctness, scope, data safety,
   security, accessibility, responsive behavior, and connected workflows. Record
   findings before fixing them, rerun affected checks, and self-recheck.

No Phase 1.3 work may reset the ordinary database. Do not amend or rewrite the
Phase 1.2 progress evidence. Create one Phase 1.3 progress document when `/goal`
starts implementation.

## 9. Test Plan

Extend existing Vitest and Playwright conventions. Do not add another framework.

### Integration

- Fresh migration creates `planned_date`.
- Populated upgrade preserves tasks, deadlines, activity, idempotency, and old
  recovery snapshots.
- Create, edit, clear, and restore `plannedDate`.
- Planned-date ownership and validation reject invalid or cross-owner input.
- Today grouping handles timezone boundaries, overdue deadlines, planned dates,
  completed tasks, and overlap without duplicates.
- Planned-date changes do not mutate deadline, classification, status, project,
  or completion fields.
- Existing task deadline behavior remains unchanged.

### Browser

- Home shows the new two-column desktop composition.
- Quick Capture creates Task, Project, and Event using real APIs.
- Quick Capture preserves title/input on failed save and prevents duplicate save.
- Date click provides the selected date to capture.
- Today renders overdue and current-day groups with progress.
- Inline completion updates Today, project progress, search, and calendar.
- Month navigation, Today shortcut, current-date highlight, item labels, and
  overflow work with real records.
- Planned-work and task-deadline records are visually and accessibly distinct.
- Clicking each item type opens its existing detail/edit interface.
- Dragging planned work changes only `plannedDate`.
- Dragging task deadlines changes only the appropriate existing deadline field.
- Rejected/stale movement visibly and persistently rolls back.
- Existing detailed Calendar views continue to work.
- Desktop, short laptop, mobile, long titles, crowded dates, empty states,
  loading/pending states, validation errors, keyboard paths, and reduced motion
  are covered.

## 10. Acceptance Gate

All items must pass before implementation is considered complete:

- [ ] Home is a single daily workbench with Quick Capture and Today on the left
  and a full monthly calendar on the right.
- [ ] Home stacks cleanly on mobile without page-wide horizontal overflow.
- [ ] Home Upcoming is removed, while upcoming commitments remain visible through
  the Home calendar and detailed Calendar page.
- [ ] Quick Capture supports Task, Project, and Event using existing CRUD rules.
- [ ] Plain task capture is fast and does not require an extra navigation step.
- [ ] Failed capture preserves input; successful capture does not duplicate data.
- [ ] Today's Tasks includes relevant overdue and current-day work, shows progress,
  and preserves inline completion and task actions.
- [ ] Completing or editing a task refreshes Today, calendar, search, and related
  project views consistently.
- [ ] The monthly calendar renders real project deadlines, task planned work,
  task deadlines, and events with distinct accessible indicators.
- [ ] Previous, next, Today, current-date highlight, date-click capture, item
  click-through, and crowded-date overflow work.
- [ ] Planned dates and task deadlines are persisted separately and remain
  independent through create, edit, drag, completion, Undo, and Restore.
- [ ] Calendar movement preserves existing event duration/timezone and task
  date-only/timed semantics.
- [ ] Existing Calendar, Projects, Inbox, task/event panels, Focus, search,
  history, recovery, authentication, and ownership behavior remain intact.
- [ ] Fresh and populated-upgrade migration checks pass.
- [ ] Typecheck, lint, unit/integration tests, production build, and production
  browser tests pass using isolated test databases.
- [ ] Separate author self-review has no unresolved security, data-loss,
  required-accessibility, or broken-workflow finding.
- [ ] No ordinary database reset, deployment, OAuth change, or unrelated-page
  redesign is performed.

Run and record actual exit codes for:

```text
npm run typecheck
npm run lint
npm run test -- --run
npm run build
RELAY_TEST_SERVER=production npm run test:e2e
```

Migration checks must use disposable SQLite files. Browser tests must use the
existing test-only real-session harness. Do not claim live Google sign-in,
physical-device behavior, Firefox/Safari behavior, or accessibility certification
unless those checks actually run.

## 11. User Verification Handoff

After automated acceptance, stop and provide:

- Changed files and tested revision/hashes where available.
- Actual commands and results.
- Migration and upgrade evidence.
- Explicit author self-review limits.
- Confirmation that the ordinary database was preserved.
- A short manual checklist.

Suggested manual checklist:

1. Open Home on desktop and mobile; verify the capture, Today, and month layout.
2. Capture a task, project, and event from Home.
3. Click a calendar date and create an item for that date.
4. Create a task with both a planned date and a deadline; move each calendar item
   separately and verify the other date does not change.
5. Complete a Today task and verify progress, calendar state, search, and project
   progress.
6. Open calendar items through their existing detail/edit interfaces.
7. Test crowded dates, empty states, keyboard navigation, browser zoom, and
   mobile layout.
8. Report findings. Fix findings through regression, implementation, self-review,
   and integrated rechecks. Do not reset verification data without renewed
   authorization.

Phase 1.3 completion means implementation and automated acceptance are complete.
It does not mean the user's manual verification or live OAuth check is complete.
