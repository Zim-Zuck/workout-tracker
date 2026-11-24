// COMPARING TWO PERIODS.
//
// The two things most likely to go wrong are a zero baseline (which divides by
// zero constantly, because comparing a quiet period with a busy one is the
// normal case) and unequal period lengths (where the totals always favour the
// longer period and saying so is not information). Most of this file is those
// two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTrainingPeriods, change, precedingRange, rangeDays,
  localDayBounds, customRange, EQUAL_LENGTH_TOLERANCE_DAYS
} from '../src/services/trainingEvolution.js';
import { muscleVolume, repRangeCounts } from '../src/services/calculations.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 11, 12, 0).getTime();

const set = (exerciseId, weightKg, reps, i = 0) => ({
  id: `s_${exerciseId}_${i}`, exerciseId, type: 'working', weightKg, reps, completed: true, timestamp: i
});

const EXERCISES = [
  { id: 'a', name: 'Alpha Press', muscleGroups: ['Chest', 'Triceps'] },
  { id: 'b', name: 'Bravo Row', muscleGroups: ['Back'] },
  { id: 'c', name: 'Charlie Curl', muscleGroups: ['Biceps'] },
  { id: 'bw', name: 'Pull-Up', muscleGroups: ['Back'] }
];

const w = (id, daysAgo, sets) => ({ id, date: NOW - daysAgo * DAY, sets });

// Period B = the last 28 days; Period A = the 28 before that.
const B = { start: NOW - 27 * DAY, end: NOW };
const A = precedingRange(B);

// Two sessions in each period, A lighter than B.
const HISTORY = [
  w('a1', 50, [set('a', 100, 5, 1), set('b', 60, 10, 2)]),
  w('a2', 40, [set('a', 100, 5, 1)]),
  w('b1', 20, [set('a', 110, 5, 1), set('b', 70, 10, 2)]),
  w('b2', 10, [set('a', 110, 5, 1), set('c', 20, 15, 2)]),
  w('b3', 3,  [set('a', 110, 5, 1)])
];

const compare = (history = HISTORY, ra = A, rb = B) => compareTrainingPeriods(history, EXERCISES, ra, rb);

// ------------------------------------------------------------- change() ----

test('change() reports a real percentage when both sides have something', () => {
  const c = change(100, 150);
  assert.equal(c.kind, 'change');
  assert.equal(c.abs, 50);
  assert.equal(c.pct, 50);
});

test('change() from zero is "new", never Infinity', () => {
  const c = change(0, 40);
  assert.equal(c.kind, 'new');
  assert.equal(c.pct, null);
  assert.equal(c.abs, 40);
});

test('change() to zero is "gone" at exactly −100%', () => {
  const c = change(40, 0);
  assert.equal(c.kind, 'gone');
  assert.equal(c.pct, -100);
  assert.equal(c.abs, -40);
});

test('change() with nothing either side is "none", not a division', () => {
  const c = change(0, 0);
  assert.equal(c.kind, 'none');
  assert.equal(c.pct, 0);
  assert.equal(c.abs, 0);
});

test('change() never yields NaN or Infinity, whatever it is handed', () => {
  const inputs = [0, 1, 1000, -0, NaN, Infinity, undefined, null];
  for (const from of inputs) {
    for (const to of inputs) {
      const c = change(from, to);
      assert.ok(c.pct === null || Number.isFinite(c.pct), `pct ${c.pct} from ${from}→${to}`);
      assert.ok(Number.isFinite(c.abs), `abs ${c.abs} from ${from}→${to}`);
      assert.ok(['change', 'new', 'gone', 'none'].includes(c.kind));
    }
  }
});

test('a decline is a negative percentage, not a special case', () => {
  const c = change(200, 150);
  assert.equal(c.kind, 'change');
  assert.equal(c.pct, -25);
});

// ------------------------------------------------------ precedingRange ----

test('precedingRange is the same length and does not overlap', () => {
  const prev = precedingRange(B);
  assert.equal(prev.end, B.start - 1);
  assert.equal(prev.end - prev.start, B.end - B.start);
  // The inclusive filter both periods use must not see a shared millisecond.
  assert.ok(prev.end < B.start);
  assert.equal(compare(HISTORY, prev, B).flags.overlapping, false);
});

test('rangeDays floors at one day, so a per-week rate cannot divide by zero', () => {
  assert.equal(rangeDays({ start: NOW, end: NOW }), 1);
  assert.equal(rangeDays({ start: NOW - 14 * DAY, end: NOW }), 14);
});

// -------------------------------------------------------- the headline ----

