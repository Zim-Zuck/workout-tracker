# Phase 3 status

Resume point for a new session: read this file, start at the first step marked
**remaining**.

## Baseline (recorded before any Phase 3 work, at aad595d)
- Tests: 393 total, 392 pass, 1 skipped, 0 fail.
- Bundle: `index-B40KbBrV.js` 625.79 kB (gzip 182.07 kB), vendor
  `index-8IuOJL3e.js` 228.79 kB (gzip 59.36 kB), CSS 34.03 kB (gzip 7.64 kB).

## Steps

### 1. Share card date fix — **done**
Tests after: 396 total, 395 pass, 1 skipped, 0 fail.

Decisions made:
- `localDayBounds` and `customRange` **moved** from `trainingEvolution.js` to
  `timeframes.js`. The timeframe registry already owns `resolveRange`/`rangeFor`,
  so range construction now lives in one module. Importers updated
  (`TrainingEvolution.jsx`, `trainingEvolution.test.mjs`); no re-export left
  behind, so there is one import path, not two.
- `resolveRange`'s `custom` argument now takes a `{start, end}` range — the shape
  `customRange()` returns and the shape `resolveRange()` itself returns. Before,
  callers had to translate to `{from, to}`. One range shape in the codebase now.
  Two existing tests updated for the new shape (no assertions weakened).
- `ProgressShareCard.jsx` no longer parses its two date inputs with
  `new Date('YYYY-MM-DD')` (UTC midnight); it calls `customRange()`.
- `weeklySummary.weekKeyToMs` had its own hand-rolled local-midnight parser.
  Pointed at `localDayBounds`; malformed keys still give `NaN`.
- Grep for other `new Date('YYYY-MM-DD')` parsing: those two were the only ones.
  Both `type="date"` input pairs in the app (share card, Evolution screen) now go
  through `customRange`.

### 2. Milestones — **done**
Tests after: 418 total, 417 pass, 1 skipped, 0 fail. Bundle: main JS 629.45 kB
(gzip 183.24 kB), +3.66 kB over baseline.

Spec: `docs/phase-3-milestones.md`. New files: `src/services/milestones.js`,
`src/components/MilestonesRow.jsx`, `test/milestones.test.mjs` (22 tests).

Decisions made:
- **Signature deviation**: `milestonesFor(workouts, { asOf })` — the `exercises`
  argument the brief specified is not taken, because nothing in the function
  needs it (count, volume, streak and PR count all come from workouts and their
  sets). Keeping it would mean an argument that exists only to be ignored, and
  dropping it is what makes the merged/deleted-exercise edge case free.
- **Per-lift e1RM thresholds deliberately NOT built** — they cannot be done
  without noise (one ladder cannot span a bench and a leg press; keying to named
  lifts duplicates `achievements.js` and breaks on user-created exercises; and
  e1RM is an estimate a rep-capped set can push across a line). Reasoning in
  full in the spec. Four categories shipped: workouts, streak, volume, PRs.
- Milestones are **not** folded into `achievements.js`: that file's own rule is
  that an achievement must be decidable from the published `stats`+`lifts`
  summary so a friend's profile can be evaluated, and a date-reached needs the
  raw history. Three subjects overlap (50 workouts, 8-week streak, 100 t) and are
  kept apart by screen and shape; spec says why merging would cost either the
  dates or friends' profiles.
- The service returns raw timestamps and locale-free labels; the component
  formats dates. Same split `progressSummary.js` uses, and it keeps the tests
  machine-independent.
- Placed on **Progress**, one row directly under the four lifetime stat tiles.
  Hides itself entirely when nothing is reached and nothing is in progress.
### 3a. Performance (lazy-load, memoise, bundle report) — **remaining**
### 3b. Accessibility — **remaining**
### 3c. Property/fuzz tests — **remaining**
### 3d. Consistency audit — **remaining**
### 3e. ARCHITECTURE.md for the Progress area — **remaining**
### Browser verification (after steps 1 and 2) — **done, pass with nothing found**
- Dev origin `:5173`, REAL data, read-only. Integrity snapshot taken before and
  to be re-checked at the end: 12 workouts, 72 exercises, 132 sets, 57,212 kg.
- Milestones row on Progress: "50 t lifted · Nov 18, 2026 / 10 workouts ·
  Nov 16, 2026 / 10 personal records · Nov 16, 2026", then "Next: 100 t lifted —
  42.8 t to go". `volumeKg` from the service (57,212) matches an independent
  read-only tally of the raw store exactly; `currentStreak` (4) matches the
  dashboard's own streak tile.
- Evolution screen, custom Nov 1 – Nov 15: 6 workouts, 28,604 kg.
  Share Card, same custom range: 6 workouts, 28,603.5 kg, window
  Nov 1 00:00:00 → Nov 15 23:59:59 local. **Identical boundaries** — the step 1
  fix verified against real data.
- ExerciseDetail (Back Squat): trend, consistency strip and all-time row all
  render. No console warnings or errors anywhere.
- Preview origin `:4173` (separate IndexedDB, never the real one) for the small
  states: one session → row shows only "Next: 4-week streak — 3 more weeks";
  empty history → row hidden entirely and Progress shows its own empty state.
  One-session fixture restored afterwards.
### Final report — **remaining**
