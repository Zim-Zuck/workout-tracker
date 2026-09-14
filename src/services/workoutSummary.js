// Summaries used by the share card. Reuses existing calculations rather than
// re-deriving PRs/volume in a second place.
import { isWorking, workingVolume, detectPRs, bestWorkingSet, estimate1RM, setVolume } from './calculations.js';

// Ordered list of "leg-family" muscles used by the split-name heuristic.
const LEG_MUSCLES = new Set(['Quads', 'Hamstrings', 'Glutes', 'Calves']);
const PUSH = new Set(['Chest', 'Triceps', 'Shoulders']);
const PULL = new Set(['Back', 'Biceps']);

// Count sets and volume attributed to each PRIMARY muscle group in a workout.
// Each exercise's first muscleGroups[] entry is treated as the primary target.
export function muscleBreakdown(workout, exerciseMap) {
  const perGroup = new Map(); // group -> { sets, volume }
  for (const s of workout.sets) {
    if (!isWorking(s)) continue;
    const ex = exerciseMap.get(s.exerciseId);
    const primary = ex?.muscleGroups?.[0];
    if (!primary) continue;
    const cur = perGroup.get(primary) || { sets: 0, volume: 0 };
    cur.sets += 1;
    cur.volume += setVolume(s);
    perGroup.set(primary, cur);
  }
  return perGroup;
}

// Turn the muscle breakdown into a "[X] Day" style title.
// Heuristics: leg-family, push (chest+triceps±shoulders), pull (back+biceps),
// otherwise "A", "A & B", "A, B & C" from the top groups.
export function dayTitle(workout, exerciseMap) {
  const bd = muscleBreakdown(workout, exerciseMap);
  if (bd.size === 0) return 'Workout';

  const entries = [...bd.entries()].sort((a, b) => b[1].sets - a[1].sets);
  const totalSets = entries.reduce((a, [, v]) => a + v.sets, 0);
  const significant = entries.filter(([, v]) => v.sets / totalSets >= 0.15).map(([g]) => g);
  const groupSet = new Set(significant);

  const legs = significant.filter((g) => LEG_MUSCLES.has(g));
  const nonLegs = significant.filter((g) => !LEG_MUSCLES.has(g));

  // All-legs workout, however many leg muscles are trained.
  if (legs.length >= 1 && nonLegs.length === 0) return 'Leg Day';

  // Full push / pull / legs splits.
  const isPush = significant.length >= 2 && significant.every((g) => PUSH.has(g)) && groupSet.has('Chest');
  const isPull = significant.length >= 2 && significant.every((g) => PULL.has(g)) && groupSet.has('Back');
  if (isPush) return 'Push Day';
  if (isPull) return 'Pull Day';

  // Upper/lower.
  const isUpper = significant.every((g) => PUSH.has(g) || PULL.has(g)) && significant.length >= 3;
  if (isUpper) return 'Upper Body Day';

  // Big mixed session → Full Body.
  if (significant.length >= 4) return 'Full Body Day';

  // Otherwise join top 2–3 with an Oxford &.
  const parts = significant.slice(0, 3);
  if (parts.length === 1) return `${parts[0]} Day`;
  if (parts.length === 2) return `${parts[0]} & ${parts[1]} Day`;
  return `${parts[0]}, ${parts[1]} & ${parts[2]} Day`;
}

// Return PRs achieved in this workout, using the existing detectPRs() over
// working sets from prior workouts. Result: array of { exerciseName, kinds:{...}, top:{weightKg, reps, e1rm} }.
export function workoutPRs(workout, allWorkouts, exerciseMap) {
  const prior = allWorkouts.filter((w) => w.id !== workout.id && w.date < workout.date);
  const perExercise = new Map();
  for (const s of workout.sets) {
    if (!isWorking(s)) continue;
    if (!perExercise.has(s.exerciseId)) perExercise.set(s.exerciseId, []);
    perExercise.get(s.exerciseId).push(s);
  }
  const out = [];
  for (const [exId, currentSets] of perExercise) {
    const prev = [];
    for (const w of prior) {
      for (const s of w.sets) {
        if (s.exerciseId === exId && isWorking(s)) prev.push(s);
      }
    }
    const pr = detectPRs(prev, currentSets);
    if (!pr.weight && !pr.reps && !pr.e1rm) continue;
    const best = bestWorkingSet(currentSets);
    const ex = exerciseMap.get(exId);
    out.push({
      exerciseId: exId,
      exerciseName: ex?.name || 'Exercise',
      kinds: pr,
      top: best ? { weightKg: best.set.weightKg, reps: best.set.reps, e1rm: best.e1rm } : null,
    });
  }
  return out;
}

// Convenience: full stat pack for the share card.
export function workoutSummary(workout, allWorkouts, exercises) {
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const totalVolumeKg = workingVolume(workout.sets);
  const workingSets = workout.sets.filter(isWorking);
  const perExercise = new Map();
  for (const s of workingSets) {
    if (!perExercise.has(s.exerciseId)) perExercise.set(s.exerciseId, []);
    perExercise.get(s.exerciseId).push(s);
  }
  const exerciseRows = (workout.exercises.length ? workout.exercises : [...perExercise.keys()])
    .map((id) => {
      const sets = (perExercise.get(id) || []).slice().sort((a, b) => a.timestamp - b.timestamp);
      const ex = exMap.get(id);
      const top = sets.reduce((m, s) => Math.max(m, s.weightKg), 0);
      return {
        name: ex?.name || 'Exercise',
        sets: sets.length,
        reps: sets.map((s) => s.reps),
        topWeightKg: top,
      };
    })
    .filter((r) => r.sets > 0);

  return {
    title: dayTitle(workout, exMap),
    date: workout.date,
    durationMs: (workout.endTime || Date.now()) - (workout.startTime || workout.date),
    totalVolumeKg,
    setCount: workingSets.length,
    exerciseCount: exerciseRows.length,
    exerciseRows,
    prs: workoutPRs(workout, allWorkouts, exMap),
  };
}
