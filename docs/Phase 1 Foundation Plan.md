# Phase 1 Foundation Implementation Plan

> **For the implementing agent:** Use `superpowers:executing-plans` for sequential single-agent implementation and separate self-review passes, subject to the scope and safety rules below. Do not delegate or create an extra worktree/Git repository. Steps use checkboxes for tracking. This document is a proposal, not permission to execute it.

**Goal:** Deliver a working, persistent, responsive manual task-management application before implementing AI or revisiting individual page designs.

**Architecture:** Next.js modular monolith, SQLite, Drizzle, and Better Auth with Google OAuth. Server-owned business rules serve ordinary UI actions now and can be called by controlled AI actions later; do not build the AI layer or speculative extension machinery in this phase.

**Tech Stack:** The PRD stack, using only packages needed for this phase. In particular: Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Radix, lucide-react, Motion, dnd-kit, FullCalendar v7, Drizzle, a compatible SQLite driver, Better Auth, Zod, date-fns, Sonner, Vitest, and Playwright. Use TanStack Query and React Hook Form only where their specified roles are needed.

**Spec:** [PRD.md](./PRD.md), version 2.4, plus the user's subsequent instruction to deliver UI, routing, and manual CRUD in the first pass.

**Status:** Packages 1-6 and separate whole-phase self-QA accepted; all seven final commands passed. Live Google sign-in awaits user setup. Phase 1 execution is complete; stop here.

**Revision:** The user replaced the earlier multi-agent architecture with one session performing implementation, research, self-review, and self-QA sequentially. No delegation/model-capability gate remains. Google Cloud setup is a final user handoff, not an overnight-development prerequisite.

## 1. What This Phase Means

This is the first working foundation, not a wireframe and not the entire MVP release.

- Build the actual UI, navigation, forms, database, authentication, and manual workflows.
- All main navigation destinations exist. All in-scope buttons perform real operations.
- Use a consistent, readable baseline design that satisfies the PRD. Detailed page-by-page design changes come later; responsiveness and accessibility do not wait.
- Include the manual Calendar/Event work and manual utilities originally distributed across later PRD phases. This plan changes milestone ordering, not final product requirements.
- AI implementation and page-specific refinement are later work. They must not be silently added while developing this foundation.

### Included

| Area | Phase 1 deliverable |
| --- | --- |
| Identity | Complete Google/Better Auth integration, working sessions, logout, protected pages/API routes, owner isolation, and an isolated authenticated test setup; real Google consent is verified after the user finishes Cloud setup |
| Shell | Desktop navigation, mobile navigation, route loading/error/not-found states, shared detail panels and dialogs |
| Home | Database-backed active projects/progress, overdue tasks, upcoming deadlines/events, recently updated work, manual quick capture |
| Projects | Create/read/update, Kanban status changes and ordering, search/filter, project detail page, archive/unarchive, confirmed cascade soft deletion and restoration |
| Tasks/Inbox | Create/read/update, list/Kanban, status and priority, date/time, estimates, blockers, reopening, ordering, moving between projects, unassigned Inbox, shared details |
| Calendar/Events | Month/week/day/agenda, all three record types/colors, filters/legend, event CRUD, all-day/timezone rules, appropriate drag-to-reschedule |
| Manual progress | Check-in entry/history on the selected task/project, without any AI interpretation |
| Manual utilities | Task dependencies with cycle protection, Focus Mode, global search, command palette, activity history, safe Undo and restoration |
| Settings | Persisted timezone, week start, and relevant existing PRD preferences; account/logout controls |
| AI destinations | Chat route and contextual-panel entry exist, but clearly explain that AI is not implemented in this phase; no working-looking send control or fabricated conversation |
| Reliability | Validated inputs, secure server boundaries, cross-view updates, empty/loading/error states, keyboard/touch alternatives, tests and separate self-QA |

### Explicitly Deferred

- Provider/model configuration, API keys, connection testing, chat streaming, conversations/messages, tools, AI proposals, and execution/approval UI.
- AI Next Up, next-action suggestions, recovery assessments/plans, natural-language organization, duplicate suggestions, and Plan My Day.
- AI bulk-operation snapshots. Manual Undo must already preserve its own affected before/after states; do not build a separate AI snapshot system now.
- Individual page redesigns and advanced visual refinements beyond the usable baseline.
- VPS deployment, Cloudflare configuration, backup scheduling, and production secret provisioning.
- Public registration features, integrations, background agents, and every other PRD non-goal.

Deferred items remain required for the eventual MVP where the PRD says so. Finishing Phase 1 is not permission to declare the complete product finished.

## 2. Global Constraints