test('each period reports its own totals, and the delta relates them', () => {
  const r = compare();
  assert.equal(r.a.workouts, 2);
  assert.equal(r.b.workouts, 3);
  assert.equal(r.delta.workouts.abs, 1);
  assert.equal(r.delta.workouts.kind, 'change');
  assert.equal(r.a.volumeKg, 100 * 5 + 60 * 10 + 100 * 5);                     // 1600
  assert.equal(r.b.volumeKg, 110 * 5 + 70 * 10 + 110 * 5 + 20 * 15 + 110 * 5); // 2650
  assert.equal(Math.round(r.delta.volumeKg.pct), 66);
});

test('sessions per week normalises by period length, not by session count', () => {
  const r = compare();
  assert.ok(Math.abs(r.a.perWeek - 2 / (r.a.days / 7)) < 1e-9);
  assert.ok(Math.abs(r.b.perWeek - 3 / (r.b.days / 7)) < 1e-9);
});

// ------------------------------------------------- unequal period length ----

test('unequal lengths are flagged, and the per-week rates are what compare', () => {
  // A is twelve weeks, B is four. B will lose on totals and win on rate.
  const longA = { start: NOW - 111 * DAY, end: NOW - 28 * DAY };
  const r = compare(HISTORY, longA, B);
  assert.equal(r.shape.equalLength, false);
  assert.ok(r.shape.lengthRatio < 1, 'B is the shorter period');
  // The totals favour the longer period here; the rate is the honest read.
  assert.ok(r.b.perWeek > r.a.perWeek, 'B trained more densely');
  assert.equal(r.delta.perWeek.kind, 'change');
  assert.ok(r.delta.perWeek.pct > 0);
});

test('lengths within the tolerance count as equal', () => {
  // 30 days against 31 — a month against a month.
  const monthA = { start: NOW - 61 * DAY, end: NOW - 31 * DAY };
  const monthB = { start: NOW - 30 * DAY, end: NOW };
  const r = compare(HISTORY, monthA, monthB);
  assert.ok(Math.abs(r.shape.daysA - r.shape.daysB) <= EQUAL_LENGTH_TOLERANCE_DAYS);
  assert.equal(r.shape.equalLength, true);
});

// --------------------------------------------------------------- flags ----

test('identical ranges are flagged, and every delta is zero', () => {
  const r = compare(HISTORY, B, B);
  assert.equal(r.flags.identical, true);
  assert.equal(r.flags.overlapping, true);
  for (const d of Object.values(r.delta)) {
    assert.equal(d.abs, 0, `${JSON.stringify(d)} should be unchanged`);
    assert.ok(d.pct === 0, `${JSON.stringify(d)} should be 0%`);
  }
  assert.deepEqual(r.exercises.introduced, []);
  assert.deepEqual(r.exercises.dropped, []);
  assert.equal(r.exercises.kept.length, r.b.exerciseCount);
});

test('overlapping ranges are flagged but still compared', () => {
  const wide = { start: NOW - 90 * DAY, end: NOW };
  const r = compare(HISTORY, wide, B);
  assert.equal(r.flags.overlapping, true);
  assert.equal(r.a.workouts, 5, 'the wide period contains everything');
  assert.equal(r.b.workouts, 3);
});

test('non-overlapping ranges are not flagged as overlapping', () => {
  assert.equal(compare().flags.overlapping, false);
});

test('a reversed pair is flagged, and the order the user chose is kept', () => {
  const r = compare(HISTORY, B, A);
  assert.equal(r.flags.reversed, true);
  assert.equal(r.a.start, B.start, 'A is still the range passed as A');
  assert.equal(r.a.workouts, 3);
  assert.equal(r.b.workouts, 2);
});

test('an empty Period A makes every gain "new" rather than infinite', () => {
  const emptyA = { start: NOW - 400 * DAY, end: NOW - 300 * DAY };
  const r = compare(HISTORY, emptyA, B);
  assert.equal(r.flags.emptyA, true);
  assert.equal(r.flags.emptyBoth, false);
  assert.equal(r.delta.workouts.kind, 'new');
  assert.equal(r.delta.volumeKg.kind, 'new');
  assert.equal(r.delta.volumeKg.pct, null);
  assert.equal(r.exercises.dropped.length, 0);
  assert.equal(r.exercises.kept.length, 0);
  assert.equal(r.exercises.introduced.length, r.b.exerciseCount);
});

test('an empty Period B is "gone", not a mysterious collapse', () => {
  const emptyB = { start: NOW + 10 * DAY, end: NOW + 40 * DAY };
  const r = compare(HISTORY, A, emptyB);
  assert.equal(r.flags.emptyB, true);
  assert.equal(r.delta.workouts.kind, 'gone');
  assert.equal(r.delta.volumeKg.pct, -100);
  assert.equal(r.exercises.introduced.length, 0);
  assert.equal(r.exercises.dropped.length, r.a.exerciseCount);
});

