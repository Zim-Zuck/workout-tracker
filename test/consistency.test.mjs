// EXERCISE CONSISTENCY — how regularly a lift is trained, as distinct from how
// often. Cadence is measured with a median gap and a coefficient of variation,
// both chosen so that one layoff cannot define a lifter's pattern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exerciseConsistency,
  CONSISTENCY_MIN_SESSIONS, CONSISTENCY_REGULAR_CV, CONSISTENCY_UNEVEN_CV
} from '../src/services/exerciseStats.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 11, 12, 0).getTime();

// Sessions at the given day-offsets before NOW (largest first is fine; the
// series is sorted internally).
const at = (...daysAgo) => daysAgo.map((n, i) => ({
  id: `w${i}`, date: NOW - n * DAY,
  sets: [{ id: `s${i}`, exerciseId: 'ex', type: 'working', completed: true, weightKg: 100, reps: 5, timestamp: 0 }]
}));

const con = (workouts) => exerciseConsistency(workouts, 'ex', { asOf: NOW });

test('a weekly cadence reads regular', () => {
  const c = con(at(28, 21, 14, 7, 0));
  assert.equal(c.status, 'ok');
  assert.equal(c.sessions, 5);
  assert.equal(c.medianGapDays, 7);
  assert.equal(c.cv, 0);
  assert.equal(c.regularity, 'regular');
  assert.equal(c.daysSinceLast, 0);
  assert.equal(c.lastTrainedAt, NOW);
});

test('a day either side of weekly is still regular', () => {
  const c = con(at(29, 21, 14, 6, 0));
  assert.ok(c.cv <= CONSISTENCY_REGULAR_CV, `cv ${c.cv}`);
  assert.equal(c.regularity, 'regular');
});

test('a 3-and-14-day alternation reads uneven — irregular, but still a pattern', () => {
  const c = con(at(51, 37, 34, 20, 17, 3, 0));
  assert.ok(c.cv > CONSISTENCY_REGULAR_CV && c.cv <= CONSISTENCY_UNEVEN_CV, `cv ${c.cv}`);
  assert.equal(c.regularity, 'uneven');
});

test('genuinely unpredictable gaps read sporadic', () => {
  // Gaps of 3, 7, 45 and 5 days: no cadence a lifter could name.
  const c = con(at(60, 15, 8, 3, 0));
  assert.ok(c.cv > CONSISTENCY_UNEVEN_CV, `cv ${c.cv}`);
  assert.equal(c.regularity, 'sporadic');
});

test('a middling spread reads uneven', () => {
  // Gaps of 4, 7, 7 and 14 days.
  const c = con(at(32, 28, 21, 14, 0));
  assert.ok(c.cv > CONSISTENCY_REGULAR_CV && c.cv <= CONSISTENCY_UNEVEN_CV, `cv ${c.cv}`);
  assert.equal(c.regularity, 'uneven');
});

test('the median gap is used, so one layoff does not define the cadence', () => {
  // Five weekly sessions, then a three-month gap, then two more weekly ones.
  // The mean gap would be about 19 days; the median is 7, which is what the
  // lifter would call their cadence.
  const c = con(at(118, 111, 104, 97, 90, 7, 0));
  assert.equal(c.medianGapDays, 7);
  const gaps = [7, 7, 7, 7, 83, 7];
  const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
  assert.ok(mean > 15 && c.medianGapDays === 7, 'the median must not follow the mean');
});

test('the median of an even number of gaps is the midpoint of the middle two', () => {
  // Gaps of 4, 6, 8, 10 → median 7.
  const c = con(at(28, 24, 18, 10, 0));
  assert.equal(c.sessions, 5);
  assert.equal(c.medianGapDays, 7);
});

test('the median of an odd number of gaps is the middle one', () => {
  // Gaps of 5, 7, 30 → median 7.
  const c = con(at(42, 37, 30, 0));
  assert.equal(c.medianGapDays, 7);
});

test('fewer than three sessions is insufficient, with nothing invented', () => {
  for (const workouts of [at(), at(0), at(7, 0)]) {
    const c = con(workouts);
    assert.ok(c.sessions < CONSISTENCY_MIN_SESSIONS);
    assert.equal(c.status, 'insufficient');
    assert.equal(c.reason, 'too_few_sessions');
    assert.equal(c.medianGapDays, null);
    assert.equal(c.regularity, null);
    assert.equal(c.cv, null);
  }
});

test('a single session reports when it was, and no cadence', () => {
  const c = con(at(10));
  assert.equal(c.sessions, 1);
  assert.equal(c.daysSinceLast, 10);
  assert.equal(c.lastTrainedAt, NOW - 10 * DAY);
  assert.equal(c.perMonth, null);
  assert.equal(c.spanDays, 0);
});

test('no history reports nothing rather than zero', () => {
  const c = con([]);
  assert.equal(c.sessions, 0);
  assert.equal(c.lastTrainedAt, null);
  assert.equal(c.daysSinceLast, null);
  assert.equal(c.perMonth, null);
});

test('sessions per month is computed over the span they cover', () => {
  // Five sessions a week apart span 28 days; 5 / (28/30.44) is about 5.4.
  const c = con(at(28, 21, 14, 7, 0));
  assert.ok(Math.abs(c.perMonth - 5 / (28 / 30.44)) < 1e-9);
});

test('three sessions on the same day do not divide by zero', () => {
  const sameDay = [0, 0, 0].map((_, i) => ({
    id: `w${i}`, date: NOW,
    sets: [{ id: `s${i}`, exerciseId: 'ex', type: 'working', completed: true, weightKg: 100, reps: 5, timestamp: i }]
  }));
  const c = exerciseConsistency(sameDay, 'ex', { asOf: NOW });
  // One session per date: three same-day workouts are three observations with
  // zero gaps, which is perfectly regular and must not be NaN.
  assert.equal(c.spanDays, 0);
  assert.equal(c.cv, 0);
  assert.equal(c.regularity, 'regular');
  assert.equal(c.medianGapDays, 0);
  assert.equal(c.perMonth, null);
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} is ${v}`);
  }
});

test('the range filter is honoured', () => {
  const workouts = at(120, 113, 106, 21, 14, 7, 0);
  const windowed = exerciseConsistency(workouts, 'ex', { start: NOW - 28 * DAY, end: NOW, asOf: NOW });
  assert.equal(windowed.sessions, 4);
  assert.equal(windowed.medianGapDays, 7);
});

test('warm-ups and unchecked sets are not sessions', () => {
  const workouts = at(14, 7, 0);
  workouts.push({
    id: 'junk', date: NOW + DAY,
    sets: [{ id: 'j', exerciseId: 'ex', type: 'warmup', completed: true, weightKg: 100, reps: 5, timestamp: 0 }]
  });
  assert.equal(con(workouts).sessions, 3);
});

test('a bodyweight lift still has a cadence', () => {
  // Consistency is about dates, not load — unlike the trend, it works fine
  // with nothing but zero-weight sets.
  const bw = at(21, 14, 7, 0).map((w) => ({
    ...w, sets: [{ ...w.sets[0], weightKg: 0, reps: 10 }]
  }));
  const c = exerciseConsistency(bw, 'ex', { asOf: NOW });
  assert.equal(c.status, 'ok');
  assert.equal(c.regularity, 'regular');
  assert.equal(c.sessions, 4);
});
