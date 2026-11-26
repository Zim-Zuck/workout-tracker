// Deterministic double-progression engine, anchored to the best set ever
// logged for an exercise — not the most recent session.
//
// A light or missed session must never pull the target down: that's exactly
// what discourages deload weeks. The target only ever moves when a new best
// is set. See bestSetAcrossHistory() in calculations.js for what counts as
// "best" and why a heavy low-rep single loses to a lighter set with more reps.
//
// Given the best set at W kg × R reps, with rep range [low, high]:
//   - R >= high  → increase load by the exercise's increment, target reps = low.
//   - R <  low   → repeat the best weight, target reps = low.
//   - otherwise  → repeat the best weight, target reps = R + 1 (capped at high).
//
// Exercises with no best set at all — nothing in history clears the weight > 0
// / reps > 0 floor, which covers bodyweight, timed and zero-weight lifts, and
// a brand-new exercise — fall back to the previous, last-session-anchored
// engine untouched, so those keep behaving exactly as they did before.
//
// Returns { targetWeightKg, targetRepsLow, targetRepsHigh, action, reason }
//   action ∈ 'increase' | 'repeat' | 'first-session'
//   targetRepsLow === targetRepsHigh whenever the target is anchored to a best
//   set — it's one specific number, not a range to land anywhere in.
import { isWorking, previousPerformance, bestSetAcrossHistory } from './calculations.js';

// How far below the best set's weight the last session's top set has to fall
// before it reads as a deload rather than ordinary day-to-day variance. Ten
// percent is standard deload-week guidance; the tag is purely informational
// and never changes the target.
export const DELOAD_THRESHOLD = 0.10;

export function recommend({ exercise, workoutHistory }) {
  const [low, high] = exercise.defaultReps || [8, 10];
  const best = bestSetAcrossHistory(exercise.id, workoutHistory);
  if (!best) return recommendFromLastSession(exercise, workoutHistory, low, high);

  const step = exercise.weightIncrement || 2.5;

  if (best.reps >= high) {
    const nextWeight = roundToIncrement(best.weightKg + step, step);
    return {
      targetWeightKg: nextWeight,
      targetRepsLow: low,
      targetRepsHigh: low,
      action: 'increase',
      reason: `Your best is ${formatKgLike(best.weightKg)} × ${best.reps}. Move up to ${formatKgLike(nextWeight)} and build back to ${low}.`
    };
  }

  if (best.reps < low) {
    return {
      targetWeightKg: best.weightKg,
      targetRepsLow: low,
      targetRepsHigh: low,
      action: 'repeat',
      reason: `Your best is ${formatKgLike(best.weightKg)} × ${best.reps}. Work back up to ${low} reps at that weight.`
    };
  }

  const nextReps = Math.min(best.reps + 1, high);
  return {
    targetWeightKg: best.weightKg,
    targetRepsLow: nextReps,
    targetRepsHigh: nextReps,
    action: 'repeat',
    reason: `Your best is ${formatKgLike(best.weightKg)} × ${best.reps}. One more rep gets you to ${nextReps}.`
  };
}

// The original last-session-anchored engine, kept verbatim as the fallback for
// exercises bestSetAcrossHistory() has nothing to anchor to.
function recommendFromLastSession(exercise, workoutHistory, low, high) {
  const prev = previousPerformance(exercise.id, workoutHistory);
  if (!prev) {
    return {
      targetWeightKg: 0,
      targetRepsLow: low,
      targetRepsHigh: high,
      action: 'first-session',
      reason: 'No prior data. Pick a weight you can control for the target range.'
    };
  }

  const sets = prev.sets;
  const weight = mode(sets.map((s) => s.weightKg)); // most-used weight from that session
  const workingAtWeight = sets.filter((s) => s.weightKg === weight);
  const reps = workingAtWeight.map((s) => s.reps);
  const allAtTop = reps.length >= 2 && reps.every((r) => r >= high);
  const anyBelowBottom = reps.some((r) => r < low);
  const anyFailure = workingAtWeight.some((s) => s.type === 'failure');

  if (allAtTop) {
    const step = exercise.weightIncrement || 2.5;
    const nextWeight = roundToIncrement(weight + step, step);
    return {
      targetWeightKg: nextWeight,
      targetRepsLow: low,
      targetRepsHigh: high,
      action: 'increase',
      reason: `You completed ${formatKgLike(weight)} × ${high} for all working sets last session.`
    };
  }

  if (anyBelowBottom || anyFailure) {
    return {
      targetWeightKg: weight,
      targetRepsLow: low,
      targetRepsHigh: high,
      action: 'repeat',
      reason: anyFailure
        ? `You hit failure last session at ${formatKgLike(weight)}. Repeat weight and aim to reach ${low}+ reps across all working sets before increasing.`
        : `You were below the ${low}-rep floor last session. Repeat weight; hit ${low}+ across all working sets, then progress.`
    };
  }

  return {
    targetWeightKg: weight,
    targetRepsLow: low,
    targetRepsHigh: high,
    action: 'repeat',
    reason: `You hit ${reps.join(', ')} at ${formatKgLike(weight)}. Reach ${high} across all sets to advance.`
  };
}

// True once the last session's top-set weight has fallen at least
// DELOAD_THRESHOLD below the best set's weight. Informational only — see the
// module doc above.
export function isDeload(lastTopSetWeightKg, bestWeightKg) {
  if (!(bestWeightKg > 0) || !(lastTopSetWeightKg > 0)) return false;
  return lastTopSetWeightKg <= bestWeightKg * (1 - DELOAD_THRESHOLD);
}

// A target's rep side as text: a single number when it's anchored to a best
// set, a range when it's the legacy "hit this range" fallback.
export function formatTargetRepLabel({ targetRepsLow, targetRepsHigh }) {
  return targetRepsLow === targetRepsHigh ? `${targetRepsLow}` : `${targetRepsLow}–${targetRepsHigh}`;
}

export function formatTarget(rec, formatWeightFn) {
  const reps = formatTargetRepLabel(rec);
  return rec.targetWeightKg > 0 ? `${formatWeightFn(rec.targetWeightKg)} × ${reps}` : `${reps} reps`;
}

function mode(nums) {
  if (!nums.length) return 0;
  const counts = new Map();
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  let best = nums[0], bestCount = 0;
  for (const [n, c] of counts) if (c > bestCount || (c === bestCount && n > best)) { best = n; bestCount = c; }
  return best;
}

function roundToIncrement(v, step) {
  return Math.round(v / step) * step;
}

// Format weight without importing settings — the caller substitutes if needed.
function formatKgLike(kg) {
  return Number.isInteger(kg) ? `${kg} kg` : `${kg.toFixed(1).replace(/\.0$/, '')} kg`;
}
