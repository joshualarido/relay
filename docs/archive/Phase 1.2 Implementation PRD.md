# Phase 1.2 Implementation PRD

**Status:** Implementation, automated QA and authorized local reset complete. User verification pending; evidence in `docs/Phase 1.2 Progress.md`.
**Date:** 2026-11-16
**Execution:** Sequential single-agent implementation and separate author self-QA.
**Goal:** Make the complete manual foundation warmer, clearer, denser where useful,
and easier to resume without changing Relay into an automated recommendation app.

Reading or saving this document does not start execution. The user will invoke
it through `/goal`. That invocation authorizes the work and final local database
reset described here, not deployment or a later phase.

## 1. Authority And Confirmed Decisions

Read `AGENTS.md`, `docs/PRD.md`, `PRODUCT.md`, `DESIGN.md`, and relevant existing
code before implementation. Use `docs/Phase 1 Foundation Plan.md` and
`docs/Phase 1 Progress.md` as baseline implementation/evidence, not instructions
to restart the completed phase.

This document explicitly supersedes earlier requirements as follows:

- Do not implement full-screen scroll navigation or route-per-scroll gestures.
  Keep ordinary page scrolling, links, routing, and browser Back/Forward.
- Completing a project completes its unfinished child tasks after an in-app
  preview and confirmation. Reopening a project leaves child statuses unchanged.
- Pausing a project does not rewrite child statuses. Archiving continues to hide
  associated work from active views without rewriting child statuses.
- Replace Low/Medium/High priority with explicitly chosen importance and urgency.
  Deadlines produce separate overdue/due-soon indicators, not automatic urgency.
- Replace the neutral near-black/saturated accent and sparse bounded-page layout
  with the warm solid palette and enclosed bento layout specified below.
- Search belongs directly under the Relay title and moves with the sidebar.
- Desktop navigation can collapse/expand; mobile navigation remains a drawer.
- Home creation uses one Create dropdown for Task, Project, and Event.
- Replace browser confirmation popups with in-app dialogs.
- Remove repetitive AI warnings. Chat has a concise "Coming soon" state.
- Implementation, research, review, and QA stay in one session without delegation.
- After implementation and automated acceptance, back up and reset the local
  database, migrate it, and hand an empty workspace to the user for verification.

All unaffected PRD requirements remain: SQLite, authenticated ownership, manual
CRUD, dependencies, calendar, Focus, check-ins, safe recovery, accessibility,
mobile usability, and no automatic AI calls.

### Implementation Defaults

These settle minor details without reopening the user's confirmed choices:

- Collapsed desktop navigation is an icon rail, not a completely hidden sidebar.
  Persist the preference in a browser cookie, read by the server shell to avoid
  an expanded-sidebar flash. It is UI state, never an identity/auth authority.
- New quick-captured tasks may be unclassified. Importance and urgency are
  nullable booleans; missing either puts a task in an explicit Unclassified group.
- Existing Low/Medium/High values cannot establish two independent dimensions.
  Preserve legacy information during migration and mark those tasks unclassified;
  never infer urgency or discard historical priority data.
- The dashboard uses simple transparent ordering, not AI or a substitute
  recommendation engine. No arbitrary productivity score is introduced.
- No new chart, form, cache, scrolling, or animation library is needed.

## 2. Scope And Non-Goals

Included: shared shell/design tokens, all existing page layouts and states, Home
creation/dashboard, Eisenhower task organization, cascading project completion,
app confirmations, regression coverage, docs, and the final verification reset.

Not included: scroll navigation, AI/model settings, AI recommendations or recovery
plans, new integrations, collaboration, public signup, deployment, Cloudflare
setup, recurring backup infrastructure, or a light theme.

Do not drop existing features to make the layout simpler. Do not invent controls
or fill cards with production sample data. Do not add project-level Eisenhower
fields, event completion states, or subtasks: the current hierarchy does not
require them.

## 3. Visual System

Use the attached inspiration's warm surfaces, enclosed cards, readable hierarchy,
and restrained honey accent, not its gradients/glow or extra creation shortcuts.

### Starting Tokens

