# Phase 2 — Training Evolution and Training Intelligence v1

Status: approved, implemented. Follows Phase 0/1, which consolidated the Progress
calculations and added `services/exerciseStats.js`.

The rule this phase inherits and keeps: **nothing recomputes what already has a
canonical function.** `muscleVolume`, `repRangeCounts`, `workingVolume`,
`rankExercises` and `classifyTrend` are the inputs; this phase adds comparison
and phrasing on top of them, and no new definition of volume, a muscle share, a
rep bucket, a session count, a trend or a PR.

---

## Feature A — Training Evolution

### Interface

```js
compareTrainingPeriods(workouts, exercises, rangeA, rangeB)
// rangeA / rangeB: { start, end }  — inclusive at both ends, matching every
//                                    other range in the codebase
```

Returns:

```js
{
  a: PeriodStats,
  b: PeriodStats,
  delta: {
    workouts:       Change,   // count
    volumeKg:       Change,
    exerciseCount:  Change,
    perWeek:        Change,   // sessions per week
    volumePerWeek:  Change
  },
  repRange: [{ label, a: {count, pct}, b: {count, pct}, pctPointDelta }],
  muscle:   [{ label, a: {volumeKg, pct}, b: {volumeKg, pct}, pctPointDelta }],
  exercises: {
    introduced: [Row],   // trained in B, not in A
    dropped:    [Row],   // trained in A, not in B
    kept:       [Row + { sessions: Change, volumeKg: Change }]
  },
  shape: { daysA, daysB, equalLength, lengthRatio },
  flags: { emptyA, emptyBoth, emptyB, identical, overlapping, reversed }
}

PeriodStats = { start, end, days, workouts, volumeKg, exerciseCount,
                perWeek, volumePerWeek, repRange, muscle }
```

`PeriodStats.repRange` is `repRangeCounts(...)` verbatim and `.muscle` is
`muscleVolume(...)` verbatim. `exerciseCount` and the per-exercise rows come from
`rankExercises(..., { mode: 'frequency' })`, so "sessions" means the same thing
here as on the dashboard: distinct workouts containing at least one working set.

### Change — the percent-change shape

One helper, used for every delta, because a zero baseline is the common case
when comparing a quiet period with a busy one:

```js
change(from, to) → { from, to, abs: to - from, pct, kind }
```

| Condition | `kind` | `pct` | Shown as |
|---|---|---|---|
| `from > 0`, `to > 0` | `change` | `(to-from)/from*100` | `+42%` / `−18%` |
| `from === 0`, `to > 0` | `new` | `null` | `new` |
| `from > 0`, `to === 0` | `gone` | `-100` | `none in B` |
| `from === 0`, `to === 0` | `none` | `0` | `—` |

`pct` is **never** `Infinity` or `NaN`. Callers must branch on `kind`, not on the
number.

### Period length

Periods of different lengths are compared honestly or not at all:

- `shape.equalLength` is true when the two durations are within one day of each
  other (a month-vs-month comparison differs by up to 3 days and should not be
  flagged as incomparable).
- When false, `shape.lengthRatio = daysB / daysA`, the UI shows a plain
  explanation, and **per-week rates lead** — `perWeek` and `volumePerWeek` — with
  the raw totals demoted, because a 12-week period will always out-total a
  4-week one and saying so is not information.

### "Same length, immediately before"

```js
precedingRange(range) → { start: range.start - duration, end: range.start - 1 }
```

`end` is one millisecond before the later period starts, so the two never
overlap under the inclusive filter every other range in the app uses. This is
the default for Period A when the screen opens, and a one-tap button otherwise.

### Edge cases, each handled explicitly