test('both periods empty is its own flag, not two coincidences', () => {
  const r = compare([], A, B);
  assert.equal(r.flags.emptyBoth, true);
  assert.equal(r.delta.volumeKg.kind, 'none');
  assert.equal(r.delta.volumeKg.pct, 0);
  assert.deepEqual(r.repRange.map((x) => x.a.count), [0, 0, 0, 0]);
});

// ------------------------------------------------------ exercise churn ----

test('exercises split into introduced, dropped and kept', () => {
  const r = compare();
  assert.deepEqual(r.exercises.introduced.map((x) => x.exercise.id), ['c']);
  assert.deepEqual(r.exercises.dropped.map((x) => x.exercise.id), []);
  assert.deepEqual(r.exercises.kept.map((x) => x.exercise.id).sort(), ['a', 'b']);
});

test('a dropped lift is one trained in A and not in B', () => {
  const history = [
    w('a1', 50, [set('a', 100, 5, 1), set('b', 60, 10, 2)]),
    w('b1', 10, [set('a', 100, 5, 1)])
  ];
  const r = compare(history);
  assert.deepEqual(r.exercises.dropped.map((x) => x.exercise.id), ['b']);
  assert.deepEqual(r.exercises.introduced, []);
});

test('kept lifts carry both their session and volume change', () => {
  const r = compare();
  const alpha = r.exercises.kept.find((x) => x.exercise.id === 'a');
  assert.equal(alpha.sessions.from, 2);
  assert.equal(alpha.sessions.to, 3);
  assert.equal(alpha.sessions.abs, 1);
  assert.equal(alpha.volumeKg.from, 1000);
  assert.equal(alpha.volumeKg.to, 1650);
  assert.equal(alpha.volumeKg.kind, 'change');
});

test('kept lifts are ordered by volume change, biggest gain first', () => {
  const r = compare();
  const abs = r.exercises.kept.map((x) => x.volumeKg.abs);
  assert.deepEqual(abs, [...abs].sort((x, y) => y - x));
});

test('a deleted exercise appears in no list', () => {
  const history = [
    w('a1', 50, [set('ghost', 100, 5, 1)]),
    w('b1', 10, [set('ghost', 100, 5, 1), set('a', 100, 5, 2)])
  ];
  const r = compare(history);
  const named = [...r.exercises.introduced, ...r.exercises.dropped, ...r.exercises.kept];
  assert.ok(named.every((x) => x.exercise), 'no row may be missing its exercise');
  assert.ok(!named.some((x) => x.exercise.id === 'ghost'));
  assert.equal(r.b.exerciseCount, 1);
});

test('a merged exercise is counted once, under its surviving id', () => {
  // Projection happens upstream in useWorkout; by here both sessions already
  // carry the surviving id.
  const history = [
    w('a1', 50, [set('a', 100, 5, 1)]),
    w('b1', 20, [set('a', 100, 5, 1)]),
    w('b2', 10, [set('a', 100, 5, 1)])
  ];
  const r = compare(history);
  assert.equal(r.exercises.kept.length, 1);
  assert.equal(r.exercises.kept[0].sessions.to, 2);
});

test('a custom exercise needs no ranking and compares normally', () => {
  const exercises = [...EXERCISES, { id: 'mine', name: 'My Own Thing', muscleGroups: ['Back', 'Biceps'], custom: true }];
  const history = [w('b1', 10, [set('mine', 40, 10, 1)])];
  const r = compareTrainingPeriods(history, exercises, A, B);
  assert.deepEqual(r.exercises.introduced.map((x) => x.exercise.id), ['mine']);
});

test('a bodyweight lift adds sessions without faking a volume collapse', () => {
  const history = [
    w('a1', 50, [set('bw', 0, 10, 1)]),
    w('b1', 10, [set('bw', 0, 12, 1)])
  ];
  const r = compare(history);
  assert.equal(r.a.workouts, 1);
  assert.equal(r.b.workouts, 1);
  assert.equal(r.a.volumeKg, 0);
  assert.equal(r.b.volumeKg, 0);
  // Nothing to nothing is "none", not a −100% collapse.
  assert.equal(r.delta.volumeKg.kind, 'none');
  assert.equal(r.exercises.kept.length, 1);
  assert.equal(r.exercises.kept[0].volumeKg.kind, 'none');
});

