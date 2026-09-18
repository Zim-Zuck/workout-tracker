// Aggregates existing workout data into the stat pack used by the Progress Share Card.
// Reuses calculations.js rather than re-deriving PRs/volume/streaks in a second place.
import { isWorking, workingVolume, estimate1RM, computeStreak } from './calculations.js';

export const TIMEFRAMES = [
  { id: '4w', label: '4 Weeks', shortLabel: '4 WEEKS', days: 28 },
  { id: '3m', label: '3 Months', shortLabel: '3 MONTHS', days: 90 },
  { id: '6m', label: '6 Months', shortLabel: '6 MONTHS', days: 182 },
  { id: '1y', label: '1 Year', shortLabel: '1 YEAR', days: 365 },
  { id: 'all', label: 'All Time', shortLabel: 'ALL TIME', days: null },
  { id: 'custom', label: 'Custom', shortLabel: 'CUSTOM', days: null }
];

// All metrics a card can show, in a sensible default priority order.
export const METRICS = [
  { id: 'prs', label: 'Personal Records' },
  { id: 'workouts', label: 'Workouts' },
  { id: 'volume', label: 'Volume' },
  { id: 'streak', label: 'Streak' },
  { id: 'strength', label: 'Strength Progression' },
  { id: 'muscle', label: 'Muscle Distribution' },
  { id: 'repRange', label: 'Rep Ranges' }
];

export function resolveRange(timeframeId, workouts, custom) {
  const now = Date.now();
  if (timeframeId === 'custom' && custom?.from && custom?.to) {
    return { start: custom.from, end: custom.to };
  }
  const tf = TIMEFRAMES.find((t) => t.id === timeframeId) || TIMEFRAMES[2];
  if (tf.days == null) {
    const first = workouts.reduce((m, w) => Math.min(m, w.date), now);
    return { start: workouts.length ? first : now - 28 * 86400000, end: now };
  }
  return { start: now - tf.days * 86400000, end: now };
}

function formatShortDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function periodLabel(timeframeId, start, end) {
  const tf = TIMEFRAMES.find((t) => t.id === timeframeId);
  if (timeframeId === 'custom') return `${formatShortDate(start)} — ${formatShortDate(end)}`.toUpperCase();
  return tf ? tf.shortLabel : `${formatShortDate(start)} — ${formatShortDate(end)}`.toUpperCase();
}

