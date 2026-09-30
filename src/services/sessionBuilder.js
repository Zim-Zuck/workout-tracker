// Building today's session from what the person actually trains.
//
// Tapping a split pill produces a real, ready-to-start session in one gesture:
// the lifts they reach for, in a sensible order, already loaded with the weights
// their own progression says come next. No template to pick, no program to
// configure.
//
// THE ONE RULE THAT MATTERS MOST
// Exercises are never compared by raw weight. 60 kg on a lat pulldown and 60 kg
// on a curl are not the same claim, and a builder that ranked by kilograms would
// fill every session with leg press. Frequency decides; estimated 1RM breaks
// ties, because it is the only number that means the same thing across lifts.
import { isWorking, estimate1RM } from './calculations.js';
import { bestE1RM } from './prs.js';
import { recommend } from './progression.js';
import { splitsForExercise, isInSplit, primaryMuscleIn, isCompound, SPLIT_MUSCLES } from './splits.js';

const WEEK = 7 * 86400000;

export const BUILDER = {
  lookbackWeeks: 8,      // "what do you actually train" window
  volumeWindowWeeks: 4,  // the window that decides what is under-trained
  minExercises: 4,
  maxExercises: 6,
  skipStreakLimit: 3,    // skipped this many times in a row -> stop suggesting it
  fallbackSecPerSet: 195, // ~3¼ min incl. rest, used only before we know better
  // The band a measured pace is allowed to fall in. Outside it, the number is
  // not telling us about training: a session left running while somebody drove
  // home says 900s per set, and a "~150 min" estimate on the hero would be
  // both wrong and discouraging.
  minSecPerSet: 60,
  maxSecPerSet: 300
};

// ---------------------------------------------------------------------------
// Signals drawn from history
// ---------------------------------------------------------------------------

