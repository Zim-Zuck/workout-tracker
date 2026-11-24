// EXERCISE RANKINGS — the same roster the dashboard always showed, now
// orderable three ways. Frequency is what it did before; volume and progression
// are new.
//
// Every tie-break level is exercised, because an unstable sort makes a list
// reshuffle between renders for no reason the user can see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankExercises, progressionPossible, RANKING_MODES, TREND_MIN_SPAN_DAYS, TREND_MIN_SESSIONS,
  classifyTrend, isRankableTrend, trendWithholdReason, buildHighlights
} from '../src/services/exerciseStats.js';
import { windowDays } from '../src/services/timeframes.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 11, 12, 0).getTime();

const set = (exerciseId, weightKg, reps, i = 0) => ({
  id: `s_${exerciseId}_${i}`, exerciseId, type: 'working', weightKg, reps, completed: true, timestamp: i
});

const EXERCISES = [
  { id: 'a', name: 'Alpha Press', muscleGroups: ['Chest'] },
  { id: 'b', name: 'Bravo Row', muscleGroups: ['Back'] },
  { id: 'c', name: 'Charlie Curl', muscleGroups: ['Biceps'] }
];

// n weekly sessions of one exercise, ending at NOW, with the given weights.
const weekly = (exerciseId, weights) => weights.map((weightKg, i) => ({
  id: `${exerciseId}${i}`,
  date: NOW - (weights.length - 1 - i) * 7 * DAY,
  sets: [set(exerciseId, weightKg, 5, i)]
}));

// The same, with the reps given per session — the rep-capped cases need them.
const weeklyWithReps = (exerciseId, pairs) => pairs.map(([weightKg, reps], i) => ({
  id: `${exerciseId}${i}`,
  date: NOW - (pairs.length - 1 - i) * 7 * DAY,
  sets: [set(exerciseId, weightKg, reps, i)]
}));

// Merges several per-exercise histories onto shared dates.
const merge = (...lists) => {
  const byDate = new Map();
  for (const list of lists) {
    for (const w of list) {
      const existing = byDate.get(w.date);
      if (existing) existing.sets.push(...w.sets);
      else byDate.set(w.date, { id: `w${w.date}`, date: w.date, sets: [...w.sets] });
    }
  }
  return [...byDate.values()].sort((x, y) => x.date - y.date);
};

test('the declared modes are the ones it accepts', () => {
  assert.deepEqual(RANKING_MODES, ['frequency', 'volume', 'progression']);
});

// ------------------------------------------------------------- frequency ----

test('frequency counts distinct sessions, not sets', () => {
  const workouts = [
    { id: 'w1', date: NOW - 7 * DAY, sets: [set('a', 100, 5, 1), set('a', 100, 5, 2), set('a', 100, 5, 3)] },
    { id: 'w2', date: NOW, sets: [set('b', 50, 10, 1)] }
  ];
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'frequency' });
  // Three sets of Alpha in one session is one session, so Bravo's single
  // session ties it — and the tie breaks on volume, where Alpha wins.
  assert.deepEqual(rows.map((r) => [r.exercise.id, r.sessions]), [['a', 1], ['b', 1]]);
  assert.equal(rows[0].volumeKg, 1500);
});

test('frequency orders by sessions, then volume, then recency, then name', () => {
  const workouts = [
    // a: 3 sessions. b: 2 sessions. c: 2 sessions, less volume than b.
    { id: 'w1', date: NOW - 21 * DAY, sets: [set('a', 10, 1, 1)] },
    { id: 'w2', date: NOW - 14 * DAY, sets: [set('a', 10, 1, 1), set('b', 100, 10, 2), set('c', 1, 1, 3)] },
    { id: 'w3', date: NOW - 7 * DAY, sets: [set('a', 10, 1, 1), set('b', 100, 10, 2), set('c', 1, 1, 3)] }
  ];
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'frequency' });
  assert.deepEqual(rows.map((r) => r.exercise.id), ['a', 'b', 'c']);
});

test('frequency falls back to recency, then to the name', () => {
  // Identical sessions and identical volume; b trained more recently.
  const workouts = [
    { id: 'w1', date: NOW - 7 * DAY, sets: [set('a', 100, 5, 1)] },
    { id: 'w2', date: NOW, sets: [set('b', 100, 5, 1)] }
  ];
  assert.deepEqual(
    rankExercises(workouts, EXERCISES, { mode: 'frequency' }).rows.map((r) => r.exercise.id),
    ['b', 'a']
  );

  // Identical in every respect including the date: only the name is left.
  const sameDay = [{ id: 'w1', date: NOW, sets: [set('b', 100, 5, 1), set('a', 100, 5, 2)] }];
  assert.deepEqual(
    rankExercises(sameDay, EXERCISES, { mode: 'frequency' }).rows.map((r) => r.exercise.id),
    ['a', 'b']
  );
});

