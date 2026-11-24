// TWO PERIODS, SIDE BY SIDE.
//
// Nothing here recomputes a number that already has a canonical function.
// Volume is workingVolume, the muscle split is muscleVolume, the rep buckets are
// repRangeCounts, and "sessions" means what rankExercises means by it — distinct
// workouts containing at least one working set. This module compares, and that
// is all it does.
import { workingVolume, muscleVolume, repRangeCounts } from './calculations.js';
import { rankExercises } from './exerciseStats.js';

const DAY = 86400000;

// Two durations within a day of each other are the same length for comparison
// purposes. A month-against-month comparison differs by up to three days and
// flagging that as incomparable would be pedantry, not accuracy.
export const EQUAL_LENGTH_TOLERANCE_DAYS = 1;

// A PERCENT CHANGE THAT SURVIVES A ZERO BASELINE.
//
// Comparing a quiet period with a busy one divides by zero constantly, and
// "+Infinity%" is not a thing to show a person. Callers branch on `kind`, never
// on the number:
//
//   change — both sides have something; pct is the real percentage
//   new    — nothing in A, something in B; pct is null, because the increase
//            from nothing has no percentage
//   gone   — something in A, nothing in B; pct is -100, which is exact
//   none   — nothing either side; pct is 0, because nothing changed
export function change(from, to) {
  const a = Number.isFinite(from) ? from : 0;
  const b = Number.isFinite(to) ? to : 0;
  const abs = b - a;
  if (a > 0 && b > 0) return { from: a, to: b, abs, pct: ((b - a) / a) * 100, kind: 'change' };
  if (a === 0 && b > 0) return { from: a, to: b, abs, pct: null, kind: 'new' };
  if (a > 0 && b === 0) return { from: a, to: b, abs, pct: -100, kind: 'gone' };
  return { from: a, to: b, abs: 0, pct: 0, kind: 'none' };
}

// The same-length period immediately before this one.
//
// `end` lands one millisecond before `range.start`, so the two cannot overlap
// under the inclusive [start, end] filter every other range in the app uses,
// and `start` is pulled back by that millisecond too so the two periods are
// EXACTLY the same length. Without the second adjustment the earlier period is
// 1 ms shorter, which is invisible on screen but makes every equal-length
// assertion approximate rather than exact.
export function precedingRange(range) {
  const duration = range.end - range.start;
  return { start: range.start - duration - 1, end: range.start - 1 };
}

// A DATE INPUT'S "YYYY-MM-DD" AS A LOCAL DAY, NOT A UTC ONE.
//
// new Date("2026-02-01") parses as UTC midnight, but every workout date in this
// app is a local timestamp. Taking the UTC instant shifts both ends of a custom
// range by the timezone offset: in UTC+2 a range picked as Feb 1 ran to Feb 2
// and excluded anything logged before 02:00 on its opening day. Splitting the
// string and building local midnight and local end-of-day is offset-proof.
export function localDayBounds(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  // Round-trips back to the same calendar day, so "2026-02-31" is rejected
  // rather than silently becoming March 3rd.
  if (start.getFullYear() !== y || start.getMonth() !== m - 1 || start.getDate() !== d) return null;
  return { start: start.getTime(), end: new Date(y, m - 1, d, 23, 59, 59, 999).getTime() };
}

// A custom range from two date-input strings, inclusive of the whole closing
// day — a range picked as the 1st to the 7th has to contain the 7th's evening
// session. Null when either date is missing, malformed, or out of order.
export function customRange(fromValue, toValue) {
  const from = localDayBounds(fromValue);
  const to = localDayBounds(toValue);
  if (!from || !to) return null;
  return from.start < to.end ? { start: from.start, end: to.end } : null;
}

// Days a range covers, floored at 1 so a per-week rate can never divide by zero
// — a range of a single instant is still "one day" for rate purposes.
export function rangeDays(range) {
  return Math.max(1, (range.end - range.start) / DAY);
}

function periodStats(workouts, exercises, range) {
  const { start, end } = range;
  const inPeriod = (workouts || []).filter((w) => w.date >= start && w.date <= end);
  const volumeKg = inPeriod.reduce((a, w) => a + workingVolume(w.sets || []), 0);
  const days = rangeDays(range);
  const weeks = days / 7;
  // Frequency mode, so `sessions` and `volumeKg` per exercise mean exactly what
  // the dashboard's own list means by them.
  const { rows } = rankExercises(workouts, exercises, { mode: 'frequency', start, end });

  return {
    start,
    end,
    days,
    workouts: inPeriod.length,
    volumeKg,
    exerciseCount: rows.length,
    perWeek: inPeriod.length / weeks,
    volumePerWeek: volumeKg / weeks,
    repRange: repRangeCounts(workouts, { start, end }),
    muscle: muscleVolume(workouts, exercises, { start, end }),
    rows
  };
}

