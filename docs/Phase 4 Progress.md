# Relay v3 Phase 4 Progress — Input and Gestures (Local Only)

**Branch:** `v3/phase-4-input` (from `main` @ `862e077`)  
**Status:** Complete (ready for user click-through verification; not pushed or merged to `main`)  
**Scope:** Local only — no Vercel, Turso, hosting, or auth-provider changes.

---

## What Finished

### 1. Deterministic Capture Token Parser (`src/lib/capture-parser.ts`, `tests/unit/capture-parser.test.ts`)
- Pure, deterministic parser (no AI) supporting:
  - `#project` with multi-tier fuzzy matching against non-archived projects (`exact`, `slug`, `prefix`, `word-prefix`, `substring`, ordered subsequence). Unknown `#project` tokens are flagged with an inline hint and never block creation (task saves under **No project**).
  - `@today`, `@tomorrow`, `@next-week` (respects owner `weekStart`), weekdays (`@mon`–`@sun`), `@DD/MM`, `@DD/MM/YYYY`, and `@YYYY-MM-DD`, all resolved relative to the owner's `timezone`.
  - `@<date> HH:MM-HH:MM` and `@HH:MM-HH:MM` for scheduled events (DST-safe UTC conversion via `Temporal`), automatically toggling capture mode to **Event**.
  - Standalone `!` to mark a task important (preserves trailing punctuation on normal words like `"Buy milk!"`).
  - Plain text with no tokens preserves the title verbatim as a loose task.
- Exact `[start, end)` token spans allow one-click chip removal (`removeTokenFromInput`).

### 2. Rebuilt Quick Capture Dialog (`src/components/quick-capture.tsx`, `src/components/capture-dialog.tsx`)
- `N` anywhere (blocked in fields/dialogs/menus via `isShortcutBlocked`), Today's **Capture** button, and the mobile bottom-bar **+** button all open the same single-line dialog.
- Renders detected tokens live as removable chips with category icons and neutral `×` remove buttons.
- `Tab` (from the input) or the segmented toggle switches between **Task** and **Event**.
- Creates via `/api/tasks` or `/api/events` with idempotent `mutationId`, updates `WorkspaceProvider` immediately, and displays the **Undo** toast (`notifyMutation`).

