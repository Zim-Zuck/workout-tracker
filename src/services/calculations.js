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

// THE ARITHMETIC IS TOTAL. normalize.js already coerces a non-finite weightKg
// or reps to 0 on the way out of the database, but that is a different layer and
// a different file — anything reaching these two functions by another route (an
// import, a sync payload, a set still being typed) would otherwise carry an
// Infinity or a NaN straight through volume, e1RM, the trend, the rankings and
// the period comparison and out onto the screen as "NaN kg". Two guards here
// make the invariant local to the arithmetic that depends on it.
const finite = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export function estimate1RM(weightKg, reps) {
  const w = finite(weightKg);
  const n = finite(reps);
  if (!w || !n) return 0;
  const r = Math.min(n, E1RM_REP_CAP);
  return w * (1 + r / 30);
}

export function setVolume(set) {
  return finite(set.weightKg) * finite(set.reps);
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
//
// No production caller at present — its remaining use is readback.test.mjs,
// where it proves no set is lost on a workout referencing an unknown exercise.
// Kept for that: deleting it would delete the coverage, not the risk.
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

// Best completed, non-warm-up set for exerciseId across ALL of history — not
// just the most recent session. A deload week must never read as a new best:
// the only way to raise this number is to actually lift more.
//
// "Best" means heaviest weight among sets that hit MIN_BEST_SET_REPS reps or
// more — a heavy triple doesn't demonstrate the same capability a double-
// progression target cares about, so it loses to a lighter set that cleared
// the rep floor. Ties go to more reps, then to the more recent set. Exercises
// where nothing ever clears that floor (pure low-rep strength work, or a lift
// still building up) fall back to the heaviest completed set regardless of reps.
//
// `workouts` must be sorted desc by date, same contract as previousPerformance
// above — a recency tie is resolved by "seen first" under that order.
export const MIN_BEST_SET_REPS = 5;

export function bestSetAcrossHistory(exerciseId, workouts) {
  let qualified = null;
  let heaviest = null;
  for (const w of workouts || []) {
    for (const s of w.sets || []) {
      if (s.exerciseId !== exerciseId || !isWorking(s)) continue;
      if (!(s.weightKg > 0) || !(s.reps > 0)) continue;
      if (!heaviest || outranksSet(s, heaviest)) heaviest = s;
      if (s.reps >= MIN_BEST_SET_REPS && (!qualified || outranksSet(s, qualified))) qualified = s;
    }
  }
  return qualified || heaviest;
}

function outranksSet(a, b) {
  if (a.weightKg !== b.weightKg) return a.weightKg > b.weightKg;
  return a.reps > b.reps; // equal on both — keep `b`, which was seen first (more recent)
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

// Consecutive ISO weeks with at least one workout, counting back from `asOf`
// (defaults to now). Weeks with zero workouts break the streak.
//
// THE CURRENT WEEK IS A GRACE WEEK. It is counted when it already has a
// session, but an empty one does not end the streak — the count simply runs
// from last week instead. Without that, eight solid weeks read as "0w" from
// Monday morning until the next session, which is both wrong and the single
// most discouraging moment to tell somebody their streak is gone. Two empty
// weeks in a row is a real break and still returns 0.
//
// The grace week is never counted as a week trained, so a streak cannot grow
// without training: eight weeks ending last week reads 8 today, and becomes 9
// only once this week has a session in it.
export function computeStreak(workouts, asOf = Date.now()) {
  if (!workouts.length) return 0;
  const weeks = new Set(workouts.map((w) => startOfWeek(w.date)));
  const thisWeek = startOfWeek(asOf);
  let cur = weeks.has(thisWeek) ? thisWeek : thisWeek - 7 * 86400000;
  let count = 0;
  while (weeks.has(cur)) {
    count++;
    cur -= 7 * 86400000;
  }
  return count;
}

// HOW LONG A SESSION TOOK, in whole minutes, or null when it cannot be known.
//
// A session with no endTime is still running, or was logged without the timer;
// either way its length is unknown and has to stay unknown rather than become a
// zero that drags an average down. Five hours is the plausibility ceiling: past
// it the overwhelmingly likely explanation is a timer left running overnight,
// not a five-hour session, and one of those is enough to double a month's
// average on its own.
//
// Canonical, because two callers already needed it — the weekly summary's
// duration_min and the Evolution screen's average session — and two private
// copies of a plausibility rule is how the two screens come to disagree about
// the same number.
export const MAX_PLAUSIBLE_SESSION_MIN = 300;

export function sessionMinutes(workout) {
  if (!workout?.startTime || !workout?.endTime) return null;
  const min = Math.round((workout.endTime - workout.startTime) / 60000);
  if (min <= 0 || min > MAX_PLAUSIBLE_SESSION_MIN) return null;
  return min;
}

// THE BEST WORKING SET OF EACH SESSION, for one exercise, oldest first.
//
// ONE OBSERVATION PER SESSION, not per set. Per-set observations are noisy by
// construction, because back-off and drop sets are MEANT to be lighter; the
// session's best working set is the capability the session demonstrated.
//
// Carries the weight and reps alongside the estimate, because a caller that
// wants to know whether the 12-rep Epley cap is flattening the numbers has to
// see the reps that produced them.
export function bestSetSeries(workouts, exerciseId, { start = -Infinity, end = Infinity } = {}) {
  const rows = [];
  for (const w of [...(workouts || [])].sort((a, b) => a.date - b.date)) {
    if (w.date < start || w.date > end) continue;
    const sets = (w.sets || []).filter((s) => s.exerciseId === exerciseId);
    const best = bestWorkingSet(sets);
    // A session with only warm-ups or unchecked sets is not an observation. A
    // session logged at zero load IS one, at zero — "trained with no recorded
    // load" and "never trained" are different facts.
    if (!best) continue;
    rows.push({ date: w.date, e1rmKg: best.e1rm, weightKg: best.set.weightKg, reps: best.set.reps });
  }
  return rows;
}

// Est. 1RM at each workout date for one exercise — used to overlay two
// exercises' trends and to draw the share card's strength line.
//
// The optional range is what retired progressSummary.strengthSeriesFor(), which
// was this function plus a date filter, copied.
export function e1rmSeries(workouts, exerciseId, range) {
  return bestSetSeries(workouts, exerciseId, range).map(({ date, e1rmKg }) => ({ date, e1rmKg }));
}

// A Map whether it arrived as one or as the raw exercise array. Progress.jsx
// already memoizes a Map and should not have to rebuild one per render; the
// share card holds the array. Cheaper than making one of them convert.
function asMap(exercises) {
  if (!exercises) return new Map();
  return typeof exercises.get === 'function' ? exercises : new Map(exercises.map((e) => [e.id, e]));
}

// VOLUME SHARE PER MUSCLE GROUP.
//
// Each set's volume is split EVENLY across the exercise's tagged muscle groups
// — not duplicated into each, which would make the percentages sum past 100 and
// make a multi-tagged compound look like three exercises. Tiers are deliberately
// not used here: this answers "where did the work go", and a bench press does
// put real work through the triceps.
//
// A set on an exercise with no tags (or on an exercise that no longer exists)
// contributes to NEITHER the totals nor the denominator — it cannot be
// attributed, so including it would quietly shrink every real percentage.
//
// Sorted by volume. The dashboard's radar re-sorts into anatomical order
// itself, because the radar is read as a shape; that is presentation and stays
// in the screen.
export function muscleVolume(workouts, exercises, { start = -Infinity, end = Infinity } = {}) {
  const exMap = asMap(exercises);
  const totals = new Map();
  let grandTotal = 0;
  for (const w of workouts || []) {
    if (w.date < start || w.date > end) continue;
    for (const s of w.sets || []) {
      if (!isWorking(s)) continue;
      const groups = exMap.get(s.exerciseId)?.muscleGroups || [];
      if (!groups.length) continue;
      const vol = setVolume(s);
      const share = vol / groups.length;
      for (const g of groups) totals.set(g, (totals.get(g) || 0) + share);
      grandTotal += vol;
    }
  }
  return [...totals.entries()]
    .map(([label, volumeKg]) => ({
      label,
      volumeKg,
      pct: grandTotal ? Math.round((volumeKg / grandTotal) * 100) : 0
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

// The rep-range buckets, in one place. Edges and labels are the ones the
// dashboard's donut and the share card were already using independently.
export const REP_RANGES = [
  { label: '1–5', max: 5 },
  { label: '6–9', max: 9 },
  { label: '10–14', max: 14 },
  { label: '15+', max: Infinity }
];

// Working sets per rep range. Every bucket is returned in fixed order, zeroes
// included, so a chart's categories do not appear and disappear between windows.
export function repRangeCounts(workouts, { start = -Infinity, end = Infinity } = {}) {
  const counts = REP_RANGES.map(() => 0);
  let total = 0;
  for (const w of workouts || []) {
    if (w.date < start || w.date > end) continue;
    for (const s of w.sets || []) {
      if (!isWorking(s)) continue;
      total++;
      counts[REP_RANGES.findIndex((r) => s.reps <= r.max)]++;
    }
  }
  return REP_RANGES.map((r, i) => ({
    label: r.label,
    count: counts[i],
    pct: total ? Math.round((counts[i] / total) * 100) : 0
  }));
}