| Role | Value |
| --- | --- |
| Background | `#261F19` |
| Card/sidebar | `#322A23` |
| Elevated surface | `#3D332A` |
| Border | `#665444` |
| Main text | `#F2E8DC` |
| Secondary text | `#C3B5A5` |
| Accent/focus | `#D8B477` |
| Accent foreground | `#261F19` |

These are the starting palette, not permission to ship inaccessible combinations.
Use shared tokens, with OKLCH equivalents if useful, and adjust contrast locally
within this direction. Preserve calendar data colors: project `#8B5CF6`, task
`#F59E0B`, event `#3B82F6`. Pair colors with labels/icons and verify readable text.
Use semantic danger/success colors sparingly; do not recolor every task amber.

- Keep locally packaged DM Sans and a restrained fixed type scale.
- Full-width page shells; remove the 1400px page ceiling and page-wide 560px bounds.
- Default padding: 32px desktop, 24px tablet, 16px phone. Use 16-24px grid gaps
  and 20-24px card padding, reducing padding on phones where necessary.
- Enclosed cards have solid surfaces, complete 1px borders, and 12-16px corners.
  Controls keep a coherent smaller radius and at least 40px height.
- Lists may have internal dividers; a top/bottom line is not the outer container.
- Mostly symmetrical grids: two main columns, three compact metric cards, and
  single-column mobile. Three settings columns only when content supports them.
- Fill available width meaningfully, not with empty filler or full-width prose.
  Keep prose around 65-75 characters wide and inputs sensibly sized inside cards.
- Use viewport height as a minimum where useful, never clip content or prevent
  normal scrolling to force a screen to fit.
- Motion explains state changes only, roughly 150-200ms, respecting reduced motion.
  No decorative gradients, glow, page-load choreography, or deep card nesting.

Apply this system to login, calendar, dialogs, notifications, loading, empty,
error, not-found, and disabled/pending states as well as ordinary pages.

## 4. Shell, Search, Creation, And Feedback

### Navigation

- Place the search trigger in sidebar document flow directly beneath the title
  row. Remove the independent fixed positioning and compensating blank spacing.
- Add an accessible collapse/expand button; main content reclaims released width.
- The collapsed rail preserves active-route indication, icon labels/tooltips,
  search access, account access, and an obvious expand control.
- Ctrl/Cmd+K opens one shared palette regardless of sidebar state.
- Preserve mobile drawer focus trapping, Escape, focus return, and route closing.
- Remove the sidebar assistant-availability disclosure and explanatory warning.

### Create

- Home has one `Create` button with a dropdown: Task, Project, Event.
- Choosing an entry opens its existing form, with shared validation/mutation rules.
  Do not render three permanent forms or extra entity buttons next to Create.
- Task creation permits Inbox or project assignment; default is Inbox. Event
  creation uses saved timezone preferences and existing association rules.
- A successful creation closes its form and refreshes affected views. Failures
  keep input and the form open; pending saves cannot lose intervening edits.
- Preserve literal-title capture and command-palette/Inbox capture functionality.
  Remove the large always-expanded Home task-capture block.

### App Feedback

- Replace all browser `alert`, `confirm`, and `prompt` flows in application code
  with accessible existing Radix primitives; do not install a second dialog system.
- Cover board/form completion, calendar dragging, and edited event rescheduling.
- Consequential actions show a concise affected-state preview and explicit action
  labels. Cancel changes nothing; canceled/failed calendar moves revert visually.
- Inline field/request errors preserve input. Routine saved/Undo feedback remains
  nonblocking Sonner notices styled with app tokens.
- Dialogs restore focus. Notification/Undo actions remain usable above dialogs;
  persistent History remains the recovery path when a notice expires.

## 5. Lifecycle Contract

### Project Completion

When a project transitions from any non-Completed status to Completed:

1. Show its name, exact unfinished-child count, and affected task titles in an
   in-app confirmation. Make the cascade explicit. An empty/finished project
   needs no warning about nonexistent unfinished tasks.
2. Confirm against current owner-scoped project/task revisions and membership.
   A changed, added, removed, reassigned, or deleted child invalidates the preview.