| Case | Behaviour |
|---|---|
| Both periods empty | Single empty state: nothing logged in either period. No zero-vs-zero table. |
| Period A empty | Comparison still renders; every delta is `kind: 'new'`, and the copy says A had no sessions rather than claiming infinite growth. |
| Period B empty | Renders; deltas are `kind: 'gone'`. Stated as "nothing logged in Period B", not as a −100% collapse. |
| Identical ranges | Detected before rendering; the screen says the two periods are the same range and every delta is zero by definition. |
| Overlapping ranges | Rendered with a plain note that the periods share days, so sessions are counted in both. Not blocked — comparing "last 3 months" with "last month" is a reasonable thing to ask for. |
| A after B (reversed) | Flagged. The screen keeps the user's order and says which period is the later one, rather than silently swapping their choice. |
| Single-session period | Works. `perWeek` is still defined because it divides by the period length, not by the gap between sessions. |
| Deleted exercise | Dropped from the exercise lists by `rankExercises`, as everywhere else. |
| Merged exercise | Already projected to the surviving id before any screen sees it; counted once. |
| Custom exercise | Appears normally; no tier or ranking is needed here. |
| Bodyweight (no load) | Contributes sessions but zero volume. Must not be reported as a volume collapse. |
| Zero-length range | `days` floors at 1 so the per-week rate cannot divide by zero. |

### UI

A **drill-down screen** (`pages/TrainingEvolution.jsx`), opened from one compact
entry card on Progress, in the same way `ExerciseDetail` already works. The
dashboard gains one card and no new section.

- Two period pickers, presets from the shared timeframes registry plus a custom
  range with date inputs — the pattern `ProgressShareCard` already uses.
- Declines render in neutral ink. Only gains take the accent. A decline is
  information, not an alarm.
- `DistributionBars` (exported from `Chart.jsx`, previously unused) carries the
  rep-range and muscle mixes.
- Real data only. No illustrative or placeholder figures anywhere.

---

## Feature B — Training Intelligence v1

### Interface

```js
buildHighlights(workouts, exercises, range) → {
  improving:    [{ exercise, trend, sentence }],  // up to 3, biggest % first
  steady:       [{ exercise, trend, sentence }],  // up to 3
  tooVariable:  { count, names },                 // trend status 'noisy'
  needMoreData: { count, byReason: { too_few_sessions, span_too_short, no_load } },
  sentences:    { needMoreData: string|null, tooVariable: string|null }
}
```

Built entirely on `rankExercises(..., { mode: 'progression' })` — its `rows` are
already sorted by percentage gained, and its `withheld` already carries each
lift's reason. **No new thresholds.** Improving, steady, noisy and insufficient
mean exactly what `classifyTrend` decided they mean.

"Too little data" counts only `status: 'insufficient'`. A `noisy` lift has plenty
of data and is reported separately — conflating the two would tell a lifter to
train more when the actual problem is that their numbers jump around.

### Sentences

Deterministic templates. No external AI. Every sentence is assembled from values
the trend already computed and states what it is based on:

```
improving     "Back Squat: +7.5% over 3 weeks, 4 sessions"
steady        "Leg Curl: within 2% over 4 weeks, 5 sessions"
tooVariable   "Bench Press is too variable to call (6 sessions)"
needMoreData  "5 lifts need more data: 4 under 4 sessions, 1 with no load logged"
```

The steady template names `TREND_FLAT_PCT`; the need-more-data template names
`TREND_MIN_SESSIONS`. Both read the constants rather than restating the numbers,
so tuning a threshold cannot leave the copy lying.

Placement: inside the Training Evolution drill-down, computed over **Period B**
— the recent period, which is the one a highlight is about.

---

## Tests

New: `test/trainingEvolution.test.mjs`, `test/highlights.test.mjs`.

Required cases: zero baseline in both directions; unequal period lengths and the
per-week normalisation; identical periods; no overlap and full overlap; reversed
order; both-empty and one-empty; single-session periods; deleted, merged and
custom exercises; bodyweight lifts contributing sessions but no volume; and that
every sentence contains the numbers it claims to be based on.

Regression: `compareTrainingPeriods` must return exactly `repRangeCounts` and
`muscleVolume` output for each period, asserted by calling those functions
directly — the guard against a fourth copy of either appearing here.

---

## Cleanup in this phase

1. The Share Card's "Personal Records" heading becomes **"Biggest Improvements"**.
   It shows period e1RM improvement over a baseline, which is not the app's PR
   definition. `summary.prs` and the `'prs'` metric id are unchanged.
2. `socialSummary.buildLiftsSummary` gains a comment explaining why it keeps its
   own heaviest-weight-wins rule rather than deferring to `prs.js`.
3. The empty-history and one-session states verified in a browser against an
   isolated fixture profile — never by clearing the real IndexedDB.
