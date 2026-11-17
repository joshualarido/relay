---
title: Relay v3 Phase 0 - Cut
date: 2026-11-17
status: awaiting approval
spec: "[[Relay PRD v3]] (v3.2)"
roadmap: "[[2026-11-17 Relay v3 Roadmap]]"
---

# Relay v3 Phase 0 (Cut) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the existing Relay app to the v3 model (three screens, three task statuses, planned dates as linked events) without losing any user data and while keeping Undo working.

**Architecture:** Additive SQL migrations (no column or table drops) plus code removal. Legacy values in old activity snapshots are normalized when read, so Undo and Restore of pre-v3 operations keep working. The UI is only *reduced* here. The redesign is Phase 1.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SQLite (better-sqlite3) + Drizzle, Zod 4, Vitest, Playwright.

**Spec:** `docs/PRD.md` (= Relay PRD v3.2, copied in Task 1). Repo: `C:\Users\joshu\Documents\0-coding\personal\relay`, base `main` @ `691c3bb`.

## Global Constraints

- Work only on branch `v3/phase-0-cut` (T3 worktree). Commit per task. Never push, merge or rebase `main`.
- Never touch `data/relay.db`, `.env` or the OAuth config. Tests use the isolated `testWorkspace()` from `tests/support/auth.ts`.
- No new dependencies.
- Migrations are additive: **no `DROP COLUMN` or `DROP TABLE`**. Dormant columns and tables stay in `schema.ts`, each with a `// dormant (v3): …` comment.
- Keep the activity log, revisions, mutation IDs and replay. They power Undo (PRD v3 §5 as amended in the roadmap).
- Task statuses are exactly `["To do", "Doing", "Done"]`, defaulting to `"To do"`. Project statuses are exactly `["Planned", "Active", "Paused", "Done"]`.
- Legacy mapping: `Backlog→To do`, `Next→To do`, `In Progress→Doing`, `Blocked→Doing`, `Done→Done`, project `Completed→Done`.
- Navigation is exactly Today `/`, Projects `/projects`, Calendar `/calendar`. Settings is reachable from the account/avatar control.
- Read `node_modules/next/dist/docs/` before touching routing or redirect code (AGENTS.md rule).

## Review Focus

1. **Undo of a pre-v3 operation:** an activity snapshot holding `status: "In Progress"` must restore as `"Doing"`, not fail enum validation. Test in Task 2.
2. **A task with a planned date that already has a linked all-day event that day:** the migration must not create a duplicate. Test in Task 3.
3. **Soft-deleted tasks with a planned date:** the migration creates no event for them. Test in Task 3.
4. **Old bookmarks:** `/history`, `/chat` and `/inbox` (the last after Phase 2) must redirect to `/`, not 404. Test in Task 4.
5. **Search results** for loose tasks link to `/inbox?task=…`. That must still open the task while Inbox is hidden from the navigation, since the Inbox route stays until Phase 2. Test in Task 4.

---

### Task 1: Authority docs and branch

**Files:**
- Create: `docs/PRD.md` (replace contents with Relay PRD v3.2 from the vault)
- Create: `docs/archive/` and move the old `docs/PRD.md` (v2.4) and all `docs/Phase 1*.md` into it
- Create: `docs/Phase 0 Progress.md`, `docs/superpowers/plans/2026-11-17-relay-v3-roadmap.md`, `docs/superpowers/plans/2026-11-17-relay-v3-phase-0-cut.md` (copies of the vault plans)
- Modify: `AGENTS.md`, `PRODUCT.md`

- [ ] **Step 1:** In `AGENTS.md`, replace "Authority And Scope" with: authority is `docs/PRD.md` (v3), the active phase plan is under `docs/superpowers/plans/`, and the progress file is `docs/Phase N Progress.md`. Git is initialized: commit per task on the phase branch, never push or merge `main`.
- [ ] **Step 2:** In `AGENTS.md` "Product And Design", delete the bento/enclosed-card/"Deferred Chat says Coming soon"/sidebar-search rules. Replace them with one line: "Visual rules come from DESIGN.md. Phase 1 rewrites it; until then do not add new UI." Keep the data-safety and accessibility rules unchanged.
- [ ] **Step 3:** In `PRODUCT.md` "Product Authority", point to `docs/PRD.md` v3 only.
- [ ] **Step 4:** Verify with `git diff --stat`. Only docs, `AGENTS.md` and `PRODUCT.md` have changed.
- [ ] **Step 5:** Commit `docs: adopt Relay PRD v3 and Phase 0 plan`.

### Task 2: Status model migration