3. In one transaction, complete the project and set unfinished non-deleted child
   tasks to Done, with completion times, updated timestamps, and bumped revisions.
4. Preserve tasks already Done, including their original completion timestamps.
   Do not touch unrelated tasks, independently deleted records, events, or check-ins.
5. Persist the complete affected before/after state and mutation identity in the
   same transaction. Failure rolls back records and activity together.
6. Offer one Undo operation for the whole completion. Stale Undo refuses all
   changes rather than partially restoring children or overwriting later work.

Use the same server-owned rule for project form updates, board status selections,
and drag/reorder completion. Replayed requests do not duplicate completion/history.
Blockers/dependency warnings remain visible in the preview but are not a new
hard-blocking policy. Cross-project prerequisites never become cascade targets.

Reopening changes only the project. Pausing changes only the project. Archive
hides associated work but preserves statuses. Existing confirmed cascading soft
deletion/restoration remains unchanged. An archived project still follows these
rules if edited through its reachable detail page.

Do not automatically reopen a project when a child is reopened or added. Project
status is an explicit choice; progress remains completed eligible tasks / total,
with 0% for an empty project, even if manually marked Completed.

## 6. Eisenhower Priority Contract

- Store importance and urgency as separate nullable boolean fields, independent
  of Backlog/Next/In Progress/Blocked/Done.
- Expose explicit Important and Urgent choices, including an unclassified state.
  A deadline change never silently changes either choice.
- Fully classified unfinished tasks occupy exactly one quadrant:

| Important | Urgent | Display |
| --- | --- | --- |
| Yes | Yes | Do first |
| Yes | No | Schedule |
| No | Yes | Handle quickly |
| No | No | Reconsider |

- Missing either choice appears in Unclassified, not a falsely asserted quadrant.
  "Schedule" and "Reconsider" are organizational labels, not automatic mutations.
- Update task creation/editing, board/list metadata, details/Focus, Home, search,
  and filters together; remove Low/Medium/High as the active priority control.
- Home's matrix covers active unfinished tasks across projects and Inbox.
  Inbox's matrix remains limited to unassigned tasks; project tasks stay in their
  project workspace. Keep existing list/Kanban views.
- Use accessible headings, counts, rows, and explicit editing controls; dragging
  is not required to classify a task.

### Migration And Recovery

Add a versioned migration; do not rewrite applied migrations or reset user data
as a shortcut to avoid upgrade support. Preserve legacy priority in storage/history
while transitioning the live API/UI to the new dimensions.

Test a populated pre-1.2 database with old activity snapshots and idempotency
results, not just a newly migrated empty database. Old Undo/Restore must either
work with compatible normalized snapshots or report a genuine revision conflict;
it must not crash, overwrite new classification, or resurrect a retired UI field.
Preserve original historical meaning. Do not fabricate old importance/urgency.

## 7. Home Dashboard

### Header And Metrics

- Greeting and concise context on the left; Create dropdown on the right.
- Three compact cards: overdue unfinished tasks, tasks due today, active projects.
- Counts cover all eligible records, not only the displayed preview rows.
- Metrics are actionable: reveal a labeled filtered list of matching records
  without changing the existing meaning of Inbox.
- Calculate overdue/today using saved timezone. Date-only tasks become overdue
  after their local due date; timed tasks use the actual deadline instant.
  A timed task can be overdue and due today; labels make this overlap clear.
- Exclude soft-deleted and archive-hidden work consistently with existing services.

### Overview Composition

- Main row: Today's Focus and Upcoming commitments, approximately equal width.
- Supporting row: Projects at a glance and Momentum, approximately equal width.
- Use a compact recently-worked link/list for resuming, not another large text block.
- Limit preview rows, show total counts and a reachable expanded list, and let
  shorter viewports scroll normally. Do not hide the rest of a workload.

Today's Focus shows up to five unfinished tasks ordered transparently: Important
and Urgent first, then overdue, then due today, then In Progress; deduplicate,
break ties by deadline and saved order, and label why each task appears.
Blocked tasks show their warning rather than inviting an impossible "resume".
Display deadline, project, importance/urgency, completion, and task/Focus access.
Do not present this as AI advice or invent a daily plan.

