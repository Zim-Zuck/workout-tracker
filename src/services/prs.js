// THE personal-record authority. Every PR the app shows comes from here.
//
// Before this module there were three answers to "what is a PR?": ExerciseCard
// flashed four boolean flags, the Progress list printed "est. 1RM" or "top set"
// depending on which branch fired, and the profile published "top weight". Same
// lift, three vocabularies, and no way to tell whether two of them meant the
// same thing.
//
// THE RULES
//   1. Three kinds, in this priority order:
//        weight  — a heavier bar than you have ever put on this lift
//        reps    — more reps at a weight you already owned
//        volume  — more total work on this lift in ONE session than ever before
//   2. AT MOST ONE PR PER EXERCISE PER SESSION. A session where you add weight
//      almost always sets a volume record too; reporting both is reporting the
//      same achievement twice, and it is how a feed turns into confetti.
//   3. Estimated 1RM is a TIEBREAKER, never a badge. It orders leaderboards and
//      breaks ties between exercises. It is not a thing you "hit".
//   4. Warm-up sets never count, toward anything. (isWorking() enforces this.)
//   5. Your first session on a lift sets no PR. There was nothing to beat.
import { isWorking, estimate1RM, setVolume, detectPRs } from './calculations.js';

export const PR_PRIORITY = ['weight', 'reps', 'volume'];

export const PR_LABELS = {
  weight: 'Weight PR',
  reps: 'Reps PR',
  volume: 'Volume PR'
};

// The single PR (or null) that one exercise earned in one session.
//
// `history` must be every workout BEFORE this one, in any order.
export function sessionPRForExercise(exerciseId, sessionSets, history) {
  const current = sessionSets.filter((s) => s.exerciseId === exerciseId && isWorking(s));
  if (!current.length) return null;

  const prevSessions = [];
  const prevSets = [];
  for (const w of history) {
    const rel = (w.sets || []).filter((s) => s.exerciseId === exerciseId && isWorking(s));
    if (!rel.length) continue;
    prevSessions.push(rel);
    prevSets.push(...rel);
  }
  if (!prevSets.length) return null; // rule 5

  const flags = detectPRs(prevSets, current, prevSessions);

  // Rule 2: first match in priority order wins, and we stop looking.
  const kind = PR_PRIORITY.find((k) => flags[k]);
  if (!kind) return null;

  return { exerciseId, kind, label: PR_LABELS[kind], ...describe(kind, current, prevSets, prevSessions) };
}

// The value and improvement a badge shows, in the units that kind is measured
// in. Each kind reports the number it is actually about — a weight PR shows
// kilograms, a reps PR shows reps — rather than everything showing an estimated
// 1RM, which is what made the old labels incomparable.
function describe(kind, current, prevSets, prevSessions) {
  if (kind === 'weight') {
    const best = current.reduce((m, s) => Math.max(m, s.weightKg), 0);
    const prev = prevSets.reduce((m, s) => Math.max(m, s.weightKg), 0);
    return { unit: 'kg', value: best, previous: prev, delta: best - prev };
  }
  if (kind === 'reps') {
    // The set that beat its own weight's previous best by the most.
    const prevAtWeight = new Map();
    for (const s of prevSets) {
      prevAtWeight.set(s.weightKg, Math.max(prevAtWeight.get(s.weightKg) || 0, s.reps));
    }
    let best = null;
    for (const s of current) {
      const was = prevAtWeight.get(s.weightKg) || 0;
      if (was > 0 && s.reps > was && (!best || s.reps - was > best.delta)) {
        best = { value: s.reps, previous: was, delta: s.reps - was, atWeightKg: s.weightKg };
      }
    }
    return { unit: 'reps', ...(best || { value: 0, previous: 0, delta: 0 }) };
  }
  const vol = current.reduce((a, s) => a + setVolume(s), 0);
  const prev = prevSessions.reduce((m, ss) => Math.max(m, ss.reduce((a, s) => a + setVolume(s), 0)), 0);
  return { unit: 'kg', value: vol, previous: prev, delta: vol - prev };
}

// Every PR in one session, at most one per exercise.
export function sessionPRs(workout, history) {
  const exIds = [...new Set((workout.sets || []).filter(isWorking).map((s) => s.exerciseId))];
  return exIds
    .map((id) => sessionPRForExercise(id, workout.sets, history))
    .filter(Boolean);
}

// Every PR across all history, newest first. Replaces buildPrTimeline().
//
// Walks forward in time so each session is judged against only what came before
// it, which is the only way a PR list can be stable: a record set in March must
// not stop being a record because of something lifted in June.
export function prTimeline(workouts) {
  const sorted = [...workouts].sort((a, b) => a.date - b.date);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const before = sorted.slice(0, i);
    for (const pr of sessionPRs(sorted[i], before)) {
      out.push({ ...pr, date: sorted[i].date, workoutId: sorted[i].id });
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

// The best estimated 1RM for an exercise across all history. This is the
// tiebreaker (rule 3): it ranks exercises against each other, which raw weight
// can never do — 60 kg of lat pulldown and 60 kg of curl are not the same claim.
export function bestE1RM(exerciseId, workouts) {
  let best = 0;
  for (const w of workouts) {
    for (const s of w.sets || []) {
      if (s.exerciseId === exerciseId && isWorking(s)) {
        best = Math.max(best, estimate1RM(s.weightKg, s.reps));
      }
    }
  }
  return best;
}