// ---------------------------------------------------------------- volume ----

test('volume orders by total working volume, then sessions, then name', () => {
  const workouts = [
    { id: 'w1', date: NOW - 7 * DAY, sets: [set('a', 100, 10, 1), set('b', 50, 5, 2)] },
    { id: 'w2', date: NOW, sets: [set('b', 50, 5, 1), set('b', 50, 5, 2)] }
  ];
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'volume' });
  assert.deepEqual(rows.map((r) => [r.exercise.id, r.volumeKg]), [['a', 1000], ['b', 750]]);
});

test('volume sums every working set, not just the best one', () => {
  const workouts = [{ id: 'w1', date: NOW, sets: [set('a', 100, 5, 1), set('a', 80, 10, 2), set('a', 60, 15, 3)] }];
  assert.equal(rankExercises(workouts, EXERCISES, { mode: 'volume' }).rows[0].volumeKg, 500 + 800 + 900);
});

test('warm-ups and unchecked sets are in no ranking', () => {
  const workouts = [{
    id: 'w1', date: NOW, sets: [
      { ...set('a', 500, 5, 1), type: 'warmup' },
      { ...set('a', 500, 5, 2), completed: false },
      set('b', 10, 1, 3)
    ]
  }];
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'volume' });
  assert.deepEqual(rows.map((r) => r.exercise.id), ['b']);
});

// ------------------------------------------------------------ plumbing -----

test('an exercise deleted from the library is dropped, not shown unnamed', () => {
  const workouts = [{ id: 'w1', date: NOW, sets: [set('a', 100, 5, 1), set('ex_gone', 100, 5, 2)] }];
  for (const mode of RANKING_MODES) {
    const { rows, withheld } = rankExercises(workouts, EXERCISES, { mode });
    const ids = [...rows, ...withheld].map((r) => r.exercise.id);
    assert.ok(!ids.includes('ex_gone'), `${mode} kept a deleted exercise`);
    assert.ok(ids.includes('a'));
  }
});

test('a merged exercise counts once, as the id its sets now carry', () => {
  // useWorkout projects merged ids before any screen sees them, so by the time
  // this runs both sessions already read as the surviving exercise.
  const workouts = [
    { id: 'w1', date: NOW - 7 * DAY, sets: [set('a', 100, 5, 1)] },
    { id: 'w2', date: NOW, sets: [set('a', 100, 5, 1)] }
  ];
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'frequency' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessions, 2);
});

test('the range filter applies to every mode', () => {
  const workouts = [
    { id: 'old', date: NOW - 200 * DAY, sets: [set('a', 100, 5, 1)] },
    { id: 'new', date: NOW, sets: [set('b', 10, 1, 1)] }
  ];
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'frequency', start: NOW - 28 * DAY, end: NOW });
  assert.deepEqual(rows.map((r) => r.exercise.id), ['b']);
});

test('an empty history ranks nothing, in every mode', () => {
  for (const mode of RANKING_MODES) {
    const { rows, withheld } = rankExercises([], EXERCISES, { mode });
    assert.deepEqual(rows, []);
    assert.deepEqual(withheld, []);
  }
});

test('an exercise map is accepted as well as an array', () => {
  const workouts = [{ id: 'w1', date: NOW, sets: [set('a', 100, 5, 1)] }];
  const viaMap = rankExercises(workouts, new Map(EXERCISES.map((e) => [e.id, e])), { mode: 'volume' });
  const viaArray = rankExercises(workouts, EXERCISES, { mode: 'volume' });
  assert.deepEqual(viaMap.rows.map((r) => r.exercise.id), viaArray.rows.map((r) => r.exercise.id));
});

test('frequency and volume do not pay for a trend they never use', () => {
  const workouts = weekly('a', [100, 104, 108, 112]);
  for (const mode of ['frequency', 'volume']) {
    assert.equal(rankExercises(workouts, EXERCISES, { mode }).rows[0].trend, undefined);
  }
});

// ----------------------------------------------------------- progression ----

