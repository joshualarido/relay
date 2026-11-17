# Phase 1 Goal Prompt

Saving or reading this document does not start execution. When the user invokes it through `/goal`, the prompt below authorizes Phase 1 implementation only.

## Prompt

Implement Relay's complete Phase 1 manual foundation by following:

- `docs/PRD.md` (v2.4): product requirements.
- `docs/Phase 1 Foundation Plan.md`: Phase 1 scope, six work packages, contracts, single-agent execution, verification, and handoff.

Read both documents fully before changing application files. This goal supersedes their earlier planning-only/discussion stop instructions, not their product requirements or safety boundaries. The Phase 1 plan deliberately reorders manual features and defers AI; do not mistake the PRD's full MVP checklist for this phase's scope. If you find another material contradiction, report it rather than silently changing the product.

### Start And Single-Agent Execution

Recheck the workspace, available instructions, runtime, and existing changes. Preserve user work. Do not initialize Git, commit, branch, push, deploy, or perform destructive data operations without separate authorization. Use the plan's file-manifest/content-hash evidence when no Git repository exists.

Use the current session as the sole implementer, researcher, reviewer, and QA executor. Record the actual model/effort when exposed by the runtime; no separate worker/reviewer models or model-routing gate are required.

Do not spawn subagents, delegate work, start other agent threads, or use Workflow/CLI orchestration. Do not call or wait for `orchestrator_capabilities` or `delegate_task`. Their availability is not an implementation prerequisite. This single-agent requirement explicitly supersedes the earlier delegation/model gates and fresh-independent-review requirements, including those recorded historically in the progress ledger.

Use `superpowers:executing-plans` for sequential inline work, subject to this plan's explicit rules: no extra worktree, Git initialization/commits, delegate reviewer, or additional ledger framework. Review and QA are separate passes by the same agent, not independent review; disclose that limitation in the ledger and final report.

### Execute The Six Packages

Follow the plan's package order and acceptance cases:

1. Runnable shell, identity, SQLite, and preferences.
2. Projects and the mutation/history foundation.
3. Tasks, Inbox, and project task views.
4. Events and the unified manual calendar.
5. Check-ins, dependencies, Focus Mode, Home, search, and command palette.
6. Complete Undo/restore/history and whole-app hardening.

Deliver working UI, routing, persistent CRUD, cross-view consistency, responsive layouts, and accessible controls, not a scaffold with placeholder actions. Use the agreed dark theme everywhere from first paint. Create `PRODUCT.md` and `DESIGN.md` before substantial UI work; follow Impeccable and Vercel React Best Practices.

SQLite is final. Use Google OAuth with Better Auth and server-enforced owner isolation. Do not add an app email allowlist; the user handles Cloudflare restrictions.

Keep archive, confirmed cascading soft deletion, safe Undo/restore, revision conflicts, date/timezone semantics, and transaction safety exactly as specified. Dependencies are not ownership. Preserve independent events and independently deleted children.

Do not implement AI, model/key settings, conversations, proposals, automatic recommendations, or individual page redesigns. Chat destinations must honestly explain that AI is deferred. Completing a task or saving a check-in must never invoke AI or create a follow-up task. Ordinary Add Task saves the entered title without AI rewriting.

### Development And QA Loop

Work through one package at a time in the existing workspace. Do not edit product code during its review pass; record findings first, then return to implementation.

For each package: read scope/acceptance cases -> optional focused research -> develop with regression tests -> run verification -> separate self-review -> fix findings -> self-recheck -> accept -> run accumulated regressions.

During self-review, re-read the relevant PRD/plan requirements and inspect the stable package change plus connected code, not just the implementation summary. Record separate spec-compliance and quality `PASS`/`REVISE` verdicts, reproducible findings, and actual command results. Fix findings directly, add regression coverage, and re-run affected checks after every change. Label every review/re-check as self-review; never claim a fresh context or independent reviewer.

After three revision rounds on a package, or two rounds with the same unresolved root cause, stop repeating the approach and report the blocker with a proposed resolution. Never waive a defect to finish. Do not accept unresolved critical/high, security, data-loss, required accessibility, or broken-workflow findings.

