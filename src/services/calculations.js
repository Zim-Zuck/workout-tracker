// Pure functions over set/workout data. No React, no I/O.
// Set shape: { id, exerciseId, type: 'warmup'|'working'|'drop'|'failure', weightKg, reps, timestamp, completed, rpe?, notes? }
import { startOfWeek } from '../utils/date.js';

export function isWorking(set) {
  return set && set.completed && set.type !== 'warmup';
}

// Epley 1RM estimate.
//
// Capped at 12 reps, which is what the comment always claimed and what the
// formula is actually good for — the code capped at 20, where Epley inflates
// badly (20 reps reads as 1.67x the bar, which nobody's true single is). The cap
// matters because this number decides PR ties, leaderboard order and challenge
// results, so an inflated set of 20 light curls could out-rank a hard triple.
//
// Above the cap the estimate stops rising: a set of 20 is scored as a set of 12
// at the same weight. That understates a genuinely strong high-rep set, which is
// the safer direction to be wrong in for a number used to rank people.
export const E1RM_REP_CAP = 12;

export function estimate1RM(weightKg, reps) {
  if (!weightKg || !reps) return 0;
  const r = Math.min(reps, E1RM_REP_CAP);
  return weightKg * (1 + r / 30);
}

export function setVolume(set) {
  return (set.weightKg || 0) * (set.reps || 0);
}

// Volume of working sets only (warm-ups excluded).
export function workingVolume(sets) {
  return sets.filter(isWorking).reduce((a, s) => a + setVolume(s), 0);
}

// Best working set of an exercise from a set list, by estimated 1RM.
export function bestWorkingSet(sets) {
  let best = null;
  for (const s of sets) {
    if (!isWorking(s)) continue;
    const e = estimate1RM(s.weightKg, s.reps);
    if (!best || e > best.e1rm) best = { set: s, e1rm: e };
  }
  return best;
}

// Group sets by exerciseId, ordered by timestamp.
export function groupSetsByExercise(sets) {
  const map = new Map();
  for (const s of sets) {
    if (!map.has(s.exerciseId)) map.set(s.exerciseId, []);
    map.get(s.exerciseId).push(s);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.timestamp - b.timestamp);
  return map;
}

// Last workout in `workouts` (sorted desc by date) that contains working sets for exerciseId.
// Returns { workout, sets } or null.
export function previousPerformance(exerciseId, workouts) {
  for (const w of workouts) {
    const rel = (w.sets || []).filter((s) => s.exerciseId === exerciseId && isWorking(s));
    if (rel.length) return { workout: w, sets: rel };
  }
  return null;
}

// Compact "80 kg × 8, 8, 7" summary of a set list, weights collapsed when identical.
export function summarizeSets(sets, formatWeightFn) {
  if (!sets.length) return '';
  const w0 = sets[0].weightKg;
  const allSame = sets.every((s) => s.weightKg === w0);
  if (allSame) {
    return `${formatWeightFn(w0)} × ${sets.map((s) => s.reps).join(', ')}`;
  }
  return sets.map((s) => `${formatWeightFn(s.weightKg)}×${s.reps}`).join(', ');
}

