// Derives the small "social summary" published to the cloud from the full local
// workout history.
//
// This module is the entire local → cloud boundary for workout data. Nothing
// else reads workouts and sends them anywhere, so what leaves the device is
// auditable by reading one file.
//
// What is published:  totals, streak, and per-exercise top weight.
// What never is:      individual sets, reps, RPE, notes, timestamps, custom
//                     exercises, settings.
import { isWorking, workingVolume, estimate1RM, computeStreak } from './calculations.js';
import { startOfWeek } from '../utils/date.js';
import { DEFAULT_EXERCISES } from '../data/defaultExercises.js';

// Only built-in exercises are comparable between users: their ids are stable and
// shared across installs. A user's custom exercise has a device-random id that
// would never match a friend's, so it is excluded — it still counts toward
// volume and workout totals, it just has no cross-user leaderboard row.
export const SHAREABLE_EXERCISE_IDS = new Set(DEFAULT_EXERCISES.map((e) => e.id));

export function isShareableExercise(exerciseId) {
  return SHAREABLE_EXERCISE_IDS.has(exerciseId);
}

// Mirrors the database's plausibility constraints so a nonsense local value is
// dropped here with a clear reason, rather than bouncing off Postgres as an
// opaque constraint violation the user can do nothing about.
const LIMITS = { weightKg: 500, reps: 100, e1rmKg: 600 };

// Zero weight is valid — pull-ups, dips and planks are logged at bodyweight.
// Those rank by reps instead, which the comparison logic below already handles.
function plausibleLift(topWeightKg, reps, e1rmKg) {
  return (
    topWeightKg >= 0 && topWeightKg <= LIMITS.weightKg &&
    reps >= 1 && reps <= LIMITS.reps &&
    e1rmKg >= 0 && e1rmKg <= LIMITS.e1rmKg
  );
}

// Headline totals for the profile.
export function buildStatsSummary(workouts, asOf = Date.now()) {
  const finished = workouts.filter((w) => !w.isActive);
  const weekStart = startOfWeek(asOf);

  return {
    streak_weeks: computeStreak(finished, asOf),
    total_workouts: finished.length,
    // Rounded to 0.1kg to match the numeric(12,1) column.
    lifetime_volume_kg: Math.round(finished.reduce((a, w) => a + workingVolume(w.sets), 0) * 10) / 10,
    workouts_this_week: finished.filter((w) => w.date >= weekStart).length,
    last_workout_at: finished.length
      ? new Date(Math.max(...finished.map((w) => w.date))).toISOString()
      : null
  };
}

// Best lift per built-in exercise across all history.
//
// "Best" is the heaviest weight actually lifted, because that is the headline
// the product shows everywhere. Estimated 1RM rides along as a tiebreaker for
// the leaderboard, never as the number on the profile.
export function buildLiftsSummary(workouts) {
  const best = new Map(); // exerciseId -> row

  for (const w of workouts) {
    if (w.isActive) continue;
    for (const s of w.sets) {
      if (!isWorking(s)) continue;
      if (!isShareableExercise(s.exerciseId)) continue;

      const e1rm = estimate1RM(s.weightKg, s.reps);
      const cur = best.get(s.exerciseId);

      if (!cur) {
        best.set(s.exerciseId, {
          exercise_id: s.exerciseId,
          top_weight_kg: s.weightKg,
          top_weight_reps: s.reps,
          best_e1rm_kg: e1rm,
          achieved_at: s.timestamp || w.date
        });
        continue;
      }

      // Heavier bar wins outright. Equal bar, more reps wins — that is a better
      // performance at the same headline weight.
      if (
        s.weightKg > cur.top_weight_kg ||
        (s.weightKg === cur.top_weight_kg && s.reps > cur.top_weight_reps)
      ) {
        cur.top_weight_kg = s.weightKg;
        cur.top_weight_reps = s.reps;
        cur.achieved_at = s.timestamp || w.date;
      }
      // e1RM tracks its own maximum: your best single and your best estimated
      // max can legitimately come from different sets.
      if (e1rm > cur.best_e1rm_kg) cur.best_e1rm_kg = e1rm;
    }
  }

  return [...best.values()]
    .filter((r) => plausibleLift(r.top_weight_kg, r.top_weight_reps, r.best_e1rm_kg))
    .map((r) => ({
      exercise_id: r.exercise_id,
      top_weight_kg: Math.round(r.top_weight_kg * 100) / 100,
      top_weight_reps: r.top_weight_reps,
      best_e1rm_kg: Math.round(r.best_e1rm_kg * 100) / 100,
      achieved_at: new Date(r.achieved_at).toISOString()
    }));
}

// The three lifts shown on a profile. Ordered by heaviest bar, with the big
// compound lifts winning ties so a profile leads with bench/squat/deadlift
// rather than whichever accessory happens to be heavy.
const HEADLINE_PRIORITY = ['ex_deadlift', 'ex_squat', 'ex_bench_press', 'ex_ohp', 'ex_barbell_row'];

export function pickTopLifts(lifts, limit = 3) {
  return [...lifts]
    .sort((a, b) => {
      const pa = HEADLINE_PRIORITY.indexOf(a.exercise_id);
      const pb = HEADLINE_PRIORITY.indexOf(b.exercise_id);
      const ra = pa === -1 ? HEADLINE_PRIORITY.length : pa;
      const rb = pb === -1 ? HEADLINE_PRIORITY.length : pb;
      if (ra !== rb) return ra - rb;
      return b.top_weight_kg - a.top_weight_kg;
    })
    .slice(0, limit);
}