// Human-cased headline, e.g. "6 Months" or "Sep 4 – Sep 18" for a custom range.
export function periodTitle(timeframeId, start, end) {
  if (timeframeId === 'custom') return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  const tf = TIMEFRAMES.find((t) => t.id === timeframeId);
  return tf ? tf.label : `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

// Per-exercise improvement across the period: current best (as of `end`) vs the best
// achieved strictly before `start`. Every exercise actually trained inside the period is
// returned (the "exercise picker" needs the full roster) — callers filter down to real
// improvements themselves when they only want PRs.
function exerciseProgress(workouts, exerciseMap, start, end) {
  const byExercise = new Map();
  for (const w of workouts) {
    if (w.date > end) continue;
    for (const s of w.sets) {
      if (!isWorking(s)) continue;
      if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
      byExercise.get(s.exerciseId).push({ ...s, workoutDate: w.date });
    }
  }

  const results = [];
  for (const [exId, sets] of byExercise) {
    const inPeriod = sets.filter((s) => s.workoutDate >= start && s.workoutDate <= end);
    if (!inPeriod.length) continue;
    const before = sets.filter((s) => s.workoutDate < start);

    const currentE1rm = sets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
    const currentTopWeight = sets.reduce((m, s) => Math.max(m, s.weightKg), 0);

    // Prefer a real baseline from before the period. When the user's whole history sits
    // inside the period (e.g. a new lifter on "6 Months"), fall back to first-vs-latest
    // progress within the period itself, rather than a bare "New" with no context.
    let baselineE1rm, isNew;
    if (before.length) {
      baselineE1rm = before.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
      isNew = false;
    } else {
      const sortedInPeriod = [...inPeriod].sort((a, b) => a.workoutDate - b.workoutDate);
      baselineE1rm = estimate1RM(sortedInPeriod[0].weightKg, sortedInPeriod[0].reps);
      isNew = sortedInPeriod.length < 2;
    }
    const deltaKg = currentE1rm - baselineE1rm;
    const improved = !isNew && deltaKg > 0.01;

    results.push({
      exerciseId: exId,
      exerciseName: exerciseMap.get(exId)?.name || 'Exercise',
      valueKg: currentE1rm,
      topWeightKg: currentTopWeight,
      deltaKg,
      isNew,
      improved
    });
  }

  return results.sort((a, b) => (b.deltaKg - a.deltaKg) || (b.valueKg - a.valueKg));
}

// The subset of exerciseProgress() that actually represents a "personal record" worth
// leading with — a real improvement, or brand new to the period with a real value.
function filterToPRs(exerciseOptions) {
  return exerciseOptions.filter((r) => (r.isNew ? r.valueKg > 0 : r.improved));
}

function trainingStats(workouts, start, end) {
  const inPeriod = workouts.filter((w) => w.date >= start && w.date <= end);
  const workoutCount = inPeriod.length;
  const volumeKg = inPeriod.reduce((a, w) => a + workingVolume(w.sets), 0);
  const days = Math.max(1, (end - start) / 86400000);
  const perWeek = workoutCount / (days / 7);

  const prevStart = start - (end - start);
  const prevWorkouts = workouts.filter((w) => w.date >= prevStart && w.date < start);
  const prevVolumeKg = prevWorkouts.reduce((a, w) => a + workingVolume(w.sets), 0);
  const volumePct = prevVolumeKg > 0 ? Math.round(((volumeKg - prevVolumeKg) / prevVolumeKg) * 100) : null;

  return { workoutCount, volumeKg, perWeek, volumePct, hasPrevPeriodData: prevWorkouts.length > 0 };
}

// Volume share per muscle group in the period. Each exercise's volume is split evenly
// across all of its tagged muscle groups (matches the dashboard's muscle-distribution chart).
function muscleDistribution(workouts, exercises, start, end) {
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const totals = {};
  let grandTotal = 0;
  for (const w of workouts) {
    if (w.date < start || w.date > end) continue;
    for (const s of w.sets) {
      if (!isWorking(s)) continue;
      const ex = exMap.get(s.exerciseId);
      const groups = ex?.muscleGroups || [];
      if (!groups.length) continue;
      const vol = s.weightKg * s.reps;
      const share = vol / groups.length;
      for (const g of groups) totals[g] = (totals[g] || 0) + share;
      grandTotal += vol;
    }
  }
  return Object.entries(totals)
    .map(([label, kg]) => ({ label, volumeKg: kg, pct: grandTotal ? Math.round((kg / grandTotal) * 100) : 0 }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

function repRangeDistribution(workouts, start, end) {
  const buckets = { '1–5': 0, '6–9': 0, '10–14': 0, '15+': 0 };
  let total = 0;
  for (const w of workouts) {
    if (w.date < start || w.date > end) continue;
    for (const s of w.sets) {
      if (!isWorking(s)) continue;
      total++;
      if (s.reps <= 5) buckets['1–5']++;
      else if (s.reps <= 9) buckets['6–9']++;
      else if (s.reps <= 14) buckets['10–14']++;
      else buckets['15+']++;
    }
  }
  return Object.entries(buckets).map(([label, count]) => ({
    label, count, pct: total ? Math.round((count / total) * 100) : 0
  }));
}

function mostTrainedExerciseId(workouts, start, end) {
  const counts = new Map();
  for (const w of workouts) {
    if (w.date < start || w.date > end) continue;
    for (const s of w.sets) {
      if (!isWorking(s)) continue;
      counts.set(s.exerciseId, (counts.get(s.exerciseId) || 0) + 1);
    }
  }
  let best = null, bestCount = 0;
  for (const [id, c] of counts) if (c > bestCount) { best = id; bestCount = c; }
  return best;
}

// Est. 1RM at each workout date for one exercise, within [start, end] only. Exported so the
// card can recompute the Strength Progression line for whichever exercise the user picks.
export function strengthSeriesFor(workouts, exerciseId, start, end) {
  const rows = [];
  for (const w of [...workouts].sort((a, b) => a.date - b.date)) {
    if (w.date < start || w.date > end) continue;
    const sets = w.sets.filter((s) => s.exerciseId === exerciseId && isWorking(s));
    if (!sets.length) continue;
    const best = sets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
    rows.push({ date: w.date, e1rmKg: best });
  }
  return rows;
}

// Full stat pack for the Progress Share Card, plus per-metric availability flags so the
// UI can grey out / auto-disable toggles that have nothing meaningful to show.
export function buildProgressSummary(workouts, exercises, { timeframeId = '6m', custom } = {}) {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const { start, end } = resolveRange(timeframeId, workouts, custom);

  const exerciseOptions = exerciseProgress(workouts, exerciseMap, start, end);
  const prs = filterToPRs(exerciseOptions);
  const training = trainingStats(workouts, start, end);
  const streakWeeks = computeStreak(workouts, end);
  const muscle = muscleDistribution(workouts, exercises, start, end);
  const repRange = repRangeDistribution(workouts, start, end);

  // Default headline exercise for the Strength Progression line — the user can override
  // this via the exercise picker; this is just what the card shows before they touch it.
  const headlineExerciseId = prs[0]?.exerciseId || exerciseOptions[0]?.exerciseId || mostTrainedExerciseId(workouts, start, end);
  const headlineExerciseName = headlineExerciseId ? (exerciseMap.get(headlineExerciseId)?.name || 'Exercise') : null;
  const strengthSeries = headlineExerciseId ? strengthSeriesFor(workouts, headlineExerciseId, start, end) : [];

  const firstWorkoutDate = workouts.reduce((m, w) => Math.min(m, w.date), Infinity);
  const spanDays = workouts.length ? Math.max(0, (end - Math.max(start, firstWorkoutDate)) / 86400000) : 0;
  const requestedDays = (end - start) / 86400000;
  // Flag when the user's actual training history covers noticeably less than the
  // requested window, so the UI can avoid implying a full period's worth of progress.
  const limitedHistory = workouts.length > 0 && firstWorkoutDate > start;

  return {
    timeframeId,
    start,
    end,
    label: periodLabel(timeframeId, start, end),
    title: periodTitle(timeframeId, start, end),
    prs,
    exerciseOptions,
    training,
    streakWeeks,
    muscle,
    repRange,
    headlineExerciseId,
    headlineExerciseName,
    strengthSeries,
    limitedHistory,
    firstWorkoutDate: Number.isFinite(firstWorkoutDate) ? firstWorkoutDate : null,
    spanDays,
    requestedDays,
    available: {
      prs: prs.length > 0,
      workouts: training.workoutCount > 0,
      volume: training.volumeKg > 0,
      streak: streakWeeks > 0,
      strength: strengthSeries.length >= 2,
      muscle: muscle.length >= 2,
      repRange: repRange.some((r) => r.count > 0)
    }
  };
}