// Detect PRs achieved *in this workout* for a given exercise vs prior history.
//
// prevSets     = all working sets for this exercise from workouts BEFORE this one.
// currentSets  = working sets from this workout for this exercise.
// prevSessions = those same prior sets GROUPED BY WORKOUT, needed for volume.
//
// Returns { weight, reps, e1rm, volume } with `true` for each new PR.
//
// VOLUME IS PER SESSION, NOT CUMULATIVE.
// This used to compare one session's volume against the sum of every previous
// session's, which no single workout can ever beat — so the volume PR existed in
// the code and never once fired. A volume PR means "the most work you have done
// on this lift in one session", which is the only reading that is both
// achievable and worth telling somebody about.
export function detectPRs(prevSets, currentSets, prevSessions = null) {
  const prevMaxWeight = prevSets.reduce((m, s) => Math.max(m, s.weightKg), 0);
  const prevMaxE1rm = prevSets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
  const prevBestSessionVol = (prevSessions || [])
    .reduce((m, sessionSets) => Math.max(m, sessionSets.reduce((a, s) => a + setVolume(s), 0)), 0);
  // Reps PR is "at a given weight": for each weight the current sets hit,
  // was more reps achieved than the previous best at that weight?
  const prevRepsAtWeight = new Map();
  for (const s of prevSets) prevRepsAtWeight.set(s.weightKg, Math.max(prevRepsAtWeight.get(s.weightKg) || 0, s.reps));

  let weightPR = false, e1rmPR = false, repsPR = false;
  const curVol = currentSets.reduce((a, s) => a + setVolume(s), 0);
  // Without session grouping there is nothing honest to compare against, so no
  // volume PR is claimed rather than one being invented from the wrong baseline.
  const volumePR = prevBestSessionVol > 0 && curVol > prevBestSessionVol;
  for (const s of currentSets) {
    if (s.weightKg > prevMaxWeight) weightPR = true;
    if (estimate1RM(s.weightKg, s.reps) > prevMaxE1rm) e1rmPR = true;
    const prevReps = prevRepsAtWeight.get(s.weightKg) || 0;
    if (prevReps > 0 && s.reps > prevReps) repsPR = true;
  }
  // First-ever workout for this exercise: don't flag PRs (nothing to beat).
  if (!prevSets.length) return { weight: false, reps: false, e1rm: false, volume: false };
  return { weight: weightPR, reps: repsPR, e1rm: e1rmPR, volume: volumePR };
}

// Chronological list of PR-setting workouts across all exercises, newest first.
// Each event marks a workout where a new best est. 1RM (preferred) or top weight was hit.
export function buildPrTimeline(workouts) {
  const sorted = [...workouts].sort((a, b) => a.date - b.date);
  const events = [];
  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i];
    const exIds = new Set(w.sets.filter(isWorking).map((s) => s.exerciseId));
    for (const exId of exIds) {
      const currentSets = w.sets.filter((s) => s.exerciseId === exId && isWorking(s));
      const prevSets = [];
      for (let j = 0; j < i; j++) {
        for (const s of sorted[j].sets) {
          if (s.exerciseId === exId && isWorking(s)) prevSets.push(s);
        }
      }
      if (!prevSets.length) continue;
      const pr = detectPRs(prevSets, currentSets);
      if (!pr.e1rm && !pr.weight) continue;
      if (pr.e1rm) {
        const prevBestE1rm = prevSets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
        const bestNow = bestWorkingSet(currentSets);
        events.push({ exerciseId: exId, date: w.date, kind: 'e1rm', valueKg: bestNow.e1rm, deltaKg: bestNow.e1rm - prevBestE1rm });
      } else {
        const prevBestWeight = prevSets.reduce((m, s) => Math.max(m, s.weightKg), 0);
        const topWeightNow = currentSets.reduce((m, s) => Math.max(m, s.weightKg), 0);
        events.push({ exerciseId: exId, date: w.date, kind: 'weight', valueKg: topWeightNow, deltaKg: topWeightNow - prevBestWeight });
      }
    }
  }
  return events.sort((a, b) => b.date - a.date);
}

// Consecutive ISO weeks (ending the current week) with at least one workout, counting back
// from `asOf` (defaults to now). Weeks with zero workouts break the streak.
export function computeStreak(workouts, asOf = Date.now()) {
  if (!workouts.length) return 0;
  const weeks = new Set(workouts.map((w) => startOfWeek(w.date)));
  let count = 0;
  let cur = startOfWeek(asOf);
  while (weeks.has(cur)) {
    count++;
    cur -= 7 * 86400000;
  }
  return count;
}

// Est. 1RM at each workout date for one exercise — used to overlay two exercises' trends.
export function e1rmSeries(workouts, exerciseId) {
  const rows = [];
  for (const w of [...workouts].sort((a, b) => a.date - b.date)) {
    const sets = w.sets.filter((s) => s.exerciseId === exerciseId && isWorking(s));
    if (!sets.length) continue;
    const best = sets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
    rows.push({ date: w.date, e1rmKg: best });
  }
  return rows;
}
