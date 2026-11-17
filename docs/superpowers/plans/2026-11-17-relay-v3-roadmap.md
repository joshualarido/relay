---
title: Relay v3 Roadmap
date: 2026-11-17
status: awaiting approval
spec: "[[Relay PRD v3]] (v3.2)"
---

# Relay v3: Implementation Roadmap

**Starting point:** `C:\Users\joshu\Documents\0-coding\personal\relay` on `main` @ `691c3bb` (Phase 1.3 done, manual verification pending). There's no GitHub remote yet.
**Target:** [[Relay PRD v3]]. Each phase gets its own detailed plan, written when that phase starts. Phase 1 changes the design system, and later plans need its tokens and components to be exact.

| Phase | Goal | Done when | Detailed plan |
|---|---|---|---|
| **0: Cut** | Strip the app down to the v3 model without losing data | App runs with Today, Projects and Calendar in the navigation; statuses migrated; planned dates turned into linked events; all checks green; upgrade tested on a copy of the real DB | [[2026-11-17 Relay v3 Phase 0 - Cut]] |
| **1: Design reset and Today** | New DESIGN.md and PRODUCT.md (Impeccable); new shell and navigation (`Ctrl+←/→`, `1/2/3`, directional slide, prefetch); Today as a timeline with a now line, catch-up line, Capture button and "Day clear" | Passes the 5-second test at 1440×900 and 390×844; Impeccable critique has no clutter findings; screen switch has no loading flash | written at Phase 1 start |
| **2: Projects split view** | Project list (No project first, status groups, drag), task board (To do / Doing / Done columns, drag, inline add), side sheet, `⋯` and context menus, completion animation. Delete the Inbox route | PRD acceptance #1 and #4 pass; drag works by mouse, touch and keyboard | written after Phase 1 |
| **3: Calendar and Schedule mode** | Week, month and day views, inline create, move and resize; Schedule mode (`S`, floating panel, drop rules, Shift+drop, keyboard pick-up, tap-to-place) | PRD acceptance #3 passes, including Undo | written after Phase 2 |
| **4: Input and anywhere** | Quick add with tokens, command palette, shortcut sheet `?`, mobile swipes, PWA, Vercel + Turso deploy, Google allow-list | PRD acceptance #2, #6, #7 and #8 pass on the deployed URL | written after Phase 3 |

## How each phase runs

1. I write the detailed plan into this folder. **You approve it.**
2. I copy it into the repo (`docs/superpowers/plans/`) and start a **T3 Code thread** on a git worktree with branch `v3/phase-N-<name>`.
3. Inside T3, the orchestrator (Opus 5.5 medium) follows **superpowers:subagent-driven-development**: one worker subagent per task (Opus 5.5 low), a fresh reviewer per task, then a whole-branch review.
4. I watch the thread, answer what I can, and bring you anything only you can decide.
5. The **Reviewer bot** independently checks the finished branch against the plan.
6. You check it by hand. **Merging into `main` needs your OK.** Pushing waits until there is a GitHub remote, and only feature branches get pushed.

## Decision taken while planning (PRD v3 §5 amended)

The PRD said to remove the activity log and revision counters. The plan **keeps them as invisible plumbing**, because they're what makes Undo and safe retries work today, and ripping them out would cost about a day and add risk for no visible gain. There is no History page. The undo toast uses them.

The **check-in and dependency tables, plus the priority, urgent, estimate, blocker and planned-date columns, stay in the database unused** in Phase 0. Old undo history still references them, and dropping columns in SQLite means rebuilding tables. A later cleanup can drop them once old history no longer matters.