test('a single-session period still has a per-week rate', () => {
  const history = [w('b1', 10, [set('a', 100, 5, 1)])];
  const r = compare(history);
  assert.equal(r.b.workouts, 1);
  assert.ok(Number.isFinite(r.b.perWeek) && r.b.perWeek > 0);
});

// ----------------------------------------- no fourth copy of anything ----

test('the rep-range mix is repRangeCounts output, not a reimplementation', () => {
  const r = compare();
  assert.deepEqual(r.a.repRange, repRangeCounts(HISTORY, A));
  assert.deepEqual(r.b.repRange, repRangeCounts(HISTORY, B));
});

test('the muscle mix is muscleVolume output, not a reimplementation', () => {
  const r = compare();
  assert.deepEqual(r.a.muscle, muscleVolume(HISTORY, EXERCISES, A));
  assert.deepEqual(r.b.muscle, muscleVolume(HISTORY, EXERCISES, B));
});

test('a distribution label present in only one period still appears, paired with a zero', () => {
  const r = compare();
  const biceps = r.muscle.find((m) => m.label === 'Biceps');
  assert.ok(biceps, 'a muscle trained only in B must still be listed');
  assert.equal(biceps.a.volumeKg, 0);
  assert.ok(biceps.b.volumeKg > 0);
  assert.equal(biceps.value.kind, 'new');
});

test('distribution deltas are percentage POINTS, not a percentage of a percentage', () => {
  const r = compare();
  for (const row of [...r.repRange, ...r.muscle]) {
    assert.ok(Math.abs(row.pctPointDelta) <= 100);
    assert.equal(row.pctPointDelta, row.b.pct - row.a.pct);
  }
});

test('every rep-range bucket is present for both periods, in fixed order', () => {
  const r = compare();
  assert.deepEqual(r.repRange.map((x) => x.label), ['1–5', '6–9', '10–14', '15+']);
});

// ----------------------------------------------------- custom date ranges ----
//
// Found in the browser: a range picked as Feb 1 resolved to Feb 2, because
// new Date("2026-02-01") is UTC midnight while every workout date in this app
// is a local timestamp. These pin the offset-proof version.

test('a date string becomes the local day, not the UTC one', () => {
  const { start, end } = localDayBounds('2026-02-01');
  const s = new Date(start);
  const e = new Date(end);
  assert.equal(s.getFullYear(), 2026);
  assert.equal(s.getMonth(), 1);
  assert.equal(s.getDate(), 1);
  assert.equal(s.getHours(), 0);
  assert.equal(s.getMinutes(), 0);
  // The closing instant is the same calendar day, never the next one.
  assert.equal(e.getDate(), 1);
  assert.equal(e.getMonth(), 1);
  assert.equal(e.getHours(), 23);
  assert.equal(e.getMinutes(), 59);
});

test('a custom range covers whole local days at both ends', () => {
  const r = customRange('2026-02-01', '2026-02-07');
  assert.equal(new Date(r.start).getDate(), 1);
  assert.equal(new Date(r.end).getDate(), 7);
  assert.equal(new Date(r.end).getHours(), 23);
  // Seven whole days, give or take a daylight-saving hour.
  const days = (r.end - r.start) / DAY;
  assert.ok(days > 6.9 && days < 7.1, `${days} days`);
});

test('a session logged early on the opening day is inside the range', () => {
  // The bug this replaces excluded everything before the timezone offset on
  // day one — an 00:30 session on the 1st fell outside a range starting on it.
  const r = customRange('2026-02-01', '2026-02-07');
  const early = new Date(2026, 1, 1, 0, 30).getTime();
  const late = new Date(2026, 1, 7, 22, 45).getTime();
  assert.ok(early >= r.start && early <= r.end, 'an early session on day one must count');
  assert.ok(late >= r.start && late <= r.end, 'a late session on the closing day must count');
});

test('a single-day custom range is one whole day, not an empty instant', () => {
  const r = customRange('2026-02-01', '2026-02-01');
  assert.ok(r.end > r.start);
  assert.ok((r.end - r.start) / DAY > 0.99);
});

test('missing, malformed and out-of-order dates give null, not a broken range', () => {
  assert.equal(customRange('', '2026-02-07'), null);
  assert.equal(customRange('2026-02-01', ''), null);
  assert.equal(customRange(undefined, undefined), null);
  assert.equal(customRange('not-a-date', '2026-02-07'), null);
  // Out of order.
  assert.equal(customRange('2026-02-07', '2026-02-01'), null);
  // A date that does not exist must be rejected, not rolled into March.
  assert.equal(localDayBounds('2026-02-31'), null);
  assert.equal(localDayBounds('2026-13-01'), null);
});
