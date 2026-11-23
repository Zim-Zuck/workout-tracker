// THE CANONICAL PROGRESS METRICS.
//
// Muscle distribution, rep-range distribution and the e1RM series each existed
// twice: once inline in Progress.jsx's memos and once privately in
// progressSummary.js. The two copies of each agreed by luck, not by
// construction.
//
// EVERY NUMBER IN THIS FILE WAS CAPTURED FROM THE OLD IMPLEMENTATIONS before
// they were deleted, by running them over test/fixtures/trainingFixture.mjs.
// They are not what the new code happens to produce — they are what the old
// code did produce, which is the only thing that makes this a regression test
// rather than a restatement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  muscleVolume, repRangeCounts, e1rmSeries, REP_RANGES, estimate1RM
} from '../src/services/calculations.js';
import { buildProgressSummary, strengthSeriesFor } from '../src/services/progressSummary.js';
import { computeTotals } from '../src/hooks/useWorkoutTotals.js';
import { WORKOUTS, EXERCISES, START, END, NOW, DAY } from './fixtures/trainingFixture.mjs';

const ALL = { start: -Infinity, end: Infinity };
const WINDOW = { start: START, end: END };

// ---------------------------------------------------------------- muscle ----

test('muscleVolume reproduces the old all-time numbers exactly', () => {
  assert.deepEqual(muscleVolume(WORKOUTS, EXERCISES, ALL), [
    { label: 'Chest', volumeKg: 1041.6666666666665, pct: 19 },
    { label: 'Triceps', volumeKg: 1041.6666666666665, pct: 19 },
    { label: 'Shoulders', volumeKg: 1041.6666666666665, pct: 19 },
    { label: 'Biceps', volumeKg: 920, pct: 16 },
    { label: 'Quads', volumeKg: 637.5, pct: 11 },
    { label: 'Glutes', volumeKg: 637.5, pct: 11 },
    { label: 'Back', volumeKg: 300, pct: 5 }
  ]);
});

test('muscleVolume reproduces the old windowed numbers exactly', () => {
  assert.deepEqual(muscleVolume(WORKOUTS, EXERCISES, WINDOW), [
    { label: 'Biceps', volumeKg: 920, pct: 28 },
    { label: 'Chest', volumeKg: 537.5, pct: 16 },
    { label: 'Triceps', volumeKg: 537.5, pct: 16 },
    { label: 'Shoulders', volumeKg: 537.5, pct: 16 },
    { label: 'Back', volumeKg: 300, pct: 9 },
    { label: 'Quads', volumeKg: 217.5, pct: 7 },
    { label: 'Glutes', volumeKg: 217.5, pct: 7 }
  ]);
});

test('the dashboard radar still gets the numbers its memo used to compute', () => {
  // Progress.jsx rounds and takes the top eight on top of this; the underlying
  // values are what its own memo produced before the refactor.
  assert.deepEqual(
    muscleVolume(WORKOUTS, EXERCISES, WINDOW).map((m) => ({ label: m.label, value: Math.round(m.volumeKg) })),
    [
      { label: 'Biceps', value: 920 },
      { label: 'Chest', value: 538 },
      { label: 'Triceps', value: 538 },
      { label: 'Shoulders', value: 538 },
      { label: 'Back', value: 300 },
      { label: 'Quads', value: 218 },
      { label: 'Glutes', value: 218 }
    ]
  );
});

test('muscleVolume takes a Map or an array and gives the same answer', () => {
  const asArray = muscleVolume(WORKOUTS, EXERCISES, WINDOW);
  const asMap = muscleVolume(WORKOUTS, new Map(EXERCISES.map((e) => [e.id, e])), WINDOW);
  assert.deepEqual(asMap, asArray);
});

test('volume is split across muscle groups, never duplicated into each', () => {
  // One set, three groups. If it were duplicated the percentages would read
  // 100/100/100 and the chart would claim three times the work actually done.
  const one = [{ id: 'x', date: NOW, sets: [{ exerciseId: 'ex_bench', type: 'working', weightKg: 100, reps: 3, completed: true }] }];
  const out = muscleVolume(one, EXERCISES, ALL);
  assert.deepEqual(out.map((m) => m.volumeKg), [100, 100, 100]);
  assert.equal(out.reduce((a, m) => a + m.volumeKg, 0), 300);
  assert.deepEqual(out.map((m) => m.pct), [33, 33, 33]);
});

test('untagged and deleted exercises are in neither the totals nor the denominator', () => {
  // ex_untagged has no muscleGroups; ex_deleted is not in the library at all.
  // Their volume must not shrink everyone else's share.
  const labels = muscleVolume(WORKOUTS, EXERCISES, ALL).map((m) => m.label);
  assert.ok(!labels.includes(undefined));
  const pctSum = muscleVolume(WORKOUTS, EXERCISES, ALL).reduce((a, m) => a + m.pct, 0);
  assert.ok(Math.abs(pctSum - 100) <= 2, `percentages should sum to about 100, got ${pctSum}`);
});