test('progression orders by percentage gained, biggest first', () => {
  // a climbs 20%, b climbs 5%, c is flat. All six sessions over 35 days.
  const workouts = merge(
    weekly('a', [100, 104, 108, 112, 116, 120]),
    weekly('b', [100, 101, 102, 103, 104, 105]),
    weekly('c', [100, 100, 100, 100, 100, 100])
  );
  const { rows, withheld } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  assert.deepEqual(withheld, []);
  assert.deepEqual(rows.map((r) => r.exercise.id), ['a', 'b', 'c']);
  assert.deepEqual(rows.map((r) => r.trend.status), ['improving', 'improving', 'steady']);
  assert.ok(rows[0].trend.pctChange > rows[1].trend.pctChange);
});

test('a declining lift ranks last, and is still ranked', () => {
  const workouts = merge(
    weekly('a', [100, 104, 108, 112, 116, 120]),
    weekly('b', [120, 116, 112, 108, 104, 100])
  );
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  assert.deepEqual(rows.map((r) => r.exercise.id), ['a', 'b']);
  assert.equal(rows[1].trend.status, 'declining');
  assert.ok(rows[1].trend.pctChange < 0);
});

test('progression ties break on the strength of the fit, then volume, then name', () => {
  // Two lifts with the same percentage gain; a's line fits perfectly, b's does
  // not, so a is the better-supported claim and ranks first.
  const workouts = merge(
    weekly('a', [100, 104, 108, 112, 116, 120]),
    weekly('b', [100, 115, 101, 118, 103, 120])
  );
  const { rows } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  const a = rows.find((r) => r.exercise.id === 'a');
  const b = rows.find((r) => r.exercise.id === 'b');
  if (b && Math.abs(a.trend.pctChange - b.trend.pctChange) < 1e-9) {
    assert.ok(a.trend.r2 > b.trend.r2);
    assert.equal(rows[0].exercise.id, 'a');
  } else {
    // Not an exact tie — then the ordering must simply follow the percentage.
    assert.ok(rows[0].trend.pctChange >= rows[rows.length - 1].trend.pctChange);
  }
});

test('lifts whose trend cannot be called are withheld with a reason, not dropped', () => {
  const workouts = merge(
    weekly('a', [100, 104, 108, 112, 116, 120]),  // rankable
    weekly('b', [100, 105]),                      // too few sessions
    weekly('c', [0, 0, 0, 0, 0, 0])               // no recorded load
  );
  const { rows, withheld } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  assert.deepEqual(rows.map((r) => r.exercise.id), ['a']);
  assert.equal(withheld.length, 2);
  const byId = new Map(withheld.map((r) => [r.exercise.id, r]));
  assert.equal(byId.get('b').status, 'insufficient');
  assert.equal(byId.get('b').reason, 'too_few_sessions');
  assert.equal(byId.get('c').reason, 'no_load');
  // Withheld rows keep their counted numbers, so a screen can still name them.
  assert.equal(byId.get('b').sessions, 2);
  assert.ok(byId.get('b').exercise.name);
});

test('a noisy lift is withheld from the ranking but not called insufficient', () => {
  const workouts = merge(weekly('a', [100, 140, 95, 145, 105, 150, 100, 155]));
  const { rows, withheld } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  assert.deepEqual(rows, []);
  assert.equal(withheld.length, 1);
  assert.equal(withheld[0].status, 'noisy');
  // `reason` used to be null here, carried straight off the trend. Every
  // withheld row now names WHY it was withheld, so a screen grouping them never
  // has to fall back to the status to find a key — and the rep-capped case,
  // which has an ordinary status and no trend reason at all, has somewhere to
  // go. The status assertion above is the one this test is really about.
  assert.equal(withheld[0].reason, 'noisy');
});

test('withheld rows are ordered by how much data they do have', () => {
  const workouts = merge(weekly('a', [100, 105]), weekly('b', [100, 105, 110]));
  const { withheld } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  assert.deepEqual(withheld.map((r) => r.exercise.id), ['b', 'a']);
});

test('every lift needs its own minimum, not the roster\'s', () => {
  // a has enough sessions, b does not, in the same history.
  const workouts = merge(weekly('a', [100, 104, 108, 112]), weekly('b', [100, 105, 110]));
  const { rows, withheld } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessions, TREND_MIN_SESSIONS);
  assert.equal(withheld.length, 1);
});

// --------------------------------------------- the 2-week window problem ----

test('progression is impossible on a window shorter than the minimum span', () => {
  assert.equal(progressionPossible(windowDays('2w')), false);
  assert.equal(progressionPossible(windowDays('4w')), true);
  assert.equal(progressionPossible(windowDays('6w')), true);
  assert.equal(progressionPossible(windowDays('1y')), true);
  // `all` has no day count, and is always long enough by definition.
  assert.equal(progressionPossible(windowDays('all')), true);
  assert.ok(windowDays('2w') < TREND_MIN_SPAN_DAYS);
});