Maintain the existing execution ledger at `docs/Phase 1 Progress.md`: package status, tested revision/file hashes, commands/results, self-review verdicts, findings/fixes/re-checks, decisions, and resolved or outstanding blockers. After each verified step and before a context handoff, record the current package, exact next action, pending checks, and any running command/session. Historical delegation failures are superseded evidence, not active gates.

Continue through all six packages without routine approval pauses. On goal continuation or context recovery, re-read this prompt, the plan, and the ledger; revalidate workspace hashes and resume the next unfinished action without repeating completed work or capability discovery. Preserve unexpected user changes and stop to resolve them. Pause only for genuine blockers or decisions that would change the agreed scope or safety boundaries. After integration, perform a separate whole-phase self-QA pass and fix/recheck its findings before completion.

Unattended continuation depends on the host keeping/resuming the goal; the ledger is a recovery checkpoint, not a background scheduler. If interrupted, leave an honest incomplete checkpoint rather than claiming completion or that work continues after the run stops.

### Unattended Authenticated Testing

Do not ask the user to log in or supply Google credentials during the run. Finish the Google integration and defer Cloud client provisioning and live Google sign-in to the final setup handoff.

Follow the plan's isolated session setup: verify the installed Better Auth `testUtils` API; use a separate test-only auth instance to create two users and real sessions in disposable SQLite, and supply signed cookies to Playwright. The helper and test app must share the isolated database, temporary secret, schema, origin, and cookie settings. Keep ordinary application session validation and ownership checks active.

No production auth bypass, hardcoded owner, skip-login switch, public test-login endpoint, or privileged test plugin in the production auth instance. Keep helpers outside application imports/routes. Bind the QA server to loopback; refuse real/deployed databases and remote targets. Protect test cookies/secrets as local ignored artifacts.

Test anonymous denial, invalid/expired cookies, cross-owner access, and absence of a production test-login route, alongside successful authenticated workflows. These checks do not prove live Google OAuth works.

### Verification And Completion

Define and run the plan's full command gate on the final revision:

```text
npm ci
npm run db:migrate
npm run typecheck
npm run lint
npm run test -- --run
npm run build
npm run test:e2e
```

Run migration/testing commands against isolated data as specified in the plan. Record actual exit codes, failures, and skips. Do not weaken tests, hide errors, or claim unrun checks passed.

Include desktop `1440x900` and touch-mobile `390x844` checks, keyboard alternatives, dark-theme states, refresh/restart persistence, cross-view consistency, timezone/DST cases, cascade/Undo conflicts, and an isolated workload of at least 16 projects, 120 tasks, and 120 events. Report observed timings and browser engines actually tested; do not invent an SLA or browser coverage.

Create `.env.example` and `docs/Phase 1 Setup.md`. Do not overwrite a real `.env`, commit secrets, or add deferred AI secrets. Document the actual SQLite URL format, first-run commands, a strong-secret generation command, and what the user must fill for `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `DATABASE_URL`.

The setup guide must include the Google Cloud project/consent/client links specified in the plan, exact implemented origins and callback paths, and the remaining live sign-in/logout smoke check. Expected local callback: `http://localhost:3000/api/auth/callback/google`; production: `https://<your-relay-domain>/api/auth/callback/google`. Verify these against the code; never invent a production domain.

Completion requires every included manual workflow accepted, passing final verification and whole-phase self-QA, and no unresolved implementation/QA blockers. Independent review is not required or claimed for this single-agent run. Missing Google credentials alone must not hold the run open. If applicable, report exactly: "Phase 1 implementation and automated QA complete; live Google sign-in pending user setup."

Finish with a report covering everything created/changed, exact verification and self-review/self-QA results, anything not tested, resolved and outstanding blockers, the setup-guide link, callback values, and the user's remaining `.env` checklist. State that no independent review ran and author self-review has shared blind spots. Distinguish implementation completion from live Google verification and production readiness.

Then stop. Do not start Phase 2, AI implementation, deployment, or page-specific redesigns.