- SQLite is final. Do not substitute PostgreSQL.
- Use a dark theme throughout, including login, calendar, dialogs, and every UI state. Define shared dark tokens, maintain accessible contrast/focus, and avoid a light flash on first paint. No light theme or theme switcher is required.
- Application login uses Google OAuth + Better Auth. Cloudflare email restrictions are user-managed; do not add another app-level email allowlist.
- Every database request uses the authenticated owner. Never accept an owner ID from browser input as authority.
- Projects: Planned, Active, Paused, Completed. Tasks: Backlog, Next, In Progress, Blocked, Done. Priorities: Low, Medium, High.
- Completing a task or saving a check-in must not invoke AI, generate suggestions, or create another task.
- Without a configured model, chat and AI recommendations/planning are unavailable; manual management still works. Do not build a non-AI recommendation engine.
- Ordinary Add Task saves exactly the title entered. Do not split text or deduplicate titles without the user requesting AI assistance.
- Deleting a parent soft-deletes its children only after a preview and confirmation. Task dependencies are references, not ownership of the referenced task.
- Independent events survive unrelated project/task deletion. Linked child events and check-ins follow their parent's confirmed cascade.
- Undo/restore must not overwrite later changes or restore records deleted independently before the selected operation.
- Default timezone: Asia/Jakarta. Default week start: Monday. Both are configurable.
- Project deadlines are date-only; task deadlines may be date-only or timed. Date-only values must not shift across timezones.
- Calendar colors: project deadline `#8B5CF6`, task deadline `#F59E0B`, event `#3B82F6`, with accessible indicators beyond color.
- Effort estimates are positive whole minutes. Entering Done sets completion time; reopening clears it and preserves history.
- Project completion warns about unfinished tasks but does not silently complete them. Dependencies warn rather than hard-blocking ordinary status changes; self-links and cycles are invalid.
- No fake production data, fake provider success, production auth bypass, placeholder actions, unnecessary infrastructure, or duplicate business rules.
- Do not block unattended development on Google Cloud setup or ask the sleeping user to log in. Finish the integration and automated authenticated tests, then provide exact setup instructions and mark the live Google smoke test as pending.
- Create `.env.example` and the final setup guide. Do not overwrite a real `.env`, commit secrets, invent Google credentials, or present generated test secrets as production configuration.
- Do not install AI packages or create AI entity tables just to prepare for later work.
- Follow Impeccable and Vercel React Best Practices. Record product truth in `PRODUCT.md` and the shared visual baseline in `DESIGN.md` before substantial UI work.
- No deployment, pushes, PRs, destructive data operations, or automatic continuation into another phase is authorized by this plan.

## 3. Single-Agent Execution

### Execution Ownership

- The current session owns requirements, implementation, focused research, integration, review, and QA. Record the actual runtime model/effort when available; separate model routing is not required.
- Execute all six packages sequentially in the existing workspace. Do not spawn subagents, use `delegate_task`, start other agent threads, or substitute Workflow/CLI orchestration.
- Do not call or wait for `orchestrator_capabilities` or other delegation tools. The earlier model/delegation gate is explicitly superseded, even where historical ledger entries describe it as mandatory.
- Follow `superpowers:executing-plans` without its optional delegation or extra workspace/reporting machinery. This plan's no-Git/no-extra-worktree rules and single ledger take precedence.
- Research only a concrete uncertainty, using version-matched official documentation and installed API evidence. Do it in this session; skip it when the answer is already known.

### Separate Review Passes

- After each package's checks, stop product-code edits and review its stable revision against the relevant requirements and connected code. Test commands may write normal isolated test artifacts.
- Record findings before returning to implementation. Fix them directly, add regression tests, re-run affected checks, then self-recheck the new revision.
- After all six packages pass, perform a separate whole-phase self-QA pass over integrated workflows, not just the last change.
- These are author self-reviews, not independent reviews or fresh contexts. State that limitation in the ledger and final report. The user has authorized this tradeoff; do not wait for an unavailable independent reviewer or weaken functional/security/test gates.
- Do not implement an orchestration system inside Relay.

### Package Evidence and Checkpoints

At each package start, re-read:

1. Its work-package text and relevant PRD requirements.
2. Exact files it owns and the existing interfaces it must use.
3. Acceptance cases, test commands, and the current tested revision.
4. Known findings and decisions in its scope.

Record changed files, decisions, exact commands/results, unresolved failures, and missing external setup. Research notes cite official sources and installed-version evidence. Self-review records separate spec-compliance and quality `PASS` or `REVISE` verdicts, findings ordered by severity, file/line references, and a reproducible scenario for each defect.