**Files:**
- Create: `drizzle/0007_v3_statuses.sql`, journal entry `idx 7` in `drizzle/meta/_journal.json` (hand-written; keep `drizzle/meta` snapshots consistent by running `npx drizzle-kit generate` afterwards and confirming it reports no changes)
- Create: `src/lib/legacy.ts`
- Modify: `src/lib/db/schema.ts` (status enums), `src/lib/tasks.ts:11`, `src/lib/projects.ts:10,108`, `src/lib/lifecycle.ts` (apply normalizer where snapshots are read for undo/restore), `src/components/project-board.tsx:15,72`, `src/components/project-form.tsx:12,45`, `src/components/task-board.tsx`, `src/components/task-form.tsx`, `src/components/task-panel.tsx`, `src/components/command-palette.tsx`, `src/app/(workspace)/page.tsx`
- Test: `tests/integration/v3-upgrade.test.ts`, `tests/unit/legacy.test.ts`

**Interfaces:**
- Produces: `normalizeTaskStatus(s: string): "To do" | "Doing" | "Done"`, `normalizeProjectStatus(s: string): "Planned" | "Active" | "Paused" | "Done"`, `normalizeSnapshot(s: Snapshot): Snapshot` in `src/lib/legacy.ts`. The exported `taskStatuses` and `projectStatuses` keep their names with the new values.

- [ ] **Step 1: Unit test.** `legacy.test.ts`: every mapping pair in Global Constraints, plus `normalizeSnapshot` on a task snapshot `{status:"Blocked"}` → `"Doing"` and on a project snapshot `{status:"Completed"}` → `"Done"`. Unknown entity types pass through unchanged.
- [ ] **Step 2: Upgrade test**, following the `phase12-upgrade.test.ts` pattern. Create tasks in each legacy status and a project, then roll the schema back to the 0006 boundary: delete the last `__drizzle_migrations` row and write the legacy statuses with raw SQL, including inside `activity.before_state`. Then `migrate()`. Assert: (a) rows mapped per the table; (b) `integrity_check` is `ok` and `foreign_key_check` is `[]`; (c) `undoOperation` on an operation whose before-state says `"In Progress"` restores `"Doing"` (Review Focus 1); (d) the default for a new task is `"To do"`.
- [ ] **Step 3:** Run `npx vitest run tests/unit/legacy.test.ts tests/integration/v3-upgrade.test.ts`. Expect FAIL.
- [ ] **Step 4:** Write `0007_v3_statuses.sql`: two `UPDATE … SET status = CASE …` statements implementing the mapping (task, project). No change to activity JSON in SQL; it's normalized at read time.
- [ ] **Step 5:** Implement `src/lib/legacy.ts`, update the enums and status constants, call `normalizeSnapshot` in `lifecycle.ts` wherever stored snapshots are compared or re-applied, and replace status strings in the listed components. Inline the project completion check as `status === "Done"`.
- [ ] **Step 6:** Run the two tests plus `npx vitest run` and `npm run typecheck`. Expect PASS. Fix existing tests that assert old status names by changing only the names.
- [ ] **Step 7:** Commit `feat(v3): three task statuses, project Done, legacy snapshot normalization`.

### Task 3: Planned dates become linked events