Upcoming commitments combines dated projects, unfinished tasks, and events,
sorted chronologically with type labels, timezone-aware dates, and detail links.
Use the existing short preview with a way to inspect the remaining schedule.

Projects at a glance shows active projects, progress bars, remaining task counts,
and deadlines; every project opens its details.

Momentum shows daily completions for the last seven local calendar days. Derive
it from persisted completion/history data, including days with zero; separate
project-cascade completions from individually completed tasks. Reopening does not
erase the fact an earlier completion occurred; label this as completion activity,
not a count of unique tasks currently Done. Do not inflate counts from request
replays or restored snapshots. Include an accessible text summary.

### Matrix View

Add an Overview / Priority Matrix switch on Home rather than rendering both
complete interfaces simultaneously. The matrix exposes all four quadrants plus
Unclassified, totals, task details, and explicit classification controls.
On mobile, quadrants stack in a readable labeled order.

### Charts

Use native SVG for the small completion chart and native progress elements where
suitable. Existing Lucide, Radix, Sonner, and Motion cover other needs. Recharts
is deferred until interactive multi-series reporting justifies a dependency.

## 8. Other Page Revisions

| Surface | Required revision |
| --- | --- |
| Projects | Full-width board, enclosed status columns, consistent project cards, visible progress, compact filters and existing archive access. |
| Project details | Overview/progress cards, full-width task workspace, supporting event/check-in/activity cards; no narrow page-wide bound. |
| Inbox | Clear task workspace with compact filters and List / Board / Matrix; preserve unassigned-task scope. |
| Calendar | Substantial bordered rounded calendar container and consolidated controls/legend; preserve month/week/day/agenda, colors, rescheduling, and timezone rules. |
| Settings | Responsive two-column cards for existing calendar preferences, navigation preference, and account; use a third column only if natural, no fake settings. |
| History | Enclosed readable activity rows, expandable changes, visible recovery actions; collapse raw snapshots and retain conflict explanations. |
| Chat | One intentional "Coming soon" state, no fake composer or repeated warnings. |
| Task/event dialogs and Focus | Consistent sections, controls, metadata, action placement, responsive dimensions, and accessible focus behavior. |
| Login and route states | Same solid palette, clear hierarchy, useful loading/empty/error/recovery states, no login gradient. |

Remove redundant deferred-AI sections from Home, Settings, and project details.
Keep Chat reachable, but do not spend dashboard space explaining missing AI.
Preserve manual check-ins, dependency editing, Focus, search, recovery, and all
working navigation. Visual simplification is not permission to remove features.

## 9. Implementation Sequence And File Map

Work in coherent packages; add focused regressions before changing behavior and
run accumulated tests after each package. No extra orchestration infrastructure.

1. **Documentation and shared foundation.** Reconcile `PRODUCT.md`, `DESIGN.md`,
   and current PRD references/overrides; fix stale `docs/Initial PRD.md` references
   in current guidance. Preserve historical progress evidence. Update
   `src/app/globals.css`, root/workspace layouts, navigation, and shared controls.
   Accept after responsive shell, collapse persistence, search, and contrast checks.
2. **In-app decisions.** Reuse Radix dialogs in project board/form and
   event/calendar confirmation callers; preserve rollback and notification layering.
   Accept after keyboard, cancel, pending/failure, and no-native-dialog regressions.
3. **Data behavior.** Update `src/lib/{projects,tasks,workbench,lifecycle}.ts`,
   `src/lib/db/schema.ts`, relevant API routes, `drizzle/`, and task/project UI.
   Accept after fresh/upgrade migrations, cascade/replay/conflict/rollback/Undo,
   importance/urgency, and legacy-history tests. Do not duplicate lifecycle logic.
4. **Home creation/dashboard.** Reuse project/task/event forms, extend Home reads
   in `src/lib/workbench.ts`, and compose `src/app/(workspace)/page.tsx` with
   minimal focused components as needed. Accept after real-data metrics, ordering,
   charts, creation, detail links, and cross-view refresh tests.