test('a bodyweight set contributes no volume but does not break the split', () => {
  const bw = [{ id: 'x', date: NOW, sets: [{ exerciseId: 'ex_pullup_bw', type: 'working', weightKg: 0, reps: 10, completed: true }] }];
  assert.deepEqual(muscleVolume(bw, EXERCISES, ALL), [{ label: 'Back', volumeKg: 0, pct: 0 }]);
});

test('muscleVolume on an empty history is an empty list, not a crash', () => {
  assert.deepEqual(muscleVolume([], EXERCISES, ALL), []);
  assert.deepEqual(muscleVolume(undefined, EXERCISES, ALL), []);
});

// ------------------------------------------------------------ rep ranges ----

test('repRangeCounts reproduces the old all-time numbers exactly', () => {
  assert.deepEqual(repRangeCounts(WORKOUTS, ALL), [
    { label: '1–5', count: 9, pct: 60 },
    { label: '6–9', count: 1, pct: 7 },
    { label: '10–14', count: 3, pct: 20 },
    { label: '15+', count: 2, pct: 13 }
  ]);
});

test('repRangeCounts reproduces the old windowed numbers exactly', () => {
  assert.deepEqual(repRangeCounts(WORKOUTS, WINDOW), [
    { label: '1–5', count: 4, pct: 44 },
    { label: '6–9', count: 1, pct: 11 },
    { label: '10–14', count: 2, pct: 22 },
    { label: '15+', count: 2, pct: 22 }
  ]);
});

test('every bucket is returned in fixed order even when empty', () => {
  const out = repRangeCounts([], ALL);
  assert.deepEqual(out.map((r) => r.label), REP_RANGES.map((r) => r.label));
  assert.deepEqual(out.map((r) => r.count), [0, 0, 0, 0]);
  assert.deepEqual(out.map((r) => r.pct), [0, 0, 0, 0]);
});

test('the bucket edges are 5, 9, 14 and above', () => {
  const sets = [5, 6, 9, 10, 14, 15, 40].map((reps, i) => ({
    exerciseId: 'ex_bench', type: 'working', weightKg: 50, reps, completed: true, id: `s${i}`
  }));
  assert.deepEqual(
    repRangeCounts([{ id: 'x', date: NOW, sets }], ALL).map((r) => r.count),
    [1, 2, 2, 2]
  );
});

// ------------------------------------------------- shared set-eligibility ----

test('warm-ups and unchecked sets count toward nothing', () => {
  const sets = [
    { exerciseId: 'ex_bench', type: 'warmup', weightKg: 60, reps: 10, completed: true, id: 'a' },
    { exerciseId: 'ex_bench', type: 'working', weightKg: 200, reps: 1, completed: false, id: 'b' }
  ];
  const only = [{ id: 'x', date: NOW, sets }];
  assert.deepEqual(muscleVolume(only, EXERCISES, ALL), []);
  assert.deepEqual(repRangeCounts(only, ALL).map((r) => r.count), [0, 0, 0, 0]);
  assert.deepEqual(e1rmSeries(only, 'ex_bench'), []);
});

test('range boundaries are inclusive at both ends', () => {
  const at = [{ id: 'x', date: START, sets: [{ exerciseId: 'ex_curl', type: 'working', weightKg: 10, reps: 10, completed: true, id: 'a' }] }];
  assert.equal(repRangeCounts(at, { start: START, end: END })[2].count, 1);
  assert.equal(repRangeCounts(at, { start: START + 1, end: END })[2].count, 0);
  const atEnd = [{ id: 'y', date: END, sets: at[0].sets }];
  assert.equal(repRangeCounts(atEnd, { start: START, end: END })[2].count, 1);
  assert.equal(repRangeCounts(atEnd, { start: START, end: END - 1 })[2].count, 0);
});

// ----------------------------------------------------------- e1RM series ----

test('e1rmSeries reproduces the old all-time series exactly', () => {
  assert.deepEqual(e1rmSeries(WORKOUTS, 'ex_bench'), [
    { date: NOW - 100 * DAY, e1rmKg: 116.66666666666667 },
    { date: NOW - 60 * DAY, e1rmKg: 119.58333333333334 },
    { date: NOW - 20 * DAY, e1rmKg: 122.50000000000001 },
    { date: NOW - 10 * DAY, e1rmKg: 125.41666666666667 },
    { date: NOW - 2 * DAY, e1rmKg: 128.33333333333334 }
  ]);
});