// How often each exercise was performed in the lookback window. Counted in
// SESSIONS, not sets: doing five sets of curls once is not a habit, doing one
// set of curls in eight sessions is.
function sessionCounts(workouts, since) {
  const counts = new Map();
  for (const w of workouts) {
    if (w.date < since) continue;
    const seen = new Set((w.sets || []).filter(isWorking).map((s) => s.exerciseId));
    for (const id of seen) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

// Working volume per muscle group in the volume window, split evenly across each
// exercise's tagged groups — the same apportioning the Progress charts use, so
// the builder and the charts can never tell different stories.
export function muscleVolume(workouts, exerciseMap, since) {
  const totals = new Map();
  for (const w of workouts) {
    if (w.date < since) continue;
    for (const s of w.sets || []) {
      if (!isWorking(s)) continue;
      const ex = exerciseMap.get(s.exerciseId);
      const groups = ex?.muscleGroups || [];
      if (!groups.length) continue;
      const share = ((s.weightKg || 0) * (s.reps || 0)) / groups.length;
      for (const g of groups) totals.set(g, (totals.get(g) || 0) + share);
    }
  }
  return totals;
}

// How many times in a row an exercise has been skipped, counting back from the
// most recent session that included it at all. The streak resets the moment it
// is actually trained, so one bad week does not retire a lift forever.
export function skipStreaks(workouts) {
  const streaks = new Map();
  const settled = new Set();
  for (const w of [...workouts].sort((a, b) => b.date - a.date)) {
    const trained = new Set((w.sets || []).filter(isWorking).map((s) => s.exerciseId));
    for (const id of w.skipped || []) {
      if (settled.has(id)) continue;
      streaks.set(id, (streaks.get(id) || 0) + 1);
    }
    for (const id of trained) settled.add(id);
  }
  return streaks;
}

// The user's own seconds-per-set, measured from finished sessions. This is what
// makes "~55 min" true for THEM rather than true for an average that describes
// nobody. Sessions with implausible durations (a forgotten timer, a session
// finished the next morning) are ignored rather than allowed to skew it.
export function secondsPerSet(workouts) {
  let sets = 0;
  let ms = 0;
  for (const w of workouts) {
    if (!w.endTime || !w.startTime) continue;
    const dur = w.endTime - w.startTime;
    if (dur < 5 * 60000 || dur > 4 * 3600000) continue;
    const n = (w.sets || []).filter(isWorking).length;
    if (!n) continue;
    sets += n;
    ms += dur;
  }
  if (sets < 10) return BUILDER.fallbackSecPerSet;
  const measured = Math.round(ms / sets / 1000);
  return Math.min(BUILDER.maxSecPerSet, Math.max(BUILDER.minSecPerSet, measured));
}

// ---------------------------------------------------------------------------
// Picking the exercises
// ---------------------------------------------------------------------------

function rankCandidates(exercises, splitId, counts, streaks, workouts) {
  return exercises
    .filter((ex) => isInSplit(ex, splitId))
    .map((ex) => ({
      exercise: ex,
      muscle: primaryMuscleIn(ex, splitId),
      count: counts.get(ex.id) || 0,
      // The tiebreaker, and the ONLY cross-exercise comparison allowed.
      e1rm: bestE1RM(ex.id, workouts),
      skipStreak: streaks.get(ex.id) || 0,
      // How much of this exercise is ABOUT the muscle we are filling a slot for.
      // 0 means it is the prime mover. Only consulted when frequency and 1RM are
      // both silent — which is exactly the cold-start case, and exactly when
      // "which lift actually trains hamstrings" beats alphabetical order.
      focus: focusScore(ex, splitId)
    }))
    .filter((c) => c.muscle)
    .sort((a, b) => {
      // Repeatedly-skipped lifts fall behind everything, but are not deleted:
      // they are still there if nothing better exists for that muscle.
      const aDrop = a.skipStreak >= BUILDER.skipStreakLimit ? 1 : 0;
      const bDrop = b.skipStreak >= BUILDER.skipStreakLimit ? 1 : 0;
      if (aDrop !== bDrop) return aDrop - bDrop;
      if (b.count !== a.count) return b.count - a.count;
      if (b.e1rm !== a.e1rm) return b.e1rm - a.e1rm;
      if (a.focus !== b.focus) return a.focus - b.focus;
      return a.exercise.name.localeCompare(b.exercise.name);
    });
}

// Lower is more focused: the target muscle listed first and few other muscles
// alongside it. A leg curl scores 0; a deadlift that happens to involve
// hamstrings scores much higher.
function focusScore(exercise, splitId) {
  const groups = exercise.muscleGroups || [];
  const muscle = primaryMuscleIn(exercise, splitId);
  const idx = groups.indexOf(muscle);
  return (idx < 0 ? groups.length : idx) * 2 + (groups.length - 1);
}

// The muscle in this split the person has trained least in the volume window.
// Zero volume counts and ranks worst, which is the point: the muscle you have
// skipped entirely is exactly the one to surface.
export function underTrainedMuscle(splitId, volumes) {
  const muscles = SPLIT_MUSCLES[splitId] || [];
  let worst = null;
  let worstVol = Infinity;
  for (const m of muscles) {
    const v = volumes.get(m) || 0;
    if (v < worstVol) { worst = m; worstVol = v; }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

// Returns { splitId, exercises: [{ exercise, muscle, target, reason }],
//           setsTotal, estimatedMinutes, usingDefaults, underTrained }
export function buildSession(splitId, { exercises, workouts, now = Date.now() } = {}) {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const finished = workouts.filter((w) => !w.isActive);
  const counts = sessionCounts(finished, now - BUILDER.lookbackWeeks * WEEK);
  const volumes = muscleVolume(finished, exerciseMap, now - BUILDER.volumeWindowWeeks * WEEK);
  const streaks = skipStreaks(finished);
  const ranked = rankCandidates(exercises, splitId, counts, streaks, finished);

  // No history for this split at all: fall back to the best-known defaults and
  // say so, rather than pretending the choice was personal.
  const usingDefaults = ranked.every((c) => c.count === 0);

  const picked = [];
  const usedMuscles = new Set();
  const take = (c, reason) => {
    if (picked.some((p) => p.exercise.id === c.exercise.id)) return false;
    picked.push({ ...c, reason });
    usedMuscles.add(c.muscle);
    return true;
  };

  // 1. Reserve one slot for the under-trained muscle, FIRST, so it can never be
  //    squeezed out by the cap. This is the whole reason hamstrings show up in a
  //    Legs day built by somebody who only ever does leg extensions.
  const underTrained = underTrainedMuscle(splitId, volumes);
  if (underTrained) {
    const best = ranked.find((c) => c.muscle === underTrained);
    if (best) take(best, 'under-trained');
  }

  // 2. One exercise per remaining muscle in the split, best-ranked first.
  for (const c of ranked) {
    if (picked.length >= BUILDER.maxExercises) break;
    if (usedMuscles.has(c.muscle)) continue;
    if (c.skipStreak >= BUILDER.skipStreakLimit) continue;
    take(c, 'most-trained');
  }

  // 3. Still thin (a split with few muscles, or a short library)? Add the next
  //    best regardless of muscle, so a session is never two exercises long.
  for (const c of ranked) {
    if (picked.length >= BUILDER.minExercises) break;
    if (c.skipStreak >= BUILDER.skipStreakLimit) continue;
    take(c, 'filler');
  }

  // 4. Compounds first. Heavy work belongs at the front, while you are fresh —
  //    and within each tier the ranking from above is preserved.
  const ordered = [
    ...picked.filter((c) => isCompound(c.exercise)),
    ...picked.filter((c) => !isCompound(c.exercise))
  ];

  // 5. Prefill from the SAME progression engine the active screen uses, so the
  //    weight previewed on the hero is the weight that appears in the set rows.
  const plan = ordered.map((c) => {
    const rec = recommend({ exercise: c.exercise, workoutHistory: finished });
    return {
      exercise: c.exercise,
      muscle: c.muscle,
      reason: c.reason,
      sets: defaultSetCount(c.exercise),
      target: rec
    };
  });

  return {
    splitId,
    exercises: plan,
    ...estimate(plan, finished),
    usingDefaults,
    underTrained
  };
}

// Set counts follow the rep range: heavy low-rep work gets more sets, high-rep
// accessory work fewer. Not configurable, because "how many sets" is a decision
// the user makes live by tapping "Add set", not one worth a settings screen.
function defaultSetCount(exercise) {
  const [low] = exercise.defaultReps || [8, 10];
  if (low <= 5) return 4;
  if (low <= 8) return 3;
  return 3;
}

export function estimate(plan, workouts) {
  const setsTotal = plan.reduce((a, p) => a + p.sets, 0);
  const perSet = secondsPerSet(workouts);
  return {
    setsTotal,
    estimatedMinutes: Math.max(5, Math.round((setsTotal * perSet) / 60 / 5) * 5),
    secondsPerSet: perSet
  };
}

// Recompute the headline after the user removes something from the plan. Kept
// here so the hero card never does arithmetic of its own.
export function recomputePlan(plan, workouts) {
  return { exercises: plan, ...estimate(plan, workouts) };
}

// Which split to open on: the one that comes next in the rotation the person is
// already running, inferred from what they last did rather than from a program
// they had to declare.
export function nextSplitInRotation(workouts, exerciseMap, fallback = 'push') {
  const recent = [...workouts]
    .filter((w) => !w.isActive && w.split)
    .sort((a, b) => b.date - a.date);
  if (!recent.length) return fallback;

  const last = recent[0].split;
  // Push/Pull/Legs is the rotation this app's splits describe. Upper/Lower
  // alternate with each other. Anything else just repeats the last split, which
  // is the honest answer when we cannot see a pattern.
  const ppl = ['push', 'pull', 'legs'];
  if (ppl.includes(last)) return ppl[(ppl.indexOf(last) + 1) % ppl.length];
  if (last === 'upper') return 'lower';
  if (last === 'lower') return 'upper';
  return fallback;
}

// The three best alternatives for the same muscle, for "Replace exercise".
// Ranked by the user's own history, so the suggestions are lifts they know.
export function alternativesFor(exercise, splitId, { exercises, workouts, exclude = [] }, limit = 3) {
  const finished = workouts.filter((w) => !w.isActive);
  const counts = sessionCounts(finished, Date.now() - BUILDER.lookbackWeeks * WEEK);
  const streaks = skipStreaks(finished);
  const muscle = primaryMuscleIn(exercise, splitId) || (exercise.muscleGroups || [])[0];
  const pool = splitId
    ? exercises.filter((e) => isInSplit(e, splitId))
    : exercises.filter((e) => (e.muscleGroups || []).includes(muscle));

  return rankCandidates(pool, splitId || splitsForExercise(exercise)[0], counts, streaks, finished)
    .filter((c) => c.exercise.id !== exercise.id && !exclude.includes(c.exercise.id))
    .filter((c) => c.muscle === muscle)
    .slice(0, limit)
    .map((c) => c.exercise);
}