5. **Remaining surfaces.** Revise existing workspace pages and shared panels per
   section 8; preserve all existing workflows. Accept after per-route responsive,
   empty/error, keyboard/touch, and recovery regression checks.
6. **Whole-phase QA, reset, handoff.** Perform a separate integrated author review,
   run the complete gate, resolve findings, then execute section 11 exactly once
   and provide the manual checklist. No automatic continuation to Phase 2.

Extend existing `tests/integration/{projects,tasks,workbench,recovery}.test.ts`
and relevant `tests/e2e/{shell,projects,tasks,calendar,workbench,recovery,foundation}.spec.ts`.
Use existing Vitest/Playwright conventions; do not add another test framework.

During execution create/update only one `docs/Phase 1.2 Progress.md` checkpoint:
package status, tested files/hashes, decisions, checks, self-review findings,
current blocker, exact next action, running process/session, and reset status.
This PRD defines requirements; the progress document records actual evidence.

## 10. Acceptance Gate

All must pass before touching the ordinary database:

- [ ] Search stays beneath the title in expanded desktop/mobile navigation and
  remains reachable in the collapsed rail; one palette and shortcut behavior.
- [ ] Sidebar state persists without layout overlap or a first-paint width jump.
- [ ] Home creates tasks, projects, and events through one dropdown and preserves
  input on failure, without duplicate saves or stale reopened forms.
- [ ] App dialogs replace native popups; keyboard/focus, cancel, calendar rollback,
  pending controls, and notification/Undo layering work.
- [ ] Cascade completion covers every entry point, owner isolation, already-Done
  and deleted children, membership/revision changes, blocked/dependent tasks,
  request replay, transaction failure, and all-or-nothing stale Undo.
- [ ] Pause/reopen/archive preserve children as specified; independent events and
  cross-project prerequisites remain untouched.
- [ ] Four quadrants and Unclassified work across forms/views/search. Deadlines
  do not mutate urgency. Populated upgrades preserve old history and recovery.
- [ ] Dashboard totals, previews, filters, links, focus ordering, progress, and
  completion chart use real eligible records and correct timezone boundaries.
- [ ] Each page uses available width and enclosed surfaces without clipping,
  filler, excessive nesting, repeated warnings, or removed manual features.
- [ ] Desktop 1440x900, shorter laptop 1366x768, touch mobile 390x844, browser zoom,
  long content, empty/large workloads, reduced motion, labels, and focus verified.
- [ ] Normal text meets 4.5:1 contrast; large text and essential UI indicators meet
  applicable 3:1 requirements. No color-only information or inaccessible charts.
- [ ] Separate whole-phase author spec/quality self-review has no unresolved
  security, data-loss, required-accessibility, or broken-workflow finding.

Run and record actual exit codes for:

```sh
npm run typecheck
npm run lint
npm run test -- --run
npm run build
npm run test:e2e
```

Run browser tests in production mode using the existing harness
(`RELAY_TEST_SERVER=production`), isolated databases, and test-only real sessions.
Verify fresh and populated-upgrade migrations separately with `npm run db:migrate`
pointed at disposable files. Install from the lockfile with `npm ci` if needed;
do not update dependencies speculatively.

Follow Impeccable and React best practices. Run the changed-target design detector
and visually inspect the finished UI at target sizes, using permitted tooling.
Record author self-review as such, never as independent review or certification.
Live Google sign-in remains the user's manual verification, not a seeded-session
test claim.

## 11. Authorized Final Local Database Reset

**Timing:** Only after implementation and section 10 automated acceptance.
This is one authorization for a local Phase 1.2 verification reset, not permission
to wipe data during development, reset deployed databases, or erase later manual
verification work whenever a bug is fixed.

The requested reset clears the entire app database, including old projects/tasks/
events, history, account/session records, and preferences. It preserves `.env`
and Google/OAuth configuration. The user signs in again; default preferences return.

### Safe Procedure

1. Resolve the effective application database path from the actual runtime
   configuration, including environment-file precedence. Compare it with the
   migrator's effective target; its current `.env` loader is not proof that it
   matches Next's configuration. Pass the verified `DATABASE_URL` explicitly
   to migrations so app and migrator cannot target different databases.