test('e1rmSeries with a range reproduces the old strengthSeriesFor exactly', () => {
  assert.deepEqual(e1rmSeries(WORKOUTS, 'ex_bench', WINDOW), [
    { date: NOW - 20 * DAY, e1rmKg: 122.50000000000001 },
    { date: NOW - 10 * DAY, e1rmKg: 125.41666666666667 },
    { date: NOW - 2 * DAY, e1rmKg: 128.33333333333334 }
  ]);
});

test('the retired strengthSeriesFor wrapper still answers identically', () => {
  // ProgressShareCard calls it positionally and is not being touched.
  assert.deepEqual(strengthSeriesFor(WORKOUTS, 'ex_bench', START, END), e1rmSeries(WORKOUTS, 'ex_bench', WINDOW));
  assert.deepEqual(strengthSeriesFor(WORKOUTS, 'ex_bench', -Infinity, Infinity), e1rmSeries(WORKOUTS, 'ex_bench'));
});

test('no range is the same as an all-encompassing range', () => {
  assert.deepEqual(e1rmSeries(WORKOUTS, 'ex_bench'), e1rmSeries(WORKOUTS, 'ex_bench', ALL));
});

test('e1rmSeries takes the best working set of each session, once per session', () => {
  // Two sets in one workout produce ONE observation, at the better estimate.
  const w = [{ id: 'x', date: NOW, sets: [
    { exerciseId: 'ex_bench', type: 'working', weightKg: 100, reps: 5, completed: true, id: 'a' },
    { exerciseId: 'ex_bench', type: 'working', weightKg: 80, reps: 12, completed: true, id: 'b' }
  ] }];
  const series = e1rmSeries(w, 'ex_bench');
  assert.equal(series.length, 1);
  assert.equal(series[0].e1rmKg, Math.max(estimate1RM(100, 5), estimate1RM(80, 12)));
});

test('a bodyweight lift yields a series of zeroes, not an empty one', () => {
  // The sessions happened; the load is just unrecorded. Callers need to be able
  // to tell "never trained" from "trained with no load".
  const series = e1rmSeries(WORKOUTS, 'ex_pullup_bw');
  assert.equal(series.length, 1);
  assert.equal(series[0].e1rmKg, 0);
});

// --------------------------------------------------------------- streak ----

// THE STREAK IS A PROPERTY OF TODAY, not of the selected period (D1). These
// tests build their own now-relative history, because a streak measured against
// Date.now() over a fixture frozen in 2025 is always 0 and would assert nothing.
const WEEK = 7 * DAY;
const recentHistory = () => {
  const { startOfWeek } = { startOfWeek: (ts) => {
    const d = new Date(ts); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  } };
  const thisWeek = startOfWeek(Date.now());
  // Three consecutive trained weeks ending this week.
  return [0, 1, 2].map((n) => ({
    id: `r${n}`,
    date: thisWeek - n * WEEK + 2 * DAY,
    sets: [{ exerciseId: 'ex_bench', type: 'working', weightKg: 100, reps: 5, completed: true, id: `rs${n}` }]
  }));
};

test('D1: the summary streak is the header streak, on every timeframe', () => {
  const history = recentHistory();
  const expected = computeTotals(history).streakWeeks;
  assert.ok(expected > 0, 'the fixture must actually have a streak to compare');
  for (const timeframeId of ['4w', '3m', '6m', '1y', 'all']) {
    assert.equal(
      buildProgressSummary(history, EXERCISES, { timeframeId }).streakWeeks,
      expected,
      `${timeframeId} disagreed with the header`
    );
  }
});

test("D1: a custom range ending in the past still shows today's streak", () => {
  // This is the one that used to differ: computeStreak was passed the range's
  // end, so the card reported the streak as of a past date under the same word
  // the header uses for today's. A range that predates every session would have
  // read 0 beside a live three-week streak.
  const history = recentHistory();
  const summary = buildProgressSummary(history, EXERCISES, {
    timeframeId: 'custom',
    custom: { from: Date.now() - 200 * DAY, to: Date.now() - 120 * DAY }
  });
  assert.equal(summary.streakWeeks, computeTotals(history).streakWeeks);
  assert.ok(summary.streakWeeks > 0);
});

test('D1: an active session cannot change the streak', () => {
  // useWorkout already filters these out before any screen sees them, so this
  // guards the day somebody moves that filter.
  const history = recentHistory();
  const withActive = [...history, { id: 'live', date: Date.now(), isActive: 1, sets: [] }];
  assert.equal(
    buildProgressSummary(withActive, EXERCISES, { timeframeId: '6m' }).streakWeeks,
    buildProgressSummary(history, EXERCISES, { timeframeId: '6m' }).streakWeeks
  );
});