Maintain the existing single ledger at `docs/Phase 1 Progress.md`. After each verified step and before context handoff, record the current package, tested revision/file hashes, commands/results, self-review findings/fixes/rechecks, decisions, pending checks, exact next action, and any running command/session. Preserve historical evidence; mark superseded blockers rather than treating them as current gates. Do not generate a hierarchy of reporting frameworks.

On goal continuation or context recovery, re-read the goal prompt, plan, and ledger, revalidate the workspace, and resume the next unfinished action. Do not repeat completed work or delegation discovery. Unexpected user changes require a stop to resolve them. Minor technical decisions may be recorded and implemented; material product/safety changes still require user input.

Continue without routine approval pauses while the host runs/resumes the goal. Checkpoints support recovery, not automatic restart after host shutdown. If interrupted, record incomplete work honestly; do not claim a background run persists after execution stops.

## 4. The Development / QA Loop

For each work package:

1. **Scope:** Re-read the bounded package requirements, interfaces, acceptance checks, and ledger.
2. **Research when needed:** Answer a narrowly scoped API/code question using official/version-matched evidence; skip this step when the answer is already known.
3. **Develop:** Add a test for behavior, observe the expected failing assertion, write the smallest working implementation, then re-run the test. A missing framework import is not useful proof of the behavior.
4. **Verify:** Run the relevant Vitest/Playwright checks, typecheck, lint, and any required build; record actual output, not merely "tested."
5. **Self-review:** In a separate pass, re-read requirements and inspect the stable package change, connected code, and evidence for spec compliance and quality. Run targeted additional checks where evidence is insufficient instead of blindly repeating every command.
6. **Revise:** Record findings first, then fix them directly and add regression tests.
7. **Self-recheck:** Verify fixes on the new revision. Re-run affected tests after every edit; old passing output never validates a new change.
8. **Accept:** Mark the package complete only when its acceptance checks pass and both self-review verdicts are clear.
9. **Integrate:** Run the accumulated regression suite before starting the dependent package.

After all packages, run a separate whole-phase self-QA pass, revise findings using the same rules, and repeat the final verification on the final revision. Label all review evidence as self-review/self-QA, not independent review.

**Bound the loop:** After three revision rounds on one package, or two rounds with the same unresolved root cause, stop repeating the approach. Report the issue and propose a smaller technical approach or a scope clarification. Do not silently waive blocking defects or claim completion. Material product changes, destructive actions, and genuine implementation/tooling blockers are explicit handoff conditions; unavailable delegation tools are not. Missing Google credentials are expected deferred setup, not a reason to stop the rest of Phase 1.

**Acceptance rule:** No unresolved critical/high defects, data-loss defects, security defects, broken in-scope workflows, or required accessibility failures. Small non-blocking observations may be recorded, but no PRD requirement can be waived by labeling it "polish."

## 5. Starting State and File Boundaries

Observed when this plan was written: the workspace contains documentation only, no application or package manifest, and no Git repository. Local Node is `v22.22.2`; npm is `10.8.1`. These are observations, not dependency compatibility guarantees.

At execution, recheck the workspace before editing. Preserve any new user work. Do not initialize Git, commit, branch, or push without authorization; if Git is available later, review the full package base-to-head range. Otherwise keep a before/after file manifest and exact revision hashes for the changed files.

Use these initial boundaries, adding files only when the implementation needs them:

| Files / directory | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, Next/TypeScript/lint/Vitest/Playwright config | Runtime, scripts, locked dependencies, test harness |
| `.env.example`, `.gitignore` | Document required variables; exclude secrets, SQLite files, and test artifacts |
| `docs/Phase 1 Setup.md` | Final Google Cloud links/redirects, environment-variable checklist, start/migrate commands, and the remaining live-login check |
| `PRODUCT.md`, `DESIGN.md` | Concise product constraints and shared design tokens/patterns |
| `src/app/(auth)/login/page.tsx` | Actual Google sign-in entry |
| `src/app/(workspace)/layout.tsx` | Authenticated shell and responsive navigation |
| `src/app/(workspace)/page.tsx` | Home |
| `src/app/(workspace)/projects/page.tsx`, `projects/[projectId]/page.tsx` | Project board and detail route |
| `src/app/(workspace)/inbox/page.tsx` | Unassigned tasks |
| `src/app/(workspace)/calendar/page.tsx` | Unified manual calendar |
| `src/app/(workspace)/chat/page.tsx` | Explicit AI-unavailable state, without a simulated chat |
| `src/app/(workspace)/settings/page.tsx` | Working preferences/account controls |
| `src/app/(workspace)/history/page.tsx` | Activity, Undo, and deleted-record restoration; link through the shell without inventing another main product area |
| `src/app/api/auth/[...all]/route.ts` | Better Auth endpoint |
| `src/app/api/{projects,tasks,events,check-ins,dependencies,history,preferences}/.../route.ts` | Validated authenticated HTTP boundary; thin handlers, no duplicated domain logic |
| `src/lib/db/{index,schema}.ts`, `drizzle/` | Server-only SQLite connection, current schemas, committed migrations |
| `src/lib/auth.ts` | Better Auth setup and server-side identity resolution |
| `src/lib/{projects,tasks,events,check-ins,dependencies,activity,lifecycle}.ts` | Domain behavior, validation, history, confirmed deletion and conflict-safe recovery |
| `src/components/` | Shared shell, forms, boards/lists, calendar wrapper, details, and command palette; domain components only as needed |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Pure rules, real temporary SQLite behavior, and real browser flows |
| `tests/support/auth.ts`, `tests/e2e/auth.setup.ts` | Test-only user/session creation and browser cookies against an isolated test database; never imported by application routes |

