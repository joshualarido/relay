# Design reset (paper and graphite)

Branch `v3/phase-1-design`, based on Phase 0 (`v3/phase-0-cut` @ `8178ce6`). Requested by Joshua on 2026-11-17: the colour palette and the container style felt bad, and the goal is a clean look. This is a visual reset only. The Phase 1 behaviour work (the Today timeline, screen-switch shortcuts, the slide transition) is not included.

## What changed

- `DESIGN.md` is rewritten: neutral paper/graphite surfaces that follow the system light or dark setting, one ink-blue accent, and hierarchy from type and space.
- `src/app/globals.css`:
  - new tokens for light and dark;
  - sections are no longer boxed;
  - board columns are unboxed, and cards are flat;
  - per-card controls appear on hover or keyboard focus (on touch they stay visible);
  - shadows only on floating layers;
  - a segmented control for view switches;
  - tinted calendar chips with an icon per type.
- `button.tsx`: quieter variants.
- Helper paragraphs removed: page subtitles, "Displayed in Asia/Jakarta…", and the quick-capture blurb.
- Today:
  - the date is the subtitle;
  - quick capture is one row (type, title, button);
  - each task row has one meta line.
- `next.config.ts`: `devIndicators: false`. The dev badge covered the account control and a palette link on mobile. Compile and runtime errors still show.
- Tests changed in text only: the colour-scheme assertions now follow the system, the event colour token changed, the Today meta strings changed, and the removed help-text assertions are gone.

Screenshots (isolated demo data): `docs/design-screens/`, at desktop 1440×900 and mobile 390×844, light and dark.

## Checks (run on the final tree)

- typecheck: pass. lint: 0 problems. vitest: 13 files, 84 tests passed. build: pass.
- playwright: 113 passed, 10 skipped, 1 failed. The failure is the desktop calendar drag test (see below).

## Known issue: FullCalendar drag race (not caused by this change)

`tests/e2e/calendar.spec.ts` "desktop calendar dragging…" fails intermittently. The browser error is `TypeError: Cannot read properties of undefined` in FullCalendar's `DayGridRows.queryHit`: `computeRowFromPosition` gets an undefined row height, so the row index runs past the last row.

It failed 2 of 4 repeats on the Phase 0 styles, and 3 of 4 on the new styles, so the styling doesn't cause it. Retrying the gesture does not recover it. Phase 0 recorded the same test as "flaky".

Hand this to the Phase 3 calendar rebuild, or work around it by forcing a re-measure (for example remounting the calendar after its data changes).
