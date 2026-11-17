<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Relay Project Instructions

## Authority And Scope

- Relay makes personal work easy to capture, organize, update, and resume.
- `docs/PRD.md` (Relay PRD v3) is the product authority. Earlier PRDs and phase
  documents live in `docs/archive/` for reference only.
- The active phase plan is under `docs/superpowers/plans/`; its progress file is
  `docs/Phase N Progress.md`. Also read `PRODUCT.md` and `DESIGN.md`.
- Writing or reading a plan does not start implementation. Wait for explicit
  authorization, such as the user invoking the phase through `/goal`.
- Report material contradictions rather than silently changing product behavior.
- Git is initialized: commit per task on the phase branch. Never push or merge
  `main`, deploy, or start another phase unasked.

## Execution Model

- Subagent-driven development is allowed when the user requests it: one
  orchestrator/reviewer dispatches focused worker subagents one at a time in
  the phase branch checkout (no extra worktrees) and reviews each package.
- Workers never touch the ordinary database, `.env`, or OAuth configuration,
  and never spawn their own subagents.
- Review stable changes in a separate pass before fixing findings. Describe the
  review honestly (orchestrator review of worker output, not certification).
- Keep one progress document for the active phase. Record decisions, changed
  files or commits, commands/results, unresolved findings,
  pending processes, and the exact next action.
- On interruption, reread the active phase and checkpoint; verify current files
  before resuming. Preserve user work and stop on unexpected concurrent changes.

## Architecture And Data Safety

- Keep the existing Next.js App Router, React, TypeScript, SQLite/Drizzle, and
  Better Auth Google stack. Read version-matched installed docs before coding.
- Keep business rules in `src/lib` and route handlers thin; reuse existing forms,
  services, primitives, and dependencies. Prefer native features and minimal code.
- Derive ownership from the authenticated session. Validate inputs and the
  ownership of referenced records at server boundaries.
- Preserve revisions, idempotency, atomic mutations, and before/after history.
- Preview consequential cascades and reject stale affected-record sets.
  Dependencies are references, not ownership. Preserve independent events.
- Undo/Restore must never overwrite later work or revive independently deleted
  records. Schema changes must account for persisted history, not just live rows.
- Preserve date-only values, timed deadlines, IANA zones, and completion timestamps.
- Never expose secrets, overwrite `.env`, or weaken production authentication.

## Product And Design

- Manual workflows work without AI. Completion and check-ins never invoke AI or
  create follow-up tasks. Do not add AI packages or simulated AI features.
- Save captured task titles literally; do not split, rewrite, or deduplicate them.
- Implement only the lifecycle and priority rules approved for the active phase.
- Visual rules come from DESIGN.md. Phase 1 rewrites it; until then do not add new UI.
- Use accessible in-app dialogs for decisions, inline errors for failed input,
  and nonblocking app notifications for routine success and Undo.
- Preserve keyboard/touch access, visible focus, contrast, labels, reduced motion,
  and non-color indicators. Charts need accessible text equivalents.
- No fake production data, placeholder actions, decorative gradients, or repeated
  AI disclaimers.

## Develop, Verify, Reset, Hand Off

1. Read scope and existing callers; add regression coverage for changed behavior.
2. Implement one coherent package, run focused checks, then separately self-review
   correctness, scope, security, accessibility, and connected workflows.
3. Record findings before fixing them. Fix, rerun checks, and self-recheck.
   Never waive data-loss, security, required-accessibility, or broken-flow defects.
4. After integration, run typecheck, lint, unit/integration tests, production
   build, and production-mode browser tests. Verify fresh and upgrade migrations.
   Use isolated SQLite and test-only real sessions; never test against user data.
5. Only after automated acceptance, perform an explicitly authorized local
   verification reset, only when the active phase plan authorizes a reset;
   documentation work does not trigger it. Follow that plan's reset procedure.
6. Resolve and verify the exact configured local database and WAL/SHM paths.
   Stop its writers, make and integrity-check a private SQLite-consistent backup,
   then reset only that database and run migrations. Preserve `.env`, OAuth
   credentials, source, dependencies, and unrelated files. Never delete a
   directory recursively or reset an ambiguous, external, or deployed target.
7. Check schema, migration state, foreign keys, integrity, and empty application
   tables on the actual fresh database. Leave it unseeded; do not contaminate it
   with automated QA fixtures. A full reset also clears auth and preferences:
   the user signs in again and defaults return.
8. Report backup location, migration/verification results, startup instructions,
   and a short manual acceptance checklist. Stop for user verification; do not
   claim their checks or live OAuth passed.
9. User findings re-enter the same regression/fix/self-review loop. Do not reset
   their new verification data again without renewed authorization. Do not start
   the next phase automatically.

Record only checks actually run. Deferred external setup and author self-review
limitations are not passing test evidence.