Do not scaffold every listed file before its task. Do not create generic repositories, command buses, plugin registries, agent frameworks, global data stores, or per-entity abstraction layers.

Use URL-backed selection for shared details/Focus Mode (`?task=<id>`, `?event=<id>`, `?focus=<taskId>` on the owning workspace page). Refresh and direct links must reopen the selected owned record; missing/deleted/foreign IDs show a safe not-found state, not leaked data or a broken shell.

### Shared Contracts

- A server identity helper `requireUserId(): Promise<string>` resolves the session; unauthenticated access is rejected. Routes never trust a submitted `ownerId`.
- Domain create operations take `(userId, validatedInput)`. Updates take `(userId, id, expectedRevision, validatedInput)`. Deletes use the lifecycle preview/confirmation path, not arbitrary SQL in handlers.
- `previewDeletion(userId, entityType, id)` computes all currently affected record IDs/revisions. `confirmDeletion(userId, preview)` recomputes and compares that set inside the transaction; changed membership or revisions returns a conflict without writes.
- `undoOperation(userId, operationId)` and `restoreDeletion(userId, operationId)` verify current records against the original operation's resulting state before restoring its affected records.
- Manual mutations write activity before/after state and group related changes under one operation ID in the same transaction. This supports manual Undo without creating an additional AI snapshot system.
- Request validation failures produce field-level errors; absent/foreign records are not exposed; stale revision/preview/Undo conflicts return HTTP `409` with an actionable message.
- Use serialized date-only strings and explicit timed representations consistently across services and HTTP. Never derive date-only values by converting local midnight to UTC.

These are small application functions, not a generic execution framework. Define concrete types from the schema and record them before a dependent package starts.

## 6. Work Packages

### Package 1 - Runnable Shell, Identity, Database, and Preferences

**Execution:** Current session; separate self-review after verification.

**Files:** Runtime/config files, `.env.example`; `PRODUCT.md`, `DESIGN.md`; `src/lib/db/*`, `src/lib/auth.ts`; auth route/login; workspace layout, initial route pages; preferences route/settings; `tests/support/auth.ts`, `tests/e2e/auth.setup.ts`, `tests/integration/auth.test.ts`, `preferences.test.ts`, `tests/e2e/shell.spec.ts`.

**Produces:** A runnable app, migrated SQLite, real session enforcement, persisted preferences, and the shared responsive UI baseline.