test('asked anyway on a 2-week window, it withholds everything rather than inventing', () => {
  // Weekly training: only three sessions land inside two weeks, so the session
  // minimum is what stops it first.
  const sparse = merge(weekly('a', [100, 104, 108, 112, 116, 120]));
  const sparseResult = rankExercises(sparse, EXERCISES, { mode: 'progression', start: NOW - 14 * DAY, end: NOW });
  assert.deepEqual(sparseResult.rows, []);
  assert.equal(sparseResult.withheld.length, 1);
  assert.equal(sparseResult.withheld[0].reason, 'too_few_sessions');

  // Training every three days: plenty of sessions inside the window, but they
  // span only twelve days, so the span minimum is what stops it. Either way
  // nothing is ranked on two weeks of data.
  const dense = [100, 103, 106, 109, 112, 115].map((weightKg, i) => ({
    id: `d${i}`, date: NOW - (5 - i) * 3 * DAY, sets: [set('a', weightKg, 5, i)]
  }));
  const denseResult = rankExercises(dense, EXERCISES, { mode: 'progression', start: NOW - 14 * DAY, end: NOW });
  assert.deepEqual(denseResult.rows, []);
  assert.equal(denseResult.withheld.length, 1);
  assert.ok(denseResult.withheld[0].trend.sessions >= TREND_MIN_SESSIONS);
  assert.equal(denseResult.withheld[0].reason, 'span_too_short');
});

// ONE ANSWER ABOUT WHAT A TREND LICENSES A SCREEN TO SAY.
//
// ExerciseDetail's chip checked `repCapped` before the direction and said
// "High-rep work — est. 1RM can't track this". The Best-progress ranking and
// the Evolution highlights looked only at `status`, so the same lift was ranked
// and printed as a percentage on one screen and declared untrackable on
// another. trendWithholdReason is now the single answer all three ask.
test('a rep-capped lift is withheld from the ranking, not printed as a percentage', () => {
  // Fixed weight, reps climbing past the 12-rep cap: the estimate stops
  // responding, so the fitted line is an artefact of the formula.
  const sessions = [[50, 13], [50, 15], [50, 17], [50, 19], [50, 20], [50, 22]];
  const workouts = merge(weeklyWithReps('a', sessions));
  const trend = classifyTrend(workouts, 'a', { start: -Infinity, end: Infinity });
  // The classification itself is unchanged — the line really is steady.
  assert.equal(trend.repCapped, true);
  assert.equal(trend.status, 'steady');
  // What changed is what the screens are allowed to do with it.
  assert.equal(trendWithholdReason(trend), 'rep_capped');
  assert.equal(isRankableTrend(trend), false);

  const { rows, withheld } = rankExercises(workouts, EXERCISES, { mode: 'progression' });
  assert.deepEqual(rows.map((r) => r.exercise.id), [], 'a rep-capped lift must not be ranked');
  assert.equal(withheld.length, 1);
  assert.equal(withheld[0].reason, 'rep_capped');
});

test('trendWithholdReason gives every unreportable trend a key, and reportable ones none', () => {
  const rankable = classifyTrend(merge(weekly('a', [100, 104, 108, 112])), 'a', { start: -Infinity, end: Infinity });
  assert.equal(trendWithholdReason(rankable), null);
  assert.equal(isRankableTrend(rankable), true);

  const tooFew = classifyTrend(merge(weekly('a', [100, 105])), 'a', { start: -Infinity, end: Infinity });
  assert.equal(trendWithholdReason(tooFew), 'too_few_sessions');

  const noisy = classifyTrend(merge(weekly('a', [100, 140, 95, 145, 105, 150, 100, 155])), 'a', { start: -Infinity, end: Infinity });
  assert.equal(trendWithholdReason(noisy), 'noisy');
});

test('a rep-capped lift is reported as needing data in the highlights, not dropped silently', () => {
  const workouts = merge(weeklyWithReps('a', [[50, 13], [50, 15], [50, 17], [50, 19], [50, 20], [50, 22]]));
  const h = buildHighlights(workouts, EXERCISES, { start: -Infinity, end: Infinity });
  assert.deepEqual(h.improving, []);
  assert.deepEqual(h.steady, []);
  assert.equal(h.needMoreData.count, 1);
  assert.equal(h.needMoreData.byReason.rep_capped, 1);
  assert.match(h.sentences.needMoreData, /est\. 1RM stops tracking/);
});
