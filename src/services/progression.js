// Deterministic double-progression engine.
//
// Rules (in order):
//   1. No prior data → suggest the exercise's default rep range at a placeholder weight (last used, or 0).
//   2. Every working set hit the top of the rep range → increase weight by one loadIncrement,
//      target reps = lower bound of the rep range at the new weight.
//   3. Every working set is within the rep range but not all at top → repeat weight, target = range.
//   4. Any working set failed to reach the bottom of the rep range → repeat weight, target = range
//      with a message not to advance until you hit the range across all sets.
//   5. If there were `failure`-typed sets or a clear decline vs the prior week → deload guidance,
//      but never auto-decrease weight; recommend "repeat weight, focus on reaching bottom of range".
//
// Returns { targetWeightKg, targetRepsLow, targetRepsHigh, action, reason }
//   action ∈ 'increase' | 'repeat' | 'first-session'
import { isWorking, previousPerformance } from './calculations.js';
import { loadIncrement } from '../utils/units.js';

export function recommend({ exercise, workoutHistory, unit }) {
  const [low, high] = exercise.defaultReps || [8, 10];
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

  // Rule 2: progress the load.
  if (allAtTop) {
    const step = loadIncrement(unit);
    const nextWeight = roundToIncrement(weight + step, step);
    return {
      targetWeightKg: nextWeight,
      targetRepsLow: low,
      targetRepsHigh: high,
      action: 'increase',
      reason: `You completed ${formatKgLike(weight)} × ${high} for all working sets last session.`
    };
  }

  // Rule 4: something below the range → hold and focus.
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

  // Rule 3: within range but not maxed → repeat.
  return {
    targetWeightKg: weight,
    targetRepsLow: low,
    targetRepsHigh: high,
    action: 'repeat',
    reason: `You hit ${reps.join(', ')} at ${formatKgLike(weight)}. Reach ${high} across all sets to advance.`
  };
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
