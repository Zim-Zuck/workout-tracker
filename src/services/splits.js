// Splits: which exercises belong to Push, Pull, Legs, Upper and Lower.
//
// Derived from the muscle groups an exercise already carries, so a custom
// exercise joins a split the moment it is created and nobody has to tag
// anything. An explicit `exercise.split` overrides the derivation, for the cases
// where a person's training disagrees with a lookup table — and they usually
// have a good reason.
//
// This is deliberately a lookup table and a per-exercise override, not a split
// editor screen. The lightest thing that can be right.

export const SPLITS = [
  { id: 'push',  label: 'Push' },
  { id: 'pull',  label: 'Pull' },
  { id: 'legs',  label: 'Legs' },
  { id: 'upper', label: 'Upper' },
  { id: 'lower', label: 'Lower' }
];

export const SPLIT_IDS = SPLITS.map((s) => s.id);

export function splitLabel(id) {
  return SPLITS.find((s) => s.id === id)?.label || null;
}

// The muscle groups each split trains. Upper is Push ∪ Pull and Lower is Legs,
// expressed as unions rather than copied lists so there is one place to change.
const PUSH = ['Chest', 'Shoulders', 'Triceps'];
const PULL = ['Back', 'Biceps', 'Rear Delt', 'Traps', 'Forearms'];
const LEGS = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];

export const SPLIT_MUSCLES = {
  push: PUSH,
  pull: PULL,
  legs: LEGS,
  upper: [...PUSH, ...PULL],
  lower: LEGS
};

// Muscle groups that belong to no split: they ride along with whatever you are
// training rather than defining a day. Core work turning up in a Legs session is
// fine; Core deciding that a session IS a Legs session is not.
const NEUTRAL = new Set(['Core']);

// Which splits an exercise belongs to. An exercise can be in several — a bench
// press is Push AND Upper, and that is not a conflict.
export function splitsForExercise(exercise) {
  if (!exercise) return [];
  // The override wins, and it is a single split by design: somebody overriding
  // is telling us where this lift belongs, not opening a negotiation.
  if (exercise.split && SPLIT_IDS.includes(exercise.split)) {
    const out = [exercise.split];
    if (exercise.split === 'push' || exercise.split === 'pull') out.push('upper');
    if (exercise.split === 'legs') out.push('lower');
    return out;
  }
  const groups = (exercise.muscleGroups || []).filter((g) => !NEUTRAL.has(g));
  if (!groups.length) return [];
  return SPLIT_IDS.filter((id) => groups.some((g) => SPLIT_MUSCLES[id].includes(g)));
}

export function isInSplit(exercise, splitId) {
  return splitsForExercise(exercise).includes(splitId);
}

// The muscle group an exercise most represents inside a split — used to fill one
// slot per muscle rather than five chest exercises. The FIRST matching group
// wins, because defaultExercises.js lists the prime mover first.
export function primaryMuscleIn(exercise, splitId) {
  const wanted = SPLIT_MUSCLES[splitId] || [];
  const groups = (exercise.muscleGroups || []).filter((g) => !NEUTRAL.has(g));
  return groups.find((g) => wanted.includes(g)) || groups[0] || null;
}

// Compound vs isolation, inferred rather than stored.
//
// An exercise that works three or more muscle groups is doing compound work,
// and so is anything on a barbell at low reps. This is a heuristic and it does
// not have to be perfect — it decides ORDER within a session, where being
// roughly right (big lifts first, while you are fresh) is the whole benefit.
export function isCompound(exercise) {
  const groups = (exercise?.muscleGroups || []).filter((g) => !NEUTRAL.has(g));
  if (groups.length >= 3) return true;
  if (groups.length === 2 && ['Barbell', 'Bodyweight', 'Machine'].includes(exercise?.equipment)) return true;
  return false;
}

// Which split a finished session was, inferred from what was actually trained.
//
// Used for history that predates splits existing, and as a fallback title. The
// winner is the split covering the most of the session's working volume, and it
// must cover a clear majority — a session that is genuinely half push and half
// legs is not a Push day, and saying so would be worse than saying nothing.
export function inferSplit(workout, exerciseMap) {
  const scores = Object.fromEntries(SPLIT_IDS.map((id) => [id, 0]));
  let total = 0;
  for (const s of workout.sets || []) {
    if (s.type === 'warmup' || !s.completed) continue;
    const ex = exerciseMap.get(s.exerciseId);
    if (!ex) continue;
    const vol = (s.weightKg || 0) * (s.reps || 0) || 1; // bodyweight lifts still count
    total += vol;
    // Upper and Lower are umbrellas; scoring them alongside their children would
    // let Upper win every push day. Only the three base splits compete.
    for (const id of ['push', 'pull', 'legs']) {
      if (isInSplit(ex, id)) scores[id] += vol;
    }
  }
  if (!total) return null;
  const ranked = ['push', 'pull', 'legs'].sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0];
  if (scores[top] / total < 0.6) {
    // A real mix. Upper if it is push+pull with no legs, otherwise nothing.
    const legsShare = scores.legs / total;
    if (legsShare < 0.15) return 'upper';
    return null;
  }
  return top;
}

// The muscle groups a session trained, most-trained first. The honest fallback
// title for history with no split: "Chest · Shoulders" says more than "Workout".
export function muscleSummary(workout, exerciseMap, limit = 2) {
  const totals = new Map();
  for (const s of workout.sets || []) {
    if (s.type === 'warmup' || !s.completed) continue;
    const ex = exerciseMap.get(s.exerciseId);
    for (const g of (ex?.muscleGroups || []).filter((x) => !NEUTRAL.has(x))) {
      totals.set(g, (totals.get(g) || 0) + ((s.weightKg || 0) * (s.reps || 0) || 1));
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([g]) => g);
}

// The title to show for a workout: its split if it has one, the split we can
// infer if it does not, and the muscle summary if even that is ambiguous.
// Existing history keeps whatever name it was given — this only fills the gap.
export function workoutTitle(workout, exerciseMap) {
  if (workout.split) return splitLabel(workout.split);
  const inferred = inferSplit(workout, exerciseMap);
  if (inferred) return splitLabel(inferred);
  const muscles = muscleSummary(workout, exerciseMap);
  if (muscles.length) return muscles.join(' · ');
  return workout.name || 'Workout';
}
