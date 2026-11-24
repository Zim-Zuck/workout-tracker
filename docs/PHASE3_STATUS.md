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
### 3a. Performance — **done**
Tests after: 418 total, 417 pass, 1 skipped, 0 fail.

Bundle, initial download:

| | before | after | change |
|---|---|---|---|
| main JS | 629.45 kB (gzip 183.24) | 589.53 kB (gzip 172.12) | **−39.92 kB (−11.12 gzip)** |
| vendor JS | 228.79 kB (gzip 59.36) | unchanged | — |
| CSS | 34.20 kB (gzip 7.65) | unchanged | — |

Split into three on-demand chunks: `TrainingEvolution` 14.34 kB (gzip 4.55),
`ProgressShareCard` 21.11 kB (gzip 7.50), `ExerciseDetail` 6.20 kB (gzip 2.46).

Decisions made:
- The real finding was not the bundle but a **dead memo**: `since` in
  `Progress.jsx` was a bare `Date.now()` expression recomputed on every render,
  so every memo keyed on it re-ran every time — including `rankExercises` over
  all history. Now memoised on the window.
- Lazy-loaded the three things behind a tap: Evolution, ExerciseDetail and the
  share card (which carries the whole canvas renderer). Each gets a Suspense
  fallback; the full-screen ones announce themselves with `role="status"`.
- **MilestonesRow is deliberately NOT lazy** (a deviation from the brief). It is
  about a kilobyte, it imports nothing the dashboard does not already hold, and
  it renders above the fold — splitting it would trade a visible blank row on
  every open for no measurable saving.
- Evolution and ExerciseDetail were already thoroughly memoised; nothing there
  needed adding.
### 3b. Accessibility — **done**
Tests after: 418 total, 417 pass, 1 skipped, 0 fail. Main JS 590.13 kB.

Fixed:
- `SegmentedTrack` had `role="tablist"` but no arrow keys and no roving
  tabIndex, so it was a tablist in name only and a keyboard user tabbed through
  every option. It now has the same keyboard contract `SegmentedPills` already
  had. Used on ExerciseDetail, History, Social, Settings, the feed and the
  export sheet.
- Settings' three on/off switches (`Rest timer sound`, `Vibration`, `Ronnie`)
  had `role="switch"` and `aria-checked` but **no accessible name** — the only
  text identifying them was a sibling. A screen reader announced "switch, on"
  three times with nothing to tell them apart. `label` is now required.
- The share card's Timeframe row was a hand-rolled row of bare `<button>`s: no
  group role, no `aria-selected`, no arrow keys, 36pt targets. Replaced with
  `SegmentedPills`, which already solves all four. Pills are 8pt taller as a
  result (36 → 44), which is the tap-target minimum doing its job.
- The two-bar period comparison read as "A 9 percent, B 16 percent" with nothing
  to say what A and B were or what was being measured. `DistributionBars` now
  takes `ariaLabel` and `srLabel`; the bar track and the bare "A"/"B" are
  `aria-hidden`, and each row carries one sentence —
  "1–5, The period before: 9 %".
- Removed a dead `SegmentedTrack` import from History.jsx.

Audited and found already correct, so left alone:
- Every `SegmentedPills`/`SegmentedTrack` call site already passes `ariaLabel`.
- Both pairs of custom-range date inputs are wrapped in real `<label>`s.
- `:focus-visible { outline: 2px solid var(--c-focus) }` is global.

**Contrast, measured rather than assumed** (ratios against the three stops of
the page gradient — `#5A1230` top, `#2A0A18` mid, `#0A0507` base):

| ink | vs gradient top | vs mid | vs base |
|---|---|---|---|
| `ink` #F6EEF0 | 11.77 | 15.94 | 17.74 |
| `ink-secondary` #D9C7CD — **the muted decline ink** | **8.31** | 11.26 | 12.53 |
| `ink-tertiary` #A6959A | 4.72 | 6.40 | 7.12 |
| `pr` #FFC46B | 8.54 | 11.57 | 12.88 |

The muted decline ink clears AA (4.5:1) and AAA (7:1) at the worst point on the
page. No change needed — recorded here so the next person does not re-litigate
it. `ink-tertiary` at 4.72 is the thinnest margin in the app but still passes AA.
### 3c. Property/fuzz tests — **done**
Tests after: 428 total, 427 pass, 1 skipped, 0 fail (+10 fuzz tests, each
running 100–300 seeded cases).

