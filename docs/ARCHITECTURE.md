# The Progress area: who owns which calculation

The rule this document exists to enforce: **every number has exactly one
function that decides it, and every screen asks that function.** The area has
been through four rounds of consolidation and each one started the same way —
two screens showing different answers to the same question because each had
grown its own copy of the arithmetic.

If you are adding something here, the question to answer first is not "where
does this go" but "does this number already have an owner". If it does, call it.

## The ownership table

| Question | Owner | Notes |
|---|---|---|
| Is this set working? | `calculations.isWorking` | Completed and not a warm-up. |
| What is a set worth? | `calculations.setVolume` | Total: non-finite inputs become 0. |
| What is a session worth? | `calculations.workingVolume` | Working sets only. |
| Estimated 1RM | `calculations.estimate1RM` | Epley, capped at `E1RM_REP_CAP` (12). Total. |
| Best set of a session | `calculations.bestWorkingSet` | By e1RM. |
| Strength over time | `calculations.bestSetSeries` / `e1rmSeries` | One observation per session, never per set. |
| Muscle split | `calculations.muscleVolume` | |
| Rep-range buckets | `calculations.repRangeCounts` | Buckets are `REP_RANGES`. |
| Weekly streak | `calculations.computeStreak` | One grace week. Always as-of a moment you pass in. |
| **Is this a PR?** | `prs.js` — **and nothing else** | `prKindFrom`, `sessionPRForExercise`, `sessionPRs`, `prTimeline`. `calculations.detectPRs` is an implementation detail of `prs.js` and must not be called directly. |
| Best e1RM ever, one lift | `prs.bestE1RM` | |
| What does a timeframe id mean? | `timeframes.WINDOWS` | `6m` is 182 days everywhere, defined once. |
| Timeframe → window | `timeframes.rangeFor` / `resolveRange` | `resolveRange` adds `all` and custom; `rangeFor` is the simple one. |
| Two date inputs → a window | `timeframes.customRange` / `localDayBounds` | Local midnight to local end-of-day. Never `new Date('YYYY-MM-DD')`, which is UTC. |
| A custom range, written out | `timeframes.formatDayRange` | The year is a parameter, not an accident. |
| Is this lift trending? | `exerciseStats.classifyTrend` | Least-squares over `e1rmSeries`. |
| **May a screen report that trend?** | `exerciseStats.trendWithholdReason` | Returns `null` or a reason key. `isRankableTrend` is defined in terms of it. |
| How regular is this lift? | `exerciseStats.exerciseConsistency` | CV of the gaps, banded. |
| Rank the roster | `exerciseStats.rankExercises` | Three modes; unreportable rows come back as `withheld`, never dropped. |
| What improved this period? | `exerciseStats.buildHighlights` | |
| Two periods, side by side | `trainingEvolution.compareTrainingPeriods` | Compares; computes nothing of its own. |
| What have I reached, and when? | `milestones.milestonesFor` | Counts and dates; decides nothing. |
| Share-card figures | `progressSummary.buildProgressSummary` | |
| Lifetime / week / month totals | `hooks/useWorkoutTotals` | The one totals source for every screen. |

## Layers

```
utils/        date, units, ids. No app concepts.
  ↑
calculations.js   the arithmetic. Pure, total, no opinions.
timeframes.js     what a window is, and how a date input becomes one.
  ↑
prs.js            the only authority on "is this a PR?"
exerciseStats.js  trend, consistency, ranking, highlights
  ↑
trainingEvolution.js  compares two periods
milestones.js         counts and dates round numbers
progressSummary.js    assembles the share card's figures
  ↑
pages/ and components/   ask the above; format for the screen
```

Dependencies point up this list and never down or sideways within a tier.
`milestones.js` imports `calculations`, `prs` and `utils`; it does not import
`exerciseStats`, and `exerciseStats` does not import it.

## Three rules that are not obvious

**1. A service returns numbers and locale-free strings; a component formats
dates.** `milestonesFor` returns a raw timestamp and a label like
`"100 workouts"`; `MilestonesRow` turns the timestamp into "Nov 16, 2026". A
locale-dependent string baked into a pure function makes its tests depend on the
machine they run on. `progressSummary` is the exception and only because the
share card's canvas needs finished strings.

**2. Withheld, not dropped.** When a calculation cannot answer — too few
sessions, no load logged, a rep-capped estimate — it says so with a reason
rather than returning a shorter list. A screen can then say "7 need more data"
instead of quietly showing less. `rankExercises().withheld` and
`classifyTrend().status === 'insufficient'` are both this.

**3. Classification and permission are different questions.** `classifyTrend`
says what the data looks like; `trendWithholdReason` says whether a screen may
report it. They were conflated once and the screens disagreed for it: a
rep-capped lift was ranked as "+8.2%" on Progress while ExerciseDetail called
the same lift untrackable.

## Where the screens live

- **Progress** — the dashboard. Stat tiles, the Milestones row, the window
  picker, charts, the exercise roster, and entry points to the drill-downs. It
  stays compact: new things go into a drill-down, not into another section here.
- **ExerciseDetail**, **TrainingEvolution**, **ProgressShareCard** — behind a
  tap, and `React.lazy`-loaded for it. None is in the initial bundle.
- **MilestonesRow** is deliberately not lazy: about a kilobyte, imports nothing
  the dashboard does not already hold, and renders above the fold.

## Tests

`test/fuzz.test.mjs` runs the four analysis functions over randomised histories
and asserts that no `NaN`, `Infinity` or throw ever reaches the UI. It is the
test that catches a new calculation forgetting rule 2 above, and it found the
non-finite `weightKg` that `setVolume` and `estimate1RM` used to pass through.
Run it before changing anything in `calculations.js`.
