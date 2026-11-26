// Best-set selection and the double-progression target anchored to it.
//
// The whole point of anchoring to the best set instead of the last session is
// that a deload week must never pull the target down — only a new best moves
// it. These tests pin that behaviour, plus the rep-floor rule that keeps a
// heavy low-rep single from masquerading as "best", and the neutral deload
// tag's threshold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestSetAcrossHistory, MIN_BEST_SET_REPS } from '../src/services/calculations.js';
import {
  recommend, isDeload, DELOAD_THRESHOLD, formatTarget, formatTargetRepLabel
} from '../src/services/progression.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 11, 12, 0).getTime();
let setCounter = 0;

const set = (exerciseId, weightKg, reps, opts = {}) => ({
  id: opts.id || `s${setCounter++}`,
  exerciseId,
  type: opts.type || 'working',
  weightKg,
  reps,
  completed: opts.completed !== false,
  timestamp: opts.timestamp || 0
});

// workouts MUST be sorted desc by date — the contract bestSetAcrossHistory and
// previousPerformance share. Every fixture below lists the most recent first.
const workout = (id, date, sets) => ({ id, date, sets });

// ---------------------------------------------------------------------------
// bestSetAcrossHistory
// ---------------------------------------------------------------------------

test('best set favors heavier weight over more reps (65×10 beats 50×15)', () => {
  const workouts = [workout('w1', NOW, [set('ex', 50, 15), set('ex', 50, 15), set('ex', 65, 10)])];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.weightKg, 65);
  assert.equal(best.reps, 10);
});

test('a heavy 3-rep set is ignored in favor of a qualifying >=5-rep set', () => {
  // 100 kg × 3 is heavier, but it never clears MIN_BEST_SET_REPS, so the
  // 80 kg × 8 set — which does — wins "best" even though it's lighter.
  const workouts = [workout('w1', NOW, [set('ex', 100, 3), set('ex', 80, 8)])];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.weightKg, 80);
  assert.equal(best.reps, 8);
});

test('falls back to the heaviest completed set when nothing clears the rep floor', () => {
  const workouts = [workout('w1', NOW, [set('ex', 100, 3), set('ex', 80, 2)])];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.weightKg, 100);
  assert.equal(best.reps, 3);
});

test('a tie on weight and reps goes to the more recent set', () => {
  const workouts = [
    workout('w2', NOW, [set('ex', 65, 10, { id: 'recent' })]),
    workout('w1', NOW - 7 * DAY, [set('ex', 65, 10, { id: 'older' })])
  ];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.id, 'recent');
});

test('a tie on weight is broken by more reps, even from an older session', () => {
  const workouts = [
    workout('w2', NOW, [set('ex', 65, 10, { id: 'recent-fewer-reps' })]),
    workout('w1', NOW - 7 * DAY, [set('ex', 65, 12, { id: 'older-more-reps' })])
  ];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.id, 'older-more-reps');
});

test('warm-ups and incomplete sets never count toward best', () => {
  const workouts = [workout('w1', NOW, [
    set('ex', 200, 10, { type: 'warmup' }),
    set('ex', 150, 10, { completed: false }),
    set('ex', 80, 8)
  ])];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.weightKg, 80);
});

test('zero-weight and zero-rep sets never count toward best', () => {
  const workouts = [workout('w1', NOW, [
    set('ex', 0, 20),
    set('ex', 50, 0),
    set('ex', 40, 8)
  ])];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.weightKg, 40);
});

test('best set is pulled from across all of history, not just the last session', () => {
  const workouts = [
    workout('w3', NOW, [set('ex', 50, 10)]),               // this week: a deload
    workout('w2', NOW - 7 * DAY, [set('ex', 65, 10)]),     // the actual best
    workout('w1', NOW - 14 * DAY, [set('ex', 60, 10)])
  ];
  const best = bestSetAcrossHistory('ex', workouts);
  assert.equal(best.weightKg, 65);
});

test('empty history has no best set', () => {
  assert.equal(bestSetAcrossHistory('ex', []), null);
  assert.equal(bestSetAcrossHistory('ex', [workout('w1', NOW, [set('other-ex', 100, 10)])]), null);
});

test('MIN_BEST_SET_REPS is pinned at 5', () => {
  assert.equal(MIN_BEST_SET_REPS, 5);
});

// ---------------------------------------------------------------------------
// recommend() — target anchored to best
// ---------------------------------------------------------------------------

test('target matches the worked example: best 65 kg × 10 in an 8–12 range gives 65 kg × 11', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12], weightIncrement: 2.5 };
  const workouts = [workout('w1', NOW, [set('ex', 65, 10)])];
  const rec = recommend({ exercise, workoutHistory: workouts });
  assert.equal(rec.targetWeightKg, 65);
  assert.equal(rec.targetRepsLow, 11);
  assert.equal(rec.targetRepsHigh, 11);
  assert.equal(formatTarget(rec, (kg) => `${kg} kg`), '65 kg × 11');
});

test('target increases weight once best reps reach the top of the range', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12], weightIncrement: 2.5 };
  const workouts = [workout('w1', NOW, [set('ex', 60, 12)])];
  const rec = recommend({ exercise, workoutHistory: workouts });
  assert.equal(rec.targetWeightKg, 62.5);
  assert.equal(rec.targetRepsLow, 8);
  assert.equal(rec.targetRepsHigh, 8);
  assert.equal(rec.action, 'increase');
});

test('target reps are capped at the top of the range, never counted past it', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12], weightIncrement: 2.5 };
  // 11 reps, one short of top: next target is 12, not 13.
  const workouts = [workout('w1', NOW, [set('ex', 60, 11)])];
  const rec = recommend({ exercise, workoutHistory: workouts });
  assert.equal(rec.targetWeightKg, 60);
  assert.equal(rec.targetRepsLow, 12);
});