2. Record the resolved absolute database and exact `-wal`/`-shm` sidecar paths,
   without logging credentials. Verify the canonical target is the intended local
   database under this workspace, not a symlink/junction escape, a deployed path,
   a test fixture, or a computed directory target. An ambiguous/external target
   is a genuine blocker requiring user clarification; do not guess.
3. Stop identified Relay writers cleanly, including any dev/production/test
   servers using that file. Do not kill unrelated Node processes. Close database
   connections and do not proceed while writers/locks remain.
4. If the source exists, make a timestamped SQLite-consistent backup using the
   installed driver's backup API (or an equivalent SQLite-native snapshot), not
   a raw live `.db` copy that ignores WAL. Store it privately under ignored
   `.artifacts/phase1.2-backups/`; verify `PRAGMA integrity_check` returns `ok`.
   Protect auth/session contents and never expose the backup through a public
   route or publish it. If absent, record that fact; do not invent a backup.
5. Prepare a fresh sibling database, apply committed migrations to it using the
   explicit target, and check schema/integrity/foreign keys before replacing the
   ordinary database. Checkpoint its WAL and close all connections before moving
   it so migrated schema/data are in the main file, not a stranded sidecar.
   Keep the verified backup and never delete it automatically.
6. With all connections closed, replace only the verified original database.
   Handle its exact WAL/SHM companions safely so stale journals cannot attach to
   the replacement. No glob deletion, recursive directory deletion, or cross-shell
   filesystem command construction. If replacement fails, report the state and
   preserve the backup; never claim a clean reset.
7. Run `npm run db:migrate` against the actual final configured path and verify
   its exit code, current migration metadata, required tables/columns,
   `PRAGMA integrity_check`, and `PRAGMA foreign_key_check`.
8. Confirm all application/auth/preferences tables are empty. Keep migration
   metadata; do not seed samples, create test users, or run browser fixtures on
   this ordinary file. Disposable QA databases remain separate.
9. Record the reset target, backup path, checks/results, and current server state
   in the progress document. Leave the app ready to start with `npm run dev`;
   do not assume a server is running or Google consent has been verified.

If a regression is discovered after reset, return to isolated QA. The reset is
not evidence that populated upgrades worked, and must not hide migration defects.
Do not repeat a successful reset after the user begins verification without
renewed authorization.

## 12. User Verification And Completion

Handoff includes tested revision/hashes, checks/results, self-review limits,
backup location, successful reset/migration evidence, and this checklist:

1. Start Relay, sign in with Google again, refresh, and verify the empty workspace.
2. Collapse/expand navigation, reopen it on mobile, and use search/Ctrl+K.
3. Create one task, project, and event from Home; verify real cross-page updates.
4. Classify tasks in all quadrants/Unclassified; confirm deadlines do not toggle urgency.
5. Complete a project with unfinished tasks through an app confirmation, inspect
   children/progress, Undo it, and verify pause/reopen/archive semantics.
6. Reschedule an event, cancel and confirm app dialogs, and inspect calendar dates.
7. Inspect Home metrics/charts, project details, Settings cards, History, and mobile
   layouts. Verify Chat says "Coming soon" without repetitive warnings elsewhere.
8. Report findings. Fix each with a regression, focused checks, separate self-review,
   and integrated rechecks; preserve new verification data unless reset is requested.

Implementation/automated QA completion and user acceptance are separate states.
Stop after handoff. Do not mark user verification complete, claim production
readiness, deploy, or begin another phase.

## 13. Goal Invocation

When the user invokes this document through `/goal`, use this execution brief:

> Implement Phase 1.2 according to `docs/Phase 1.2 Implementation PRD.md` and
> `AGENTS.md`. Work sequentially as a single agent without orchestration.
> Maintain `docs/Phase 1.2 Progress.md`, implement all in-scope changes with
> regressions, and perform separate author self-review and whole-phase QA.
> After all automated acceptance passes, execute the authorized one-time local
> backup/reset/migration procedure, verify the actual empty database, provide
> the manual verification checklist, and stop. Preserve secrets and unrelated
> user work. Do not implement scroll navigation, AI, deployment, or another phase.
