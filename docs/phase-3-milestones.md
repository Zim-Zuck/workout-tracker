# Milestones

A milestone is a round number you have crossed, **and the day you crossed it**.
That date is the whole point: the app already tells you that you have done 54
workouts, and already shows a "Workhorse — 50 workouts" badge. Neither can tell
you that the 50th was on 12 March, which is the thing a person actually wants
back out of two years of logging.

## Why this is not an extension of `achievements.js`

`achievements.js` has a hard rule at the top of the file: an achievement must be
decidable from `stats` and `lifts` alone, because those two objects are the whole
published social summary and the same function has to evaluate a friend's
profile. A date-reached cannot come out of that summary — it needs the raw set
history — so an achievement can never carry one. Milestones read the local
history directly and therefore only ever describe **you**.

Three of them do overlap in subject with an existing achievement: `workhorse`
(50 workouts), `consistent` (an 8-week streak) and `hundred_tonnes` (100 t). The
overlap is deliberate and kept apart by screen and by shape — Achievements is a
grid of named one-off badges on Profile, mostly about specific lifts; Milestones
is a dated ladder on Progress. They are not merged because merging them would
mean either giving up the dates or giving up friends' profiles.

## The function

```js
milestonesFor(workouts, { asOf = Date.now() })
  → { achieved, next, currentStreak, bestStreak, totals }
```

Pure, no I/O, no React. See **Deviation** below on the dropped `exercises`
argument.

`achieved` — every crossed threshold, **newest first**, each:

```js
{ category, threshold, date, workoutId, label, dateLabel }
```

`date` is taken from the workout that crossed it, never from `asOf`. The 100th
workout's milestone is dated the day of the 100th workout even if you compute it
two years later.

`next` — at most one entry per category, the nearest uncrossed threshold,
**sorted by progress descending** so `next[0]` is the one closest to falling:

```js
{ category, threshold, current, remaining, pct, label, progressLabel, lapsed }
```

A category with nothing left (every threshold crossed) contributes no entry.
`pct` is clamped to 0–100 and is always a finite number.

## The thresholds, and why each one

All exported as constants.

### `WORKOUT_MILESTONES = [10, 25, 50, 100, 250, 500]`
Counted as finished workouts. 10 is the first point at which logging has become
a habit rather than an experiment; after that each step is roughly 2–2.5x the
last, so a milestone always takes months rather than weeks to reach and never
arrives twice in a fortnight.

### `STREAK_MILESTONES = [4, 8, 12, 26, 52]`
Consecutive weeks containing at least one session, as `computeStreak` defines a
streak (including its one-week grace). 4 is a month, 12 a quarter, 26 half a
year, 52 a year — every one of them is a unit a person already thinks in. 8 is
there because the gap from 4 to 12 is otherwise the longest unrewarded stretch on
the ladder.

### `VOLUME_MILESTONES_KG = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]`
Cumulative working volume — `workingVolume` summed over every finished workout,
so warm-ups are excluded exactly as they are everywhere else. Round in **tonnes**
(10 t, 50 t, 100 t, 250 t, 500 t, 1000 t), because that is the unit the app
already switches to for lifetime totals (`compactVolume`). A typical hard session
moves 5–10 t, so 10 t lands in the first week or two and 1000 t is a genuine
career number.

### `PR_MILESTONES = [1, 10, 25, 50, 100]`
Lifetime count of personal records, taken from `prs.prTimeline(workouts)` and
nowhere else — this file does not contain and must never contain its own idea of
what a PR is. 1 is included because a first PR is a real event and arrives on day
one or two, which makes the row non-empty for a new user.

### Per-lift best e1RM thresholds — **deliberately not built**

The brief allowed these "only if this can be done without noise". They cannot be:

- A fixed ladder cannot apply across lifts. 100 kg is a landmark on a bench, a
  warm-up on a leg press and physically impossible on a lateral raise. With 72
  exercises in a real library, one ladder would fire constantly on the big
  compounds and never on anything else.
- Keying thresholds to specific lifts means matching exercises by id or name.
  Users create and merge their own, so the match is fragile — and
  `achievements.js` already covers exactly that ground (bench 100, squat 100,
  deadlift 180, big three 400) for the three lifts where it is safe.
- The underlying number is an *estimate*. A rep-capped set of 12 can push e1RM
  across a threshold without anything heavier having been lifted, so the
  milestone would sometimes commemorate arithmetic.

So the category is omitted rather than shipped noisy. Named-lift landmarks stay
where they already work, in Achievements.

## Edge cases, and what each one does

| Case | Behaviour |
|---|---|
| Empty history | `achieved` is `[]`; `next` is the first threshold of each category with `current: 0`. The UI renders nothing at all. |
| One workout | Nothing achieved except possibly a first PR (a first session's lifts have no history to beat, so usually not even that). `next[0]` is whichever first threshold is proportionally closest. |
| Lapsed streak | The next streak threshold is the smallest one **above the current streak**, not above the best ever — so after a break it is something reachable, not the 52 weeks you were heading for. `lapsed` is `true` whenever `currentStreak < bestStreak`, and the copy then says what the best was. |
| Merged or deleted exercises | Not consulted. Every number comes from workouts and their sets; a set whose `exerciseId` no longer resolves still counts toward volume, workout count and PRs. |
| Bodyweight lifts with no load | Count as workouts and as sessions; contribute 0 to volume. Never `NaN`. |
| Same-day workouts | Both count. Workouts are ordered by `(date, id)` so the "10th workout" is deterministic, and two milestones can legitimately share a date. |
| Active (in-progress) workout | Filtered out, so a milestone cannot be announced mid-session and then taken back. |
| Zero or negative weights | Flow through `workingVolume` unchanged; the running total is clamped at each step so a negative entry cannot make a crossed milestone un-cross. |

## UI

A one-row strip on **Progress**, directly under the four lifetime stat blocks —
the same part of the screen that already answers "how much have I done in
total". Not a new dashboard section, and no new screen.

- Up to three most recent achievements, newest first, each stating exactly what
  was reached and when: *"100 workouts · 12 Mar 2026"*.
- Then one "next up" line with its progress: *"Next: 250 workouts — 150 to go"*.
- No confetti, no badges, no celebration chrome. It is a record, not a reward.
- Hidden entirely when there is nothing achieved and nothing meaningfully in
  progress.

## Deviation from the brief

The brief specified `milestonesFor(workouts, exercises, { asOf })`. `exercises`
is not taken, because nothing in the function needs it: workout count, volume,
streak and PR count all come from workouts and their sets, and keeping the
parameter would mean an argument that exists only to be ignored. This is also
what makes the "merged and deleted exercises" edge case free rather than
something to handle.