// Pairs the two periods' distribution rows by label, keeping every label that
// appears in either. A muscle group trained only in B must still show up — its
// absence from A is the interesting part.
function pairDistribution(aRows, bRows, valueKey) {
  const labels = [];
  const seen = new Set();
  for (const row of [...aRows, ...bRows]) {
    if (!seen.has(row.label)) { seen.add(row.label); labels.push(row.label); }
  }
  const aBy = new Map(aRows.map((r) => [r.label, r]));
  const bBy = new Map(bRows.map((r) => [r.label, r]));

  return labels.map((label) => {
    const ra = aBy.get(label);
    const rb = bBy.get(label);
    const a = { [valueKey]: ra?.[valueKey] || 0, pct: ra?.pct || 0 };
    const b = { [valueKey]: rb?.[valueKey] || 0, pct: rb?.pct || 0 };
    return {
      label,
      a,
      b,
      // PERCENTAGE POINTS, not a percentage of a percentage. Going from 10% of
      // your volume to 15% is "+5 points", and calling it "+50%" would be true
      // of the share and wildly misleading about the training.
      pctPointDelta: b.pct - a.pct,
      value: change(a[valueKey], b[valueKey])
    };
  });
}

function byVolumeThenName(a, b) {
  return b.volumeKg - a.volumeKg || (a.exercise.name || '').localeCompare(b.exercise.name || '');
}

function exerciseSelection(aStats, bStats) {
  const aBy = new Map(aStats.rows.map((r) => [r.exerciseId, r]));
  const bBy = new Map(bStats.rows.map((r) => [r.exerciseId, r]));

  const introduced = bStats.rows.filter((r) => !aBy.has(r.exerciseId)).sort(byVolumeThenName);
  const dropped = aStats.rows.filter((r) => !bBy.has(r.exerciseId)).sort(byVolumeThenName);

  const kept = bStats.rows
    .filter((r) => aBy.has(r.exerciseId))
    .map((r) => {
      const was = aBy.get(r.exerciseId);
      return {
        exerciseId: r.exerciseId,
        exercise: r.exercise,
        sessions: change(was.sessions, r.sessions),
        volumeKg: change(was.volumeKg, r.volumeKg)
      };
    })
    // Biggest volume gain first. A kept lift with no change sorts between the
    // gainers and the fallers, which is where a reader expects to find it.
    .sort((x, y) => y.volumeKg.abs - x.volumeKg.abs
      || (x.exercise.name || '').localeCompare(y.exercise.name || ''));

  return { introduced, dropped, kept };
}

export function compareTrainingPeriods(workouts, exercises, rangeA, rangeB) {
  const a = periodStats(workouts, exercises, rangeA);
  const b = periodStats(workouts, exercises, rangeB);

  const equalLength = Math.abs(a.days - b.days) <= EQUAL_LENGTH_TOLERANCE_DAYS;

  return {
    a,
    b,
    delta: {
      workouts: change(a.workouts, b.workouts),
      volumeKg: change(a.volumeKg, b.volumeKg),
      exerciseCount: change(a.exerciseCount, b.exerciseCount),
      perWeek: change(a.perWeek, b.perWeek),
      volumePerWeek: change(a.volumePerWeek, b.volumePerWeek)
    },
    repRange: pairDistribution(a.repRange, b.repRange, 'count'),
    muscle: pairDistribution(a.muscle, b.muscle, 'volumeKg'),
    exercises: exerciseSelection(a, b),
    shape: {
      daysA: a.days,
      daysB: b.days,
      equalLength,
      // Only meaningful when the lengths differ; it is what makes the per-week
      // rates the honest comparison rather than the totals.
      lengthRatio: a.days > 0 ? b.days / a.days : null
    },
    flags: {
      emptyA: a.workouts === 0,
      emptyB: b.workouts === 0,
      emptyBoth: a.workouts === 0 && b.workouts === 0,
      identical: rangeA.start === rangeB.start && rangeA.end === rangeB.end,
      // Shared days are counted in both periods. Worth saying, not worth
      // refusing: comparing "last 3 months" with "last month" is a reasonable
      // question to ask.
      overlapping: rangeA.start <= rangeB.end && rangeB.start <= rangeA.end,
      // The user's order is kept either way; the screen says which period is
      // the later one rather than silently swapping their choice.
      reversed: rangeA.start > rangeB.start
    }
  };
}