**Files:**
- Create: `drizzle/0008_v3_planned_to_events.sql` and journal entry `idx 8`
- Modify: `src/lib/tasks.ts` (remove `plannedDate` from the Zod `fields`/`createSchema`; keep the column, marked dormant), `src/lib/workbench.ts` (`homeData`: "planned today" = non-deleted events with `taskId` whose all-day date or start falls on today in the user's timezone), `src/components/quick-capture.tsx` (remove the planned-date field), `src/components/manual-calendar.tsx` (remove the "Planned work" category and legend entry), `src/components/task-form.tsx`, `src/components/task-panel.tsx`, `src/components/task-board.tsx`
- Test: `tests/integration/v3-upgrade.test.ts` (extend), `tests/integration/workbench.test.ts` (update)

**Interfaces:**
- Consumes: the Task 2 migration (0007) has run first.
- Produces: `homeData()` keeps its return shape. `WorkItem.dateKind` stays `"deadline" | "planned" | null`, where "planned" now comes from linked events.

- [ ] **Step 1: Test.** Extend the upgrade test. Before migrating, seed (i) a live task with `planned_date='2026-11-20'`; (ii) a soft-deleted task with a planned date; (iii) a live task with `planned_date='2026-11-21'` that already has a linked all-day event starting `2026-11-21`. After `migrate()`, assert:
  - (i) has exactly one event: `allDay=1`, `start='2026-11-20'`, `end='2026-11-21'`, `taskId` set, `projectId` NULL, the title equals the task title, timezone is the owner's preference (or `Asia/Jakarta` if none), and the id matches `z.uuid()`;
  - (ii) has no event (Review Focus 3);
  - (iii) still has exactly one event (Review Focus 2);
  - every task's `planned_date` is NULL.
- [ ] **Step 2: Test.** In `workbench.test.ts`, a task with a linked all-day event today shows on Today's list as planned. A task with a linked event tomorrow does not.
- [ ] **Step 3:** Run them. Expect FAIL.
- [ ] **Step 4:** Write `0008_v3_planned_to_events.sql`: one `INSERT INTO event (...) SELECT ... FROM task WHERE planned_date IS NOT NULL AND deleted_at IS NULL AND NOT EXISTS (linked all-day event on that date)`, followed by `UPDATE task SET planned_date = NULL`. For the id, generate a v4 UUID in SQL:
  ```sql
  lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+abs(random())%4,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ```
  `end = date(planned_date,'+1 day')`, `timezone = COALESCE((SELECT timezone FROM preferences p WHERE p.user_id = task.owner_id),'Asia/Jakarta')`, and `created_at` and `updated_at` = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`.
- [ ] **Step 5:** Make the code changes listed under Files.
- [ ] **Step 6:** Run `npx vitest run` and `npm run typecheck`. Expect PASS.
- [ ] **Step 7:** Commit `feat(v3): planned dates migrate to task-linked events`.

### Task 4: Remove v2 surfaces

**Files:**
- Delete: `src/app/(workspace)/chat/`, `src/app/(workspace)/history/`, `src/components/history-list.tsx`, `src/components/check-ins.tsx`, `src/components/task-dependencies.tsx`, `src/components/priority-matrix.tsx`, `src/lib/priority.ts`, `src/app/api/check-ins/`, `src/app/api/dependencies/`, and `src/lib/check-ins.ts` / `src/lib/dependencies.ts` **only if** nothing outside the deleted routes imports them (lifecycle code that reads old snapshots stays)
- Keep: `src/app/api/history/[operationId]/undo` and `/restore` (Undo toasts), the `/inbox` route (until Phase 2), `/settings`
- Modify: `src/components/navigation.tsx` (links = Today, Projects, Calendar; Settings moves into `auth-controls.tsx`'s account menu), `src/components/command-palette.tsx:61` (quick-nav = Today, Projects, Calendar, Settings), `src/components/task-panel.tsx`, `src/components/task-form.tsx` (remove the priority, urgent, estimate and blocker-reason inputs and the check-in and dependency sections; keep title, notes, project, status, important, due date), `src/app/(workspace)/page.tsx` (remove the matrix and priority UI), `src/app/(workspace)/projects/[projectId]/page.tsx` (remove check-ins), `src/app/globals.css` (delete now-unused selectors), `next.config.ts` (redirects `/history`→`/` and `/chat`→`/`, non-permanent)
- Test: delete `tests/e2e/phase12.spec.ts` and `tests/e2e/recovery.spec.ts` (undo/restore stay covered by `tests/integration/recovery.test.ts`); update `tests/e2e/shell.spec.ts`; edit `tests/e2e/phase13.spec.ts` to remove planned-date and matrix steps

- [ ] **Step 1: Test.** In `shell.spec.ts`: the navigation has exactly the links Today, Projects and Calendar; Settings opens from the account menu; `GET /history` and `/chat` land on `/` (Review Focus 4); opening a search result for a loose task opens its panel (Review Focus 5).
- [ ] **Step 2:** Run `npx playwright test tests/e2e/shell.spec.ts`. Expect FAIL.
- [ ] **Step 3:** Make the deletions and modifications. Then `grep -rE "check-ins|dependenc|priority-matrix|/history\"|/chat\"" src` should show only lifecycle snapshot handling and the undo/restore API.
- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npx vitest run && npx playwright test`. Expect all PASS.
- [ ] **Step 5:** Commit `feat(v3): three-screen navigation; remove chat, history, check-ins, dependencies, priority matrix`.

### Task 5: Integrated verification and upgrade rehearsal

**Files:**
- Modify: `docs/Phase 0 Progress.md`

- [ ] **Step 1:** Run `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` and `npx playwright test`. All pass. Record the exact counts in the progress file.
- [ ] **Step 2: Upgrade rehearsal on a copy.** Make a SQLite-consistent backup of `data/relay.db` with the better-sqlite3 `.backup()` API to `%TEMP%/relay-rehearsal.db`. Run `DATABASE_URL=<that path> npm run db:migrate`. Check `integrity_check`, `foreign_key_check`, row counts of project, task and event before and after (events increase by exactly the number of live planned-date tasks), and that no task has a status outside the v3 set. **Never write to `data/relay.db`.**
- [ ] **Step 3:** Start `npm run dev` against the rehearsal copy and screenshot Today, Projects and Calendar at 1440×900 into `docs/phase0-screens/`.
- [ ] **Step 4:** Write the progress file: commits, checks, rehearsal numbers, screenshots, and known gaps (the visual design is unchanged until Phase 1). The exact next action is "user approves migrating the real `data/relay.db`".
- [ ] **Step 5:** Commit `chore(v3): Phase 0 verification record`. Stop and report. Do not migrate the real DB and do not start Phase 1.