### 3. Command Palette (`src/components/command-palette.tsx`, `src/lib/palette-search.ts`)
- Opened by `Ctrl/Cmd+K` (anywhere) or `/` (outside inputs/dialogs/menus), plus the sidebar/mobile Search buttons.
- Instant client-side fuzzy search over navigation commands (`Go to Today`, `Go to Projects`, `Go to Calendar`, `Open Schedule mode`, `Go to Settings`, `Quick capture`, `Keyboard shortcuts`), projects (navigates to project board), and tasks (opens the task's details sheet).
- Full keyboard navigation (`↑`/`↓`/`Home`/`End`/`Enter`/`Esc`) plus a bottom `Capture "<query>"` fallback when typing.

### 4. Shortcut Cheat Sheet, `E`/`X`, and Shortcut Tooltips (`src/components/shortcut-sheet.tsx`, `src/components/today-due-list.tsx`, `src/components/projects/projects-view.tsx`)
- `?` opens the keyboard shortcut cheat sheet (also accessible from the Account menu and Command Palette).
- `E` edits and `X` completes/reopens whichever task row/card is currently focused on Today or Projects.
- All single-key shortcuts are blocked while typing in inputs, textareas, selects, contenteditables, or while a dialog/menu is open (`isShortcutBlocked`).
- Audited shortcut tooltips across navigation, Capture, Calendar Schedule (`S`), Projects (`Ctrl+N`, `E`, `X`), and Today (`E`, `X`) so each control shows its shortcut once.

### 5. Mobile Swipe Gestures (`src/components/swipeable-task-row.tsx`, `src/components/today-due-list.tsx`, `src/components/today-timeline.tsx`, `src/components/projects/board.tsx`)
- Touch swipe on task rows (Today due-today + task blocks, and Projects task cards):
  - **Swipe right** completes the task (with Undo toast).
  - **Swipe left** pushes the task's due date to tomorrow in the owner's timezone (clearing `dueAt`/`timezone` if timed, with Undo toast).
- Respects `prefers-reduced-motion: reduce`, ignores desktop mouse drags so dnd-kit stays undisturbed, guards Projects' narrow-screen back-swipe when swiping a task card, and preserves the `⋯` menu fallback.

### 6. Local PWA Manifest & Icons (`src/app/manifest.ts`, `src/app/layout.tsx`, `public/icons/`)
- Added Next.js App Router web manifest (`/manifest.webmanifest`) with `standalone` display, `start_url: "/"`, paper-and-graphite theme/background colors, and PNG icons (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`).
- Added `viewport.themeColor` (light/dark) and `appleWebApp` metadata in `src/app/layout.tsx`. No service worker caching or offline mode.

### 7. Project Deletion Rule & Archived Projects (`tests/integration/recovery.test.ts`, `src/components/projects/projects-view.tsx`)
- Confirmed cascade deletion removes the project and its child tasks together after listing them in the confirmation dialog, leaves loose tasks untouched, and restores both together in one combined Undo.
- Updated `projects-view.tsx` to immediately clear deleted child tasks from local state alongside the deleted project.
- Fixed the pre-existing `Doing` status test in `tests/integration/recovery.test.ts` (left over from `862e077`) and added a dedicated integration test for project deletion + combined Undo + loose-task preservation.
- Archived projects remain a collapsed **Archived** group at the bottom of the project list; closed decisions #1 and #4 in `docs/Phase 2 Progress.md`.

### 8. Docs & Branch Pruning
- Updated Roadmap (`docs/superpowers/plans/2026-11-17-relay-v3-roadmap.md` and vault copy) and PRD (`docs/PRD.md` and vault copy) to defer Vercel + Turso + Google allow-list into a later Deploy phase, reword Phase 4 acceptance #7 for local PWA + phone-viewport swipes, record the `Doing` status removal, and record the project deletion rule. Vault plan file was not edited.

#### Branch & Worktree Pruning Report
- **Removed (fully merged into `main`, clean worktrees removed first):**
  - `v3/phase-0-cut` (was `8178ce6`, no worktree)
  - `v3/phase-1-today-opus` (was `3160797`, removed worktree `v3-phase-1-today-opus-1cab0356624aae7f`)
  - `v3/phase-2-projects` (was `cb076eb`, removed worktree `v3-phase-2-projects-55a80be9e84965e9`)
  - `v3/phase-3-calendar` (was `cb076eb`, removed worktree `v3-phase-3-calendar-0389f7405057b1be`)
  - `v3/phase-3-calendar-neon` (was `862e077`, removed worktree `v3-phase-3-calendar-neo-48c77af21f287802`)
- **Kept (and why):**
  - `main` — primary branch
  - `v3/phase-4-input` — active Phase 4 branch/worktree
  - `v3/phase-1-today` (`e712fbe`) — unmerged into `main`
  - `v3/phase-1-design` (`465b217`) — merged commit, but worktree `v3-phase-0-cut-b83119db56dcb79a` had uncommitted local files (`next-env.d.ts`, `relay-dev.log`), so preserved without force-removal
  - `v3/phase-1-behavior` (`465b217`) — merged commit, but worktree `v3-phase-1-behavior-1208d7c5eaeb564c` had uncommitted edits and untracked files (`2026-11-18-phase-1-behavior.md`, `screen-transition.tsx`, etc.), so preserved without force-removal

---

## Commits on `v3/phase-4-input`

1. `0be0bf4` — `feat(input): add deterministic capture token parser and fuzzy palette search`
2. `ef72780` — `feat(input): token capture chips, fuzzy command palette, shortcut sheet, and tooltips`
3. `72dcb55` — `feat(gestures,pwa): mobile task swipes, E/X shortcuts, local PWA manifest, and project delete Undo test`
4. *(docs commit)* — `docs(v3): Phase 4 progress, screenshots, roadmap and PRD updates`

---

## Verification Results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass (0 errors) |
| Lint | `npm run lint` | Pass (0 errors, 0 warnings) |
| Touched Unit & Integration | `npx vitest run tests/unit/capture-parser.test.ts tests/integration/recovery.test.ts` | Pass (2 files, 25 tests) |
| Production Build | `npm run build` | Pass (`○ /manifest.webmanifest` built) |
| Desktop & Mobile E2E (prod server) | `RELAY_TEST_SERVER=production RELAY_SCREENSHOTS=1 npx playwright test tests/e2e/capture.spec.ts --project=desktop --project=mobile` | Pass (5 passed, 3 skipped by project filter; covers acceptance #2, tokens, chips, palette, `?`/`E`/`X`, mobile swipes + Undo + `⋯`, and localhost PWA manifest/icons) |

### Screenshots (`docs/phase4-screens/`)
- `capture-1440-light.png` / `capture-1440-dark.png`
- `palette-1440-light.png` / `palette-1440-dark.png`
- `shortcuts-1440-light.png` / `shortcuts-1440-dark.png`
- `capture-390-light.png` / `capture-390-dark.png`

---

## Manual Click-Through Checklist

1. **Quick capture tokens (Acceptance #2):** Press `N` (or click Today's **Capture** button) → type `Fix login bug #relay @fri` → confirm **Relay** and **Fri ...** chips appear → press `Enter` → confirm the task lands in Relay with Friday's due date → click **Undo** on the toast and confirm it is removed.
2. **Scheduled event, importance, removable chips, unknown `#project`:**
   - Open Capture → type `Design review @fri 14:00-15:00` → confirm mode auto-switches to **Event** → `Enter` creates a timed event on Calendar.
   - Open Capture → type `Check build ! #nope @tomorrow` → confirm inline hint (`saves under No project`), click `×` on the `@tomorrow` chip to remove it → `Enter` creates an important loose task with no due date.
   - Open Capture → press `Tab` to toggle **Task** ↔ **Event**; plain text saves a loose task.
3. **Command palette:** Press `Ctrl+K` or `/` → type `go to Calendar` and press `Enter` (navigates to Calendar) → open palette again, search a project name and press `Enter` (opens its board) → search a task title and press `Enter` (opens its details).
4. **Shortcut sheet & `E`/`X`:** Press `?` to view the cheat sheet (`Esc` closes). On Projects or Today, focus a task title link → press `E` (opens details), close it, press `X` (completes with Undo toast). Type `?ex/` into an input field and confirm no shortcuts fire.
5. **Mobile swipe & `+` (390×844 touch emulation):** Tap the center `+` button to confirm the same Capture dialog opens. On Projects or Today, swipe a task row right to complete (and click **Undo**), swipe a task row left to push to tomorrow (and click **Undo**), and confirm `⋯` menu still works.
6. **Local PWA install check:** Open DevTools → Application → Manifest on `http://localhost:3000` (or `http://127.0.0.1:3000`) and confirm `Relay` manifest loads with `display: standalone`, valid 192px/512px/maskable icons, and no installability errors.
7. **Project delete & Archived group:** Delete a project with child tasks → confirm the dialog lists its tasks → confirm deletion removes both while leaving loose tasks untouched → click **Undo** and confirm both project and tasks return together. Confirm archived projects still appear in the collapsed **Archived** group.

---

## Open Decisions / Notes

- **Dirty merged worktrees preserved:** `v3/phase-1-design` (`v3-phase-0-cut-b83119db56dcb79a`) and `v3/phase-1-behavior` (`v3-phase-1-behavior-1208d7c5eaeb564c`) plus unmerged `v3/phase-1-today` (`v3-phase-1-today-580e9069cbc3c69b`) were left untouched so no local files or unmerged commits are lost. If you no longer need them, they can be reviewed and removed separately.
- **Deployment deferred:** Vercel, Turso (libSQL), and the Google sign-in email allow-list are tracked in the deferred Deploy phase on the roadmap.
- **Old v2 `workbench.spec.ts`:** Still references the removed pre-v3 filter-form palette and Focus Mode dialog; Phase 4 tested `capture.spec.ts` (capture, palette, shortcuts, mobile swipe, PWA) per the lean test plan.