test('target holds weight and asks for the bottom of the range when best reps qualify but sit below it', () => {
  // 6 reps clears MIN_BEST_SET_REPS (qualifies as "best") but is below the
  // 8-rep floor of the range.
  const exercise = { id: 'ex', defaultReps: [8, 12], weightIncrement: 2.5 };
  const workouts = [workout('w1', NOW, [set('ex', 70, 6)])];
  const rec = recommend({ exercise, workoutHistory: workouts });
  assert.equal(rec.targetWeightKg, 70);
  assert.equal(rec.targetRepsLow, 8);
  assert.equal(rec.targetRepsHigh, 8);
});

test('target holds weight and asks for the bottom of the range when the fallback best is below it', () => {
  // 3 reps never qualifies (below MIN_BEST_SET_REPS), so this is the heaviest-
  // completed-set fallback, and it's also below the range's bottom.
  const exercise = { id: 'ex', defaultReps: [8, 12], weightIncrement: 2.5 };
  const workouts = [workout('w1', NOW, [set('ex', 40, 3)])];
  const rec = recommend({ exercise, workoutHistory: workouts });
  assert.equal(rec.targetWeightKg, 40);
  assert.equal(rec.targetRepsLow, 8);
  assert.equal(rec.targetRepsHigh, 8);
});

test('weight increment defaults to 2.5 kg when the exercise has none configured', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12] };
  const workouts = [workout('w1', NOW, [set('ex', 60, 12)])];
  const rec = recommend({ exercise, workoutHistory: workouts });
  assert.equal(rec.targetWeightKg, 62.5);
});

test('a lighter or missed session never pulls the target down — only a new best moves it', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12], weightIncrement: 2.5 };
  const bestOnly = [workout('w1', NOW - 7 * DAY, [set('ex', 65, 10)])];
  const afterDeload = [
    workout('w2', NOW, [set('ex', 50, 10)]), // this week: a deload, much lighter
    ...bestOnly
  ];
  const recBestOnly = recommend({ exercise, workoutHistory: bestOnly });
  const recAfterDeload = recommend({ exercise, workoutHistory: afterDeload });
  assert.deepEqual(recAfterDeload, recBestOnly);
  assert.equal(recAfterDeload.targetWeightKg, 65);
  assert.equal(recAfterDeload.targetRepsLow, 11);
});

test('a missed (incomplete) session never pulls the target down either', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12], weightIncrement: 2.5 };
  const bestOnly = [workout('w1', NOW - 7 * DAY, [set('ex', 65, 10)])];
  const afterMiss = [
    workout('w2', NOW, [set('ex', 65, 10, { completed: false })]),
    ...bestOnly
  ];
  const rec = recommend({ exercise, workoutHistory: afterMiss });
  assert.equal(rec.targetWeightKg, 65);
  assert.equal(rec.targetRepsLow, 11);
});

test('empty history keeps the original first-session target behaviour', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12] };
  const rec = recommend({ exercise, workoutHistory: [] });
  assert.equal(rec.action, 'first-session');
  assert.equal(rec.targetWeightKg, 0);
  assert.equal(rec.targetRepsLow, 8);
  assert.equal(rec.targetRepsHigh, 12);
});

test('a bodyweight exercise (never above zero weight) keeps the legacy last-session target', () => {
  const exercise = { id: 'ex', defaultReps: [8, 12] };
  const workouts = [workout('w1', NOW, [set('ex', 0, 12), set('ex', 0, 12), set('ex', 0, 10)])];
  const rec = recommend({ exercise, workoutHistory: workouts });
  assert.equal(rec.action, 'repeat');
  assert.equal(rec.targetWeightKg, 0);
  assert.equal(rec.targetRepsLow, 8);
  assert.equal(rec.targetRepsHigh, 12);
});

// ---------------------------------------------------------------------------
// Deload tag
// ---------------------------------------------------------------------------

test('DELOAD_THRESHOLD is ten percent', () => {
  assert.equal(DELOAD_THRESHOLD, 0.10);
});

test('isDeload: exactly ten percent below the best counts as a deload', () => {
  assert.equal(isDeload(90, 100), true);
});

test('isDeload: just under ten percent below is not a deload', () => {
  assert.equal(isDeload(91, 100), false);
});

test('isDeload: just over ten percent below is a deload', () => {
  assert.equal(isDeload(89, 100), true);
});

test('isDeload: at or above the best weight is never a deload', () => {
  assert.equal(isDeload(100, 100), false);
  assert.equal(isDeload(105, 100), false);
});

test('isDeload: no best weight or no last weight is never a deload', () => {
  assert.equal(isDeload(90, 0), false);
  assert.equal(isDeload(0, 100), false);
  assert.equal(isDeload(90, null), false);
});

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

test('formatTargetRepLabel shows a single number when the target is anchored to a best set', () => {
  assert.equal(formatTargetRepLabel({ targetRepsLow: 11, targetRepsHigh: 11 }), '11');
});

test('formatTargetRepLabel shows a range for the legacy "hit this range" fallback', () => {
  assert.equal(formatTargetRepLabel({ targetRepsLow: 8, targetRepsHigh: 12 }), '8–12');
});

test('formatTarget shows reps-only when there is no weight yet (first session)', () => {
  const rec = { targetWeightKg: 0, targetRepsLow: 8, targetRepsHigh: 12 };
  assert.equal(formatTarget(rec, (kg) => `${kg} kg`), '8–12 reps');
});