- [x] Recheck files and dependency/runtime compatibility against version-matched official docs. Prefer native `node:sqlite` if the supported Drizzle/runtime combination supports it; otherwise use a supported SQLite driver and record why. Never substitute PostgreSQL.
- [x] Create only necessary scaffold/config files. Add npm scripts `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `test:e2e`, and `db:migrate`.
- [x] Capture the already agreed product facts in `PRODUCT.md`; use the PRD's calm, minimal, readable direction for `DESIGN.md`, not a new page-design interview or an unsolicited rebrand.
- [x] Set the dark theme at the root from first paint and use shared tokens across the shell and components; verify login/dialog states and refresh do not flash a light theme.
- [x] Add failing integration cases: no session cannot read/mutate workspace data; user B cannot use user A's session/records; timezone/week-start updates survive a fresh database connection.
- [x] Implement Better Auth Google sessions and migrations, `requireUserId()`, working preferences, the login page, logout, and protected shell.
- [x] Create the commented `.env.example` described in Section 10. With missing Google keys, show an actionable setup state and refuse Google sign-in without bypassing workspace authentication; tests use real local test sessions.
- [x] Implement the isolated test-session setup in Section 8 so browser/integration tests can run unattended without Google login. Test anonymous denial, expired/invalid cookies, cross-owner access, and absence of a test-login HTTP route in the ordinary app.
- [x] Add all main routes, real navigation, loading/error/not-found boundaries, and an honest unavailable Chat state. Shell-only pages are intermediate work, not accepted final CRUD pages.
- [x] Run typecheck, lint, relevant tests, shell navigation tests, and build. Self-review checks server enforcement, not just hidden links.

**External setup:** Build the complete provider integration now, but defer the user's Google project/client creation to the final setup guide. Do not request Google credentials during the unattended run. An isolated local session is valid evidence for application auth/CRUD tests, not proof of live Google consent or callback success. Phase 1 implementation and automated QA can finish with that external smoke test explicitly pending.

### Package 2 - Projects and the Mutation/History Foundation

**Execution:** Current session; separate self-review after verification. **Depends on:** Package 1.

**Files:** Project schema/migration; `src/lib/{projects,activity,lifecycle}.ts`; project API routes; Projects/detail pages and components; `tests/integration/projects.test.ts`, `tests/e2e/projects.spec.ts`.

**Consumes:** Session identity, SQLite, tokens/shell. **Produces:** Real project CRUD, revision checks, audit operation IDs, archive and soft-delete foundations.

- [x] Add failing cases: empty name rejected; foreign-owner access denied; create/update/status/order persist; outdated revision changes nothing; empty project progress is `0%`; archive/unarchive preserves status.
- [x] Implement project operations and their activity records atomically. Use real revisions and explicit transactional deletion previews; extend cascade membership in subsequent packages as child entities are introduced.
- [x] Build the project Kanban, create/edit forms, filtering, status changes, ordering, archive/unarchive, detail links, and deletion preview/confirmation.
- [x] Provide keyboard and menu/form alternatives to dragging. Show failed saves without losing the user's form input.
- [x] Run project integration/browser checks, typecheck, and lint; check refresh and navigation back to the same record.
- [x] Review and revise before task work starts. Do not claim final cascade coverage before all child entities exist.

### Package 3 - Tasks, Inbox, and Project Task Views

**Execution:** Current session; separate self-review after verification. **Depends on:** Package 2.

**Files:** Task schema/migration; `src/lib/tasks.ts`, existing project/activity/lifecycle modules; task API routes; Inbox, project task views, shared task panel/forms; `tests/integration/tasks.test.ts`, `tests/e2e/tasks.spec.ts`.

**Consumes:** Projects, owner checks, activity/revision rules. **Produces:** Full persisted task workflows shared by Inbox, projects, and later calendar/focus views.

- [x] Add failing cases: task with/without project; cross-owner project rejected; valid status/priority; positive integer estimate; date-only/timed deadline validation; Done/reopen timestamps; stale edit; reordering and project reassignment.
- [x] Implement task CRUD, project progress from eligible tasks, blocker reason, list/Kanban ordering, and atomic history. Extend parent deletion previews to tasks without deleting dependent-but-independent tasks.
- [x] Implement manual Add Task exactly as entered, Inbox, project list/Kanban, shared detail panel, editing, reopening, moving, and deletion confirmation.
- [x] Test that archiving a project hides its tasks from active work without changing their statuses, and project completion does not complete unfinished tasks.
- [x] Assert that marking Done performs no model request and creates no extra task.
- [x] Test direct task links, refreshing an open task panel, and missing/deleted/foreign selections.
- [x] Run task/project regressions, browser CRUD flows, typecheck, lint; self-review completion/reopening and project-switch invalidation in a separate pass.

### Package 4 - Events and Unified Manual Calendar

**Execution:** Current session; separate self-review after verification. **Depends on:** Package 3.

**Files:** Event schema/migration; `src/lib/events.ts`, existing lifecycle/activity modules; event API routes; Calendar page/wrapper and event form; `tests/unit/dates.test.ts`, `tests/integration/events.test.ts`, `tests/e2e/calendar.spec.ts`.

**Consumes:** Projects/tasks and deadline data. **Produces:** Real event CRUD plus unified date-correct rendering and rescheduling.

- [x] Add failing cases: end before start; invalid timezone; all-day exclusive end; date-only deadlines stable in Asia/Jakarta and another timezone; timed-event movement preserves duration; task/project link ownership; invalid linked project/task combinations.
- [x] Install the compatible FullCalendar v7 package/imports and temporal polyfill only after checking the actual version docs. Do not mix v6 plugins.
- [x] Implement independent/linked events, event forms/details, and month/week/day/agenda views with the PRD's three colors, text/icon distinctions, legend, and filters.
- [x] Implement appropriate drag-rescheduling and equivalent accessible edit controls. Failed saves must restore the displayed persisted dates and report the error.
- [x] Extend cascade membership to linked events. Test project/task deletion removes their linked child events, while unrelated independent events survive.
- [x] Run date/event integration checks, calendar browser flows, prior package regressions, typecheck, lint, and build.

### Package 5 - Manual Workbench: Check-ins, Dependencies, Focus, Home, and Search

**Execution:** Current session; separate self-review after verification. **Depends on:** Package 4.

**Files:** Check-in/dependency schema/migration; `src/lib/{check-ins,dependencies}.ts`; corresponding routes; Home, project/task detail extensions, Focus Mode and command palette; `tests/integration/workbench.test.ts`, `tests/e2e/workbench.spec.ts`.

**Consumes:** Actual projects/tasks/events, preferences, and shared detail UI. **Produces:** Useful everyday manual workflows across the app, not just isolated entity pages.

- [x] Add failing cases: check-in requires an owned task/project and survives page reload; task-project association is derived; dependency self-link/cycle/cross-owner rejected; completion despite a dependency warns but does not silently change other statuses.
- [x] Implement explicit manual check-ins/history, dependency warnings/editing, and Focus Mode with one selected task, context, and a working check-in input.
- [x] Finish Home with real active projects/progress, overdue work, upcoming commitments, recent changes, and exact-text quick capture. An unavailable Next Up/recovery/AI action is clearly explained; no silent AI calls or substitute recommendation algorithm.
- [x] Implement owner-scoped global project/task search, status/priority/project/date filters, and `Ctrl/Cmd+K` capture/search/navigation using existing services.
- [x] Confirm that creating, updating, moving, completing, or rescheduling a record updates Home, relevant project/task views, calendar, and search without a full reload.
- [x] Test native keyboard/touch alternatives, dialog focus/escape behavior, narrow-screen usability, validation/error states, and the no-AI-call invariant.
- [x] Run workbench and accumulated regressions, typecheck/lint; self-review shared-view consistency and the absence of unsolicited AI behavior in a separate pass.

### Package 6 - Complete Recovery, Undo, and Whole-App Hardening

**Execution:** Current session; separate self-review after verification. **Depends on:** Package 5.

**Files:** Existing activity/lifecycle services, history routes/page, Undo affordances across mutation UI; relevant modules requiring fixes; `tests/integration/recovery.test.ts`, `tests/e2e/recovery.spec.ts`, `tests/e2e/foundation.spec.ts`; `.env.example`, `docs/Phase 1 Setup.md`, execution ledger.

**Consumes:** All persisted domain entities and operation history. **Produces:** A safe, coherent foundation ready for final QA.

- [x] Add failing cases: Undo create/edit/move/reorder/reschedule/archive/soft-delete; history persists after refresh/restart; stale Undo leaves all records unchanged; create-Undo refuses to erase later children.
- [x] Test full cascade/restore with tasks, events, check-ins, dependency references, independently deleted children, and records changed after the preview. Changed membership invalidates the old confirmation.
- [x] Implement the complete history/deleted-record UI, Undo toast plus persistent history action, conflict-safe restoration, and transactional rollback on an injected database error.
- [x] Test a double submission/retry does not duplicate an operation; keep it a small persisted mutation-ID rule, not a generic command framework.
- [x] Complete all in-scope empty/loading/error/confirmation states, account/settings flows, and mobile navigation. No unfinished production controls or mock data may remain.
- [x] Populate only an isolated test database with at least 16 projects, 120 tasks, and 120 events. Exercise lists, search, calendar, Home, and history; record observed timings without inventing an agreed performance SLA.
- [x] Run the complete command gate below against the final code, plus Impeccable critique/audit and the changed-target mechanical detector. Fix findings and re-run affected checks.
- [x] Separate package self-review confirms every Phase 1 requirement has an implementation and test/evidence reference before final self-QA starts.
- [x] Write the final setup guide with actual implemented callback paths, Google Cloud links, every required `.env` value, migration/start commands, and an honest implementation/QA/blocker report. Do not leave this work as instructions for the user to reverse-engineer the app.

## 7. Review Focus

These risks must have tests in their owning package, not just a self-review reminder:

1. **Owner confusion:** Foreign IDs and parent links must not read or mutate another user's records. Packages 1-5.
2. **Dates near midnight or timezone changes:** Date-only deadlines stay on the same intended date; timed/all-day ranges remain correct. Packages 3-4.
3. **Stale previews, Undo, or concurrent edits:** Report a conflict and change nothing, including history, instead of partially restoring or deleting work. Packages 2 and 6.
4. **Hidden descendants and independent records:** Cascades affect only actual children; restore does not revive independently deleted records or erase newer work. Packages 2-6.
5. **UI-only success or inaccessible controls:** Refresh/restart retains data, related pages agree, keyboard/touch can complete workflows, and failed requests preserve input. Packages 1-6.

## 8. Verification Commands and Evidence

Package 1 must define these commands; later packages reuse them:

```text
npm ci
npm run db:migrate
npm run typecheck
npm run lint
npm run test -- --run
npm run build
npm run test:e2e
```

Success means exit code `0`, no failed required tests, and no unexplained skipped scenarios. Configure Playwright's web server lifecycle; tests create and use a separate temporary SQLite database, never the user's real data. Re-run the full gate on the final revision after QA fixes.

Baseline browser checks use desktop `1440x900` and touch-enabled mobile `390x844` viewports. Start with Playwright Chromium for reproducibility and report the engine actually exercised; do not claim Safari/Firefox validation without running it. Date tests cover Asia/Jakarta and America/Los_Angeles, including a daylight-saving transition in the latter.

For each evidence item record the tested revision, command/scenario, result, and any caveat. Browser QA must also record desktop and narrow mobile viewport, keyboard/touch behavior, and blocking console/runtime errors. Use the available shared browser only when its automation is authorized; automated Playwright tests and their artifacts remain the reproducible base.

Do not count a screenshot, a developer claim, or a local test session as proof of live Google OAuth. Missing Google credentials defer only that external check; all other implementation and QA work continues.

### Unattended Authenticated Testing

The agent does not need to click through Google to test the application. It needs an authenticated session, with ordinary server-side auth/owner checks still active.

- Prefer Better Auth's existing `testUtils` helpers in a separate test-only auth instance under `tests/support/auth.ts`. Check the installed version before using them; do not invent undocumented APIs.
- Use the helper to save two test users, create real sessions in the disposable test database, and provide signed cookies to Playwright using its normal cookie/storage-state support.
- The test helper and running test app must use the same isolated database, temporary test secret, auth schema, base URL, and cookie settings. The app validates those sessions normally; `requireUserId()` is never overridden.
- Keep the test helper outside application imports and HTTP routes. No "skip login" switch, hardcoded owner, `AUTH_DISABLED`, query parameter, public test-login endpoint, or privileged plugin in the production auth instance.
- Tests without seeded cookies remain anonymous and must be rejected. Test expired/forged cookies and cross-owner IDs as well as successful authenticated CRUD.
- The test harness starts a separate app on loopback with a disposable SQLite path and generated test-only secret. It must refuse to target the ordinary/deployed database or a remote origin. Test cookies/session files are local artifacts, excluded from version control and never logged as credentials.
- QA can reuse the same local fixture/session mechanism to inspect the app unattended. Bind the QA server to loopback and do not expose it through Cloudflare or deploy it.
- A normal production build must still have no test-login endpoint or login-skipping branch; include a negative smoke check. Reset the disposable test database/session state between runs.

This tests the actual application's session validation and authorized workflows without weakening its auth boundary. It does not test Google's consent screen or Google's own availability.

Official references, checked while revising this plan: [Better Auth test utilities](https://better-auth.com/docs/plugins/test-utils), [Google provider configuration](https://better-auth.com/docs/authentication/google), and [Better Auth environment setup](https://better-auth.com/docs/installation).

## 9. Final Self-QA and Completion Gate

After all six package self-reviews pass, perform a separate whole-phase self-QA pass in the current session. Check the integrated app, not just the last change. Do not claim independent review or a fresh reviewer context:

- [x] Exercise real local session validation/logout and server rejection of anonymous, expired/forged, and foreign-user requests. Verify the Google integration/configuration separately; live Google consent/callback remains pending until the user supplies Cloud configuration.
- [x] Create a project, add/move/reorder/complete/reopen tasks, reload, and restart the app against the same SQLite file.
- [x] Exercise standalone Inbox tasks, project details, shared panels, manual check-ins, dependencies, Focus Mode, and command palette/search.
- [x] Create/edit/reschedule independent and linked events; verify all calendar types, views, filters, dates, colors, and labels.
- [x] Archive/unarchive; preview and confirm a cascade; restore only its records; Undo ordinary operations; prove stale restore/Undo refuses later conflicts.
- [x] Verify Home, projects, tasks, calendar, search, and history all reflect the same persisted state.
- [x] Finish critical flows on desktop and mobile without relying on drag-and-drop; verify reduced motion, focus, labels, contrast, empty/error states, and no blocking runtime errors.
- [x] Verify consistent dark styling across all routes, calendar, dialogs, and UI states, with readable contrast, visible keyboard focus, and no light-theme flash on refresh.
- [x] Confirm AI is honestly unavailable, has no simulated responses, and task/check-in actions trigger no model calls or automatic follow-up creation.
- [x] Run the final command gate after all revisions and review real test evidence on the final revision.
- [x] Report remaining external setup separately. If all implementation and automated QA gates pass but Google setup remains, report "Phase 1 implementation and automated QA complete; live Google sign-in pending user setup." Do not label it fully production-ready or keep waiting for the user overnight.

Final self-QA findings re-enter the develop/verify/self-review loop. Implementation completion requires all included manual workflows accepted under isolated authenticated tests, all automated verification passing, and no unresolved code/QA blockers. Independent review is not a gate for this single-agent run; author self-review is weaker and that limitation must be disclosed. Real Google sign-in acceptance is tracked separately and remains pending until the user completes external setup. Later AI and per-page work must remain explicitly deferred.

## 10. Handoff and Stop

### Google Cloud and `.env` Setup Guide

Create `docs/Phase 1 Setup.md` during implementation and link it in the final report. The guide must contain:

1. **Google project/client setup:** Direct links to [Google Cloud Console](https://console.cloud.google.com/), [OAuth consent configuration](https://console.cloud.google.com/apis/credentials/consent), and [OAuth credentials](https://console.cloud.google.com/apis/credentials). Explain project selection, the consent/audience configuration and test-user entry when applicable, creating an OAuth **Web application** client, and where to copy its client ID/secret. Cloudflare email restrictions remain a separate user-managed step.
2. **Exact redirect values:** With the planned `/api/auth` mount, local redirect URI is `http://localhost:3000/api/auth/callback/google`; production is `https://<your-relay-domain>/api/auth/callback/google`. Give `http://localhost:3000` and `https://<your-relay-domain>` as the corresponding origins if the chosen Google client setup requests origins. Clearly distinguish origins from callback URLs. Verify the strings against the implementation and do not invent a production domain.
3. **Required scopes only:** Basic Google sign-in, not Calendar/Gmail/Drive permissions or unrelated APIs. Recheck current provider documentation when implementing.
4. **Environment file:** Explain copying `.env.example` to `.env`, which fields are already usable locally, which the user must fill, and what changes on the VPS. Never print actual secrets in the handoff.
5. **First run:** Exact install/migrate/start commands, the actual local URL, how to update the public base URL and Google redirect together, and how to run the one remaining live Google sign-in/logout smoke check.

