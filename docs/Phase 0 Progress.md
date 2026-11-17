# Relay v3 Phase 0 (Cut): Progress

Branch `v3/phase-0-cut`, base `main` @ `691c3bb`. Status: implementation and verification complete. The real `data/relay.db` has **not** been migrated.

## Commits (`git log 691c3bb..HEAD`)

- `12e17f3` docs: adopt Relay PRD v3 and Phase 0 plan
- `19c328c` feat(v3): three task statuses, project Done, legacy snapshot normalization
- `7d3e866` fix(v3): record status default in drizzle snapshot
- `befe833` feat(v3): planned dates migrate to task-linked events
- `dbf97f6` feat(v3): three-screen navigation; remove chat, history, check-ins, dependencies, priority matrix
- `6afcf08` fix(v3): match legacy create replay hashes; drop history list API
- (this record) chore(v3): Phase 0 verification record

## Checks (run 2026-11-17 on HEAD 6afcf08)

| Check | Result |
|---|---|
| `npm run typecheck` | pass, 0 errors |
| `npm run lint` | pass, 0 problems |
| `npx vitest run` | 13 files, 83 tests passed, 0 failed |
| `npm run build` | pass |
| `npx playwright test` | 106 passed, 10 skipped, 0 failed (11.6 min). The flaky desktop calendar drag test passed on the first run this time. |

## Upgrade rehearsal (on a copy only)

The controller made a read-only `.backup()` of `data/relay.db` to `%TEMP%/relay-rehearsal.db`. Then `DATABASE_URL=<copy> npm run db:migrate` ran from the worktree, which has no `.env`. Result: "SQLite migrations applied."

| Measure | Before | After |
|---|---|---|
| integrity_check | ok | ok |
| foreign_key_check | [] | [] |
| applied migrations | 7 (0000–0006) | 9 (0000–0008) |
| project | 2 (both Planned; 1 soft-deleted) | 2 (both Planned) |
| task | 0 | 0 |
| event | 0 | 0 (+0 = 0 live planned tasks before) |
| activity | 5 | 5 |
| check_in / dependency | 0 / 0 | 0 / 0 |
| tasks with planned_date NOT NULL | 0 | 0 |
| tasks / projects outside v3 status sets | n/a | 0 / 0 |

The session count on the copy went from 1 to 2 afterwards. The extra session was created only for the screenshots.

## Screenshots

These were taken with `next dev` on port 3200 against the migrated copy, at 1440×900 in Chromium, signed in as the copy's single user. The session was made with better-auth `testUtils` on the copy, the same mechanism as `tests/support/auth.ts`.

- `docs/phase0-screens/today.png`
- `docs/phase0-screens/projects.png`
- `docs/phase0-screens/calendar.png`

All three show the real pages: the three-item navigation, the account control, and the project deadline on 21 Nov. None shows a login or error page.

## Decisions and rulings

- **A:** 0007/0008 UPDATEs do not bump `revision` or `updated_at`, so pre-v3 Undo comparisons still match.
- **B:** `normalizeSnapshot` sets task `plannedDate` to null, which matches the nulled, dormant column.
- **C + user clarification:** the only access to `data/relay.db` is a read-only `.backup()` into `%TEMP%`. All other work runs on the copy.
- **D:** the rehearsal dev server uses command-line test env, never `.env`. The session exists only in the copy.
- **E:** the physical `task.status` column default stays `'Backlog'`, because a table rebuild is forbidden. `schema.ts` and the snapshot say `'To do'`, and app inserts always set the status.
- **F:** a task soft-deleted before v3 comes back without its planned date when restored. The value survives in the activity JSON and in the backup. Flagged for Joshua.

## Deviations from the plan

- Work happened in a T3 worktree instead of the main checkout. The controller made the backup, not the Task 5 worker.
- `dependencies.ts` was kept because `lifecycle.ts` still uses `assertNoCycle`.
- `GET /api/history` was removed, and the legacy create-replay hashes were matched to `main` (Task 4 fix round).

## Deferred minor findings

- `normalizeSnapshot` throws on an unknown legacy value, which returns a 500.
- Home calendar "Capture on <date>" has no visible effect for tasks (Phase 1).
- Tabs opened before the upgrade that send `plannedDate: null` get a 400 until reloaded.
- Search by date uses each timed event's own time zone, not the user's.
- A pre-v3 task create whose planned date became an event can't be undone, because the linked event blocks it.
- Task JSON responses still carry dormant fields.
- `completionSchema` rejects a pre-deploy preview that has `warnings` (400 instead of 409).
- The desktop calendar drag e2e test is flaky.
- The shell.spec screenshot was dropped.
- `DESIGN.md` has stale Phase 1.2 wording.
- The workbench search status enum duplicates "Done".

## Known gaps

- The visual design is unchanged until Phase 1. This phase only removes UI.
- The real DB has 0 tasks, so the rehearsal could not exercise the planned-date→event conversion on real rows. `tests/integration/v3-upgrade.test.ts` covers that path.
- The physical `task.status` default stays `'Backlog'` (Ruling E).

## Whole-branch review

Pending (controller).

## Exact next action

User approves migrating the real `data/relay.db`.
