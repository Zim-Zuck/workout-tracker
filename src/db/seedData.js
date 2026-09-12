// Generates a few weeks of realistic sample workouts so charts have something to show
// during development. Disable by leaving the workouts store non-empty.
import { uid } from '../utils/id.js';
import { getAllWorkouts, bulkPut } from './database.js';

function set(exId, weight, reps, ts, type = 'working') {
  return {
    id: uid('set'),
    exerciseId: exId,
    type,
    weightKg: weight,
    reps,
    timestamp: ts,
    completed: true
  };
}

function workout(date, name, exercises, sets, notes = '') {
  return {
    id: uid('wo'),
    date,
    startTime: date,
    endTime: date + 60 * 60 * 1000,
    name,
    exercises,
    sets,
    notes,
    isActive: 0
  };
}

export async function maybeSeed({ force = false } = {}) {
  const existing = await getAllWorkouts();
  if (!force && existing.length > 0) return { seeded: false };

  const now = Date.now();
  const day = 86400000;
  const workouts = [];

  // Push/Pull/Legs across ~4 weeks
  for (let w = 4; w >= 1; w--) {
    const weekOffset = w * 7 * day;
    // Push (Mon)
    {
      const t = now - weekOffset;
      const wt = 77.5 + (4 - w) * 1.25;
      workouts.push(workout(t, 'Push A', ['ex_bench_press', 'ex_ohp', 'ex_lateral_raise', 'ex_tricep_pushdown'], [
        set('ex_bench_press', wt, 8, t),
        set('ex_bench_press', wt, 8, t + 60000),
        set('ex_bench_press', wt, 7 + (4 - w), t + 120000),
        set('ex_ohp', 45 + (4 - w), 6, t + 300000),
        set('ex_ohp', 45 + (4 - w), 6, t + 360000),
        set('ex_ohp', 45 + (4 - w), 5, t + 420000),
        set('ex_lateral_raise', 10, 12, t + 600000),
        set('ex_lateral_raise', 10, 12, t + 660000),
        set('ex_lateral_raise', 10, 11, t + 720000),
        set('ex_tricep_pushdown', 25, 12, t + 900000),
        set('ex_tricep_pushdown', 25, 11, t + 960000)
      ]));
    }
    // Pull (Wed)
    {
      const t = now - weekOffset + 2 * day;
      workouts.push(workout(t, 'Pull A', ['ex_deadlift', 'ex_pullup', 'ex_seated_row', 'ex_barbell_curl'], [
        set('ex_deadlift', 120 + (4 - w) * 2.5, 5, t),
        set('ex_deadlift', 120 + (4 - w) * 2.5, 5, t + 240000),
        set('ex_deadlift', 120 + (4 - w) * 2.5, 4, t + 480000),
        set('ex_pullup', 0, 8, t + 700000),
        set('ex_pullup', 0, 7, t + 800000),
        set('ex_pullup', 0, 6, t + 900000),
        set('ex_seated_row', 55, 10, t + 1100000),
        set('ex_seated_row', 55, 10, t + 1200000),
        set('ex_seated_row', 55, 9, t + 1300000),
        set('ex_barbell_curl', 30, 10, t + 1500000),
        set('ex_barbell_curl', 30, 9, t + 1560000)
      ]));
    }
    // Legs (Fri)
    {
      const t = now - weekOffset + 4 * day;
      workouts.push(workout(t, 'Legs A', ['ex_squat', 'ex_rdl', 'ex_leg_curl', 'ex_standing_calf'], [
        set('ex_squat', 100 + (4 - w) * 2.5, 6, t),
        set('ex_squat', 100 + (4 - w) * 2.5, 6, t + 240000),
        set('ex_squat', 100 + (4 - w) * 2.5, 5, t + 480000),
        set('ex_rdl', 80, 8, t + 700000),
        set('ex_rdl', 80, 8, t + 800000),
        set('ex_rdl', 80, 7, t + 900000),
        set('ex_leg_curl', 40, 12, t + 1100000),
        set('ex_leg_curl', 40, 12, t + 1200000),
        set('ex_leg_curl', 40, 11, t + 1300000),
        set('ex_standing_calf', 60, 15, t + 1500000),
        set('ex_standing_calf', 60, 14, t + 1560000)
      ]));
    }
  }

  await bulkPut('workouts', workouts);
  return { seeded: true, count: workouts.length };
}