`test/fuzz.test.mjs` drives `classifyTrend`, `exerciseConsistency`,
`rankExercises`, `compareTrainingPeriods`, `buildHighlights` and `milestonesFor`
over randomised histories: empty, huge (3,000 workouts × 12 sets), duplicate and
same-millisecond dates, zero and negative weights, string weights, `null`,
`undefined`, `NaN` and `Infinity`, sets pointing at a deleted exercise, zero-width
and reversed and non-overlapping period ranges, and exercise libraries that are
empty/null/a Map/mismatched. Seeded PRNG, so a failure is reproducible from the
seed printed in the message.

**It found a real bug on the first run.** A non-finite `weightKg` flowed through
`setVolume` and `estimate1RM` unguarded and came out as `Infinity` in
`classifyTrend().observedBestKg`, `rankExercises().rows[].volumeKg` and
`compareTrainingPeriods().a.volumeKg` — i.e. on screen as "NaN kg". Fixed at the
root: the arithmetic in `calculations.js` is now total. `normalize.js` did
already coerce non-finite values on the way out of the database, but that is a
different layer, and anything arriving by another route (an import, a sync
payload, a set mid-edit) bypassed it.

The tests also assert invariants, not just finiteness: rankings are
deterministic on equal input, `achieved` is always newest-first, every `next`
entry is genuinely uncrossed with `0 ≤ pct ≤ 100`, `currentStreak` never exceeds
`bestStreak`, lifetime volume never goes negative, a `new` delta never claims a
percentage from a zero baseline, and `milestonesFor` agrees exactly with
`prTimeline` and `computeStreak`.
### 3d. Consistency audit — **done**
Tests after: 431 total, 430 pass, 1 skipped, 0 fail.

**Streak — already clean.** Every local streak goes through `computeStreak`:
`useWorkoutTotals` (Today, Progress, Ronnie, the feed), `progressSummary` via
`computeTotals`, `socialSummary`, and now `milestones`. The `streak_weeks` field
on Profile / UserProfile / Leaderboard / Friends / communityWeek is the **cloud**
value for somebody else's profile, which cannot come from local history.

**PR count — already clean.** `prTimeline`, `sessionPRForExercise` and
`prKindFrom` are the only ways anything decides a PR. `detectPRs` in
`calculations.js` is called by `prs.js` and by nothing else, which is the
intended shape — not dead code.

**Trend label — FOUND AND FIXED.** ExerciseDetail's chip checked `repCapped`
*before* the direction and said "High-rep work — est. 1RM can't track this". The
Best-progress ranking on Progress and the Evolution highlights looked only at
`status`, so the same lift was ranked and printed as "+8.2%" on one screen and
declared untrackable on another. The code already knew the number was an
artefact; only one screen acted on it. New canonical predicate
`trendWithholdReason(trend)` — one answer about what a classification licenses a
screen to say; `isRankableTrend` is now defined in terms of it. `classifyTrend`'s
own output is unchanged (the fitted line really is steady). Verified on the real
data: four lifts moved out of the ranking into "Leg Curl, Standing Calf Raise,
Lateral Raise and 1 more — trained above 12 reps, where est. 1RM stops
tracking".

**Date range — two findings, both fixed.**
- `Progress.jsx` built its window by hand (`Date.now() - days * 86400000`) while
  ExerciseDetail used `rangeFor(id)`. Progress now uses `rangeFor` too. Same
  value, one function.
- The custom-range title sentence was built twice — `progressSummary.js` for the
  share card's stamp, `TrainingEvolution.jsx` for its period headings — and the
  two copies had quietly disagreed about the year for as long as both existed.
  One `formatDayRange(start, end, { year, dash })` in `timeframes.js`; the year
  difference is now a deliberate parameter (the card's stamp has a fixed width
  on a 1080px image; the Evolution screen needs the year to compare across
  years) rather than an accident. No visual change on either screen.

One existing assertion was updated, not weakened: `withheld[0].reason` was
pinned to `null` for a noisy lift. Every withheld row now names why it was
withheld, so a screen grouping them never falls back to the status — and the
rep-capped case, which has an ordinary status and no trend reason, has somewhere
to go. The test's actual subject (`status === 'noisy'`) is untouched, and three
new tests pin the new contract.
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
