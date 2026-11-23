// Aggregates existing workout data into the stat pack used by the Progress Share Card.
// Reuses calculations.js rather than re-deriving PRs/volume/streaks in a second place.
import {
  isWorking, workingVolume, estimate1RM, e1rmSeries, muscleVolume, repRangeCounts
} from './calculations.js';
import { computeTotals } from '../hooks/useWorkoutTotals.js';
import { SHARE_WINDOWS, timeframeList, resolveRange } from './timeframes.js';

// The share card's own preset, built from the one timeframe registry rather
// than a fourth hand-maintained list. Shape unchanged: ProgressShareCard reads
// .id and .label off these.
export const TIMEFRAMES = timeframeList(SHARE_WINDOWS);

// Re-exported so the card's range maths and this module's cannot diverge.
export { resolveRange };

// periodLabel/periodTitle are module-private: their output reaches callers as
// summary.label and summary.title, and nothing imported the functions. The
// METRICS list that used to sit here was exported and imported by nothing —
// ProgressShareCard carries its own STYLE_METRICS.
function formatShortDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function periodLabel(timeframeId, start, end) {
  const tf = TIMEFRAMES.find((t) => t.id === timeframeId);
  if (timeframeId === 'custom') return `${formatShortDate(start)} — ${formatShortDate(end)}`.toUpperCase();
  return tf ? tf.shortLabel : `${formatShortDate(start)} — ${formatShortDate(end)}`.toUpperCase();
}

// Human-cased headline, e.g. "6 Months" or "Sep 4 – Sep 18" for a custom range.
function periodTitle(timeframeId, start, end) {
  if (timeframeId === 'custom') return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  const tf = TIMEFRAMES.find((t) => t.id === timeframeId);
  return tf ? tf.label : `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

// THIS IS NOT A PR. prs.js is the only authority on that question, and its
// answer is weight/reps/volume, one per exercise per session, judged against
// everything that came before.
//
// What this measures is PERIOD IMPROVEMENT: current best est. 1RM (as of `end`)
// against the best achieved strictly before `start`. That is a different and
// legitimate question — "how much stronger did this period make me" — but it is
// period-scoped, uncategorised, and would call a lift a record for beating a
// baseline it had already beaten before the window opened. The share card's
// "Personal Records" heading is card framing over this number; the summary's
// `prs` key keeps its name only because the card reads it.
//
// Every exercise trained inside the period is returned, because the card's
// exercise picker needs the full roster; callers filter down themselves.
function exerciseImprovement(workouts, exerciseMap, start, end) {
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

// The subset of exerciseImprovement() worth leading a card with — a real gain,
// or brand new to the period with a real value.
function filterToImprovements(exerciseOptions) {
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

// SUPERSEDED by calculations.e1rmSeries(), which this was a copy of plus a date
// filter. Kept as a wrapper because ProgressShareCard calls it positionally.
export function strengthSeriesFor(workouts, exerciseId, start, end) {
  return e1rmSeries(workouts, exerciseId, { start, end });
}

// Full stat pack for the Progress Share Card, plus per-metric availability flags so the
// UI can grey out / auto-disable toggles that have nothing meaningful to show.
export function buildProgressSummary(workouts, exercises, { timeframeId = '6m', custom } = {}) {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const { start, end } = resolveRange(timeframeId, workouts, custom);

  const exerciseOptions = exerciseImprovement(workouts, exerciseMap, start, end);
  const prs = filterToImprovements(exerciseOptions);
  const training = trainingStats(workouts, start, end);
  // THE STREAK IS AS OF NOW, not as of the period's end (D1). It used to be
  // computeStreak(workouts, end), which on a custom range ending in the past
  // printed the streak you had back then under the same word the Progress
  // header uses for the one you have today. There is no reading of "your streak
  // during March" a user would guess from "Streak". Reading it off
  // computeTotals — the app's one totals derivation, which socialSummary and
  // feedPresenter already use — means there is a single code path rather than
  // two that have to agree.
  const streakWeeks = computeTotals(workouts).streakWeeks;
  const muscle = muscleVolume(workouts, exercises, { start, end });
  const repRange = repRangeCounts(workouts, { start, end });

  // Default headline exercise for the Strength Progression line — the user can override
  // this via the exercise picker; this is just what the card shows before they touch it.
  const headlineExerciseId = prs[0]?.exerciseId || exerciseOptions[0]?.exerciseId || mostTrainedExerciseId(workouts, start, end);
  const headlineExerciseName = headlineExerciseId ? (exerciseMap.get(headlineExerciseId)?.name || 'Exercise') : null;
  const strengthSeries = headlineExerciseId ? e1rmSeries(workouts, headlineExerciseId, { start, end }) : [];

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