The `.env.example` must document these concrete names, matched to the eventual implementation:

| Variable | What to document |
| --- | --- |
| `BETTER_AUTH_URL` | Local default `http://localhost:3000`; change to the real HTTPS app origin on the VPS |
| `BETTER_AUTH_SECRET` | User generates a strong persistent secret; provide the actual generation command in the setup guide, not a shared committed secret |
| `GOOGLE_CLIENT_ID` | Copy from the Google OAuth Web application client |
| `GOOGLE_CLIENT_SECRET` | Copy from that same client; server-only, never `NEXT_PUBLIC_*` |
| `DATABASE_URL` | SQLite location using the actual selected driver's format; document a usable local default, parent-directory permissions, and a persistent VPS location |

Do not add unused AI keys or encryption settings for the deferred AI phase. Test defaults/secrets belong to the test harness, not the production `.env` template. Exclude real `.env` files while retaining `.env.example` in version control. Show a clear missing-configuration message; do not log credentials or create a hidden fallback identity.

For Google setup, [Better Auth's Google guide](https://better-auth.com/docs/authentication/google) documents the callback path. [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) documents client credentials, redirect registration, and secure secret handling. Use the installed version's requirements if they differ; update both code and guide consistently.

### Final Report

When this phase is eventually authorized and completed, return:

1. Everything created or changed, grouped by routes/UI, data/CRUD, authentication, tests, and documentation; point to files instead of dumping their contents.
2. Exact final verification results, self-review/self-QA verdicts, and anything not tested. Explicitly state no independent review ran and author self-review has shared blind spots.
3. Blockers encountered, including resolved ones and how they were resolved; distinguish code defects from pending Google/environment/deployment setup.
4. A link to `docs/Phase 1 Setup.md`, with the exact callback URLs and a short checklist of `.env` values the user still needs to fill.
5. An honest completion status: implementation/automated QA versus live Google/production readiness, plus the next discussion boundary.

Then stop. Do not start AI work or redesign individual pages.

**Current instruction:** The user invoked [Phase 1 Goal Prompt.md](./Phase%201%20Goal%20Prompt.md), and its single-agent implementation and automated QA are complete. Evidence is in [Phase 1 Progress.md](./Phase%201%20Progress.md); external sign-in setup is in [Phase 1 Setup.md](./Phase%201%20Setup.md). Stop. Do not restart this phase, deploy, implement AI, or redesign pages without a separate user instruction.


