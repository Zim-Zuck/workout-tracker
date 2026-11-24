// ONE EXERCISE, OVER TIME. Pure functions, no React, no Date.now() default a
// test cannot control.
//
// Three questions, kept separate because they fail for different reasons:
//   classifyTrend        — is this lift going up, flat, or down?
//   exerciseConsistency  — how regularly is it trained?
//   rankExercises        — which lifts, in which order, by which measure?
import { bestSetSeries, setVolume, isWorking, E1RM_REP_CAP } from './calculations.js';

const DAY = 86400000;

// ---------------------------------------------------------------------------
// TREND CLASSIFICATION
// ---------------------------------------------------------------------------
//
// WHY ESTIMATED 1RM. It is the normaliser. Epley maps 100 kg x 5 and 80 kg x 10
// onto comparable numbers, which top weight (blind to added reps) and volume
// (confounded by set count) cannot. A lift progressed by adding reps and a lift
// progressed by adding weight both show up here.
//
// WHY A REGRESSION, NOT FIRST-VERSUS-LAST. First-versus-last rests on exactly
// two samples — the two most noise-exposed numbers available. A least-squares
// line uses every session. Linear rather than anything higher-order because it
// needs no library, is explainable in one sentence, and strength over a 4-12
// week window is approximately linear.
//
// WHY PERCENT, NOT KILOGRAMS. Rankings have to compare a 200 kg deadlift
// against a 20 kg lateral raise. 5 kg is not the same claim on both.
//
// NO OUTLIER REMOVAL. A deload week is data. Dropping a lifter's worst sessions
// would make every trend read better than the training was.

// Four sessions. A least-squares line through three points has one degree of
// freedom, so a single bad day dictates the sign of the slope; four is the
// smallest number where one outlier cannot, and it is reachable inside a month
// on any lift trained weekly.
export const TREND_MIN_SESSIONS = 4;

// Three weeks. Below that, session-to-session estimates are dominated by
// readiness — sleep, food, accumulated fatigue — rather than adaptation. Two
// good days in one week is not a trend. It is also the shortest span most
// programmes treat as a block.
export const TREND_MIN_SPAN_DAYS = 21;

// Two percent. Two percent of a 100 kg lift is 2 kg, roughly the smallest
// increment a lifter can physically add on a plate set, and about the gap
// between dumbbell sizes. A change below the resolution of the equipment is not
// a change.
export const TREND_FLAT_PCT = 2;

// The conventional weak-effect floor. Below it the line explains less than a
// third of the variation, so the DIRECTION is not supported by the data even
// when the slope is large — those become 'noisy' rather than being reported as
// a gain the lifter cannot see.
export const TREND_MIN_R2 = 0.3;

export const TREND_STATUSES = ['improving', 'steady', 'declining', 'noisy', 'insufficient'];

// INSUFFICIENT IS A STATUS, NOT A ZERO. pctChange, r2 and slope are null in
// that state so they cannot be rendered as a flat trend by accident.
function insufficient(reason, observations) {
  const sessions = observations.length;
  return {
    status: 'insufficient',
    reason,
    sessions,
    spanDays: sessions ? (observations[sessions - 1].date - observations[0].date) / DAY : 0,
    firstDate: sessions ? observations[0].date : null,
    lastDate: sessions ? observations[sessions - 1].date : null,
    slopeKgPerWeek: null,
    pctChange: null,
    r2: null,
    fittedStartKg: null,
    fittedEndKg: null,
    observedBestKg: observations.reduce((m, o) => Math.max(m, o.e1rmKg), 0),
    repCapped: isRepCapped(observations)
  };
}

// More than half the observations came from sets at or above the Epley cap, so
// the estimate has stopped responding to added reps. A lift taken from 12 reps
// to 20 at a fixed weight reads as flat, and callers must be able to say
// "e1RM can't track this" rather than "plateaued".
function isRepCapped(observations) {
  if (!observations.length) return false;
  const capped = observations.filter((o) => o.reps >= E1RM_REP_CAP).length;
  return capped * 2 > observations.length;
}

export function classifyTrend(workouts, exerciseId, range) {
  const observations = bestSetSeries(workouts, exerciseId, range);

  if (observations.length < TREND_MIN_SESSIONS) return insufficient('too_few_sessions', observations);

  const firstDate = observations[0].date;
  const lastDate = observations[observations.length - 1].date;
  const spanDays = (lastDate - firstDate) / DAY;
  if (spanDays < TREND_MIN_SPAN_DAYS) return insufficient('span_too_short', observations);

  // Bodyweight work logs 0 kg throughout, so every estimate is 0. A flat line
  // of zeroes is not a plateau, it is an absence of load to measure.
  if (observations.every((o) => o.e1rmKg === 0)) return insufficient('no_load', observations);

  const xs = observations.map((o) => (o.date - firstDate) / DAY);
  const ys = observations.map((o) => o.e1rmKg);
  const n = ys.length;
  const meanY = ys.reduce((a, y) => a + y, 0) / n;
  const meanX = xs.reduce((a, x) => a + x, 0) / n;

  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  // Every observation identical: the line fits perfectly and explains
  // everything there is to explain. Without this the ratio is 0/0.
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const fittedStartKg = intercept;
  const fittedEndKg = intercept + slope * spanDays;
  // A percentage off a non-positive baseline means nothing, so no direction is
  // claimed from one.
  const pctChange = fittedStartKg > 0 ? ((fittedEndKg - fittedStartKg) / fittedStartKg) * 100 : null;

  const base = {
    reason: null,
    sessions: n,
    spanDays,
    firstDate,
    lastDate,
    slopeKgPerWeek: slope * 7,
    pctChange,
    r2,
    fittedStartKg,
    fittedEndKg,
    observedBestKg: Math.max(...ys),
    repCapped: isRepCapped(observations)
  };

  if (pctChange == null) return { ...base, status: 'noisy' };
  if (Math.abs(pctChange) < TREND_FLAT_PCT) return { ...base, status: 'steady' };
  if (r2 < TREND_MIN_R2) return { ...base, status: 'noisy' };
  return { ...base, status: pctChange > 0 ? 'improving' : 'declining' };
}

// WHY A TREND'S DIRECTION CANNOT BE REPORTED — or null when it can be.
//
// ONE ANSWER, because the screens disagreed. ExerciseDetail's chip checked
// `repCapped` before the direction and said "High-rep work — est. 1RM can't
// track this"; the Best-progress ranking on Progress and the Evolution
// highlights looked only at `status`, so the same lift was ranked and printed
// as "+8.2%" on one screen and declared untrackable on another. The code
// already knew the number was an artefact; only one screen acted on it.
//
// `status` stays exactly as classifyTrend sets it — the fitted line really is
// steady — because the classification is not what was wrong. What was wrong was
// three screens each deciding for themselves what a classification licensed
// them to say. They now ask this.
export function trendWithholdReason(trend) {
  // The cap first: above 12 reps the estimate stops responding, so whatever
  // direction the fit reports is an artefact of the formula, not of training.
  if (trend.repCapped) return 'rep_capped';
  if (trend.status === 'noisy') return 'noisy';
  if (trend.status === 'insufficient') return trend.reason || 'too_few_sessions';
  return null;
}

// A trend whose direction is reportable — the states a ranking can order.
export function isRankableTrend(trend) {
  return trendWithholdReason(trend) == null;
}

// ---------------------------------------------------------------------------
// CONSISTENCY
// ---------------------------------------------------------------------------

// Coefficient of variation of the gaps between sessions, banded. CV is
// unit-free, so a lift trained every 3 days and one trained every 10 are judged
// on REGULARITY rather than on frequency.
//
// The bands are set so that a day either side of a weekly cadence still reads
// regular (cv about 0.2); an alternating 3-and-14-day pattern — irregular, but
// still a recognisable pattern — reads uneven (cv about 0.65); and genuinely
// unpredictable training, say gaps of 3, 7, 45 and 5 days, reads sporadic
// (cv about 1.2).
export const CONSISTENCY_REGULAR_CV = 0.35;
export const CONSISTENCY_UNEVEN_CV = 0.75;

// Three sessions, because two gaps is the fewest from which variation can be
// measured at all.
export const CONSISTENCY_MIN_SESSIONS = 3;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function exerciseConsistency(workouts, exerciseId, { start, end, asOf = Date.now() } = {}) {
  const observations = bestSetSeries(workouts, exerciseId, { start, end });
  const sessions = observations.length;
  const lastTrainedAt = sessions ? observations[sessions - 1].date : null;

  // The span the sessions actually cover, floored at a day so a single session
  // or a same-day pair cannot divide by zero.
  const spanDays = sessions > 1 ? (lastTrainedAt - observations[0].date) / DAY : 0;
  const perMonth = spanDays > 0 ? sessions / (spanDays / 30.44) : null;

  if (sessions < CONSISTENCY_MIN_SESSIONS) {
    return {
      status: 'insufficient',
      reason: 'too_few_sessions',
      sessions,
      spanDays,
      perMonth,
      medianGapDays: null,
      regularity: null,
      cv: null,
      lastTrainedAt,
      daysSinceLast: lastTrainedAt == null ? null : Math.round((asOf - lastTrainedAt) / DAY)
    };
  }

  const gaps = [];
  for (let i = 1; i < sessions; i++) gaps.push((observations[i].date - observations[i - 1].date) / DAY);
  const meanGap = gaps.reduce((a, g) => a + g, 0) / gaps.length;
  const variance = gaps.reduce((a, g) => a + (g - meanGap) ** 2, 0) / gaps.length;
  // Every gap identical (including all-same-day, where every gap is 0): there
  // is no variation, so the cadence is perfectly regular.
  const cv = meanGap > 0 ? Math.sqrt(variance) / meanGap : 0;

  return {
    status: 'ok',
    reason: null,
    sessions,
    spanDays,
    perMonth,
    // Median, not mean: one three-month layoff should not define a cadence.
    medianGapDays: median(gaps),
    regularity: cv <= CONSISTENCY_REGULAR_CV ? 'regular' : cv <= CONSISTENCY_UNEVEN_CV ? 'uneven' : 'sporadic',
    cv,
    lastTrainedAt,
    daysSinceLast: Math.round((asOf - lastTrainedAt) / DAY)
  };
}

// ---------------------------------------------------------------------------
// RANKINGS
// ---------------------------------------------------------------------------

export const RANKING_MODES = ['frequency', 'volume', 'progression'];

// `sessions` counts DISTINCT WORKOUTS containing at least one working set of the
// exercise, which is what the dashboard's list has always meant by "sessions" —
// not the number of sets.
function tally(workouts, exMap, { start, end }) {
  const rows = new Map();
  for (const w of workouts || []) {
    if (w.date < start || w.date > end) continue;
    const seen = new Set();
    for (const s of w.sets || []) {
      if (!isWorking(s)) continue;
      let row = rows.get(s.exerciseId);
      if (!row) {
        row = { exerciseId: s.exerciseId, sessions: 0, volumeKg: 0, lastTrainedAt: w.date };
        rows.set(s.exerciseId, row);
      }
      if (!seen.has(s.exerciseId)) {
        seen.add(s.exerciseId);
        row.sessions++;
      }
      row.volumeKg += setVolume(s);
      if (w.date > row.lastTrainedAt) row.lastTrainedAt = w.date;
    }
  }
  // An exercise deleted from the library while its sets remain cannot be named
  // or opened, so it is dropped — which is what the dashboard list already did.
  return [...rows.values()]
    .map((row) => ({ ...row, exercise: exMap.get(row.exerciseId) }))
    .filter((row) => row.exercise);
}

const byName = (a, b) => (a.exercise.name || '').localeCompare(b.exercise.name || '');

// EVERY TIE-BREAK CHAIN ENDS IN THE NAME, so the order is total and the list
// does not reshuffle between renders.
const COMPARATORS = {
  frequency: (a, b) =>
    b.sessions - a.sessions || b.volumeKg - a.volumeKg || b.lastTrainedAt - a.lastTrainedAt || byName(a, b),
  volume: (a, b) =>
    b.volumeKg - a.volumeKg || b.sessions - a.sessions || b.lastTrainedAt - a.lastTrainedAt || byName(a, b),
  progression: (a, b) =>
    b.trend.pctChange - a.trend.pctChange || b.trend.r2 - a.trend.r2 || b.volumeKg - a.volumeKg || byName(a, b)
};

// { rows, withheld }.
//
// `trend` is populated only in progression mode: classifying every exercise
// costs a pass over its whole history, and frequency mode has no use for it.
//
// WITHHELD, NOT DROPPED. Exercises whose trend cannot be called — too few
// sessions, too short a span, no recorded load, too variable — are returned
// separately with their reason, so a screen can say "five lifts need more
// sessions" instead of quietly showing a shorter list.
export function rankExercises(workouts, exercises, { mode = 'frequency', start = -Infinity, end = Infinity } = {}) {
  const exMap = typeof exercises?.get === 'function' ? exercises : new Map((exercises || []).map((e) => [e.id, e]));
  const counted = tally(workouts, exMap, { start, end });

  if (mode !== 'progression') {
    return { rows: [...counted].sort(COMPARATORS[mode] || COMPARATORS.frequency), withheld: [] };
  }

  const rows = [];
  const withheld = [];
  for (const row of counted) {
    const trend = classifyTrend(workouts, row.exerciseId, { start, end });
    const reason = trendWithholdReason(trend);
    // `reason` is always set on a withheld row now, so a screen never has to
    // fall back to the status to find a grouping key.
    if (reason == null) rows.push({ ...row, trend });
    else withheld.push({ ...row, trend, status: trend.status, reason });
  }
  withheld.sort((a, b) => b.sessions - a.sessions || byName(a, b));
  return { rows: rows.sort(COMPARATORS.progression), withheld };
}

// Progression needs at least TREND_MIN_SPAN_DAYS of history to say anything, so
// on a shorter window the mode is impossible for every exercise by
// construction. Screens disable the option rather than render an empty list.
export function progressionPossible(windowDays) {
  return windowDays == null || windowDays >= TREND_MIN_SPAN_DAYS;
}

// ---------------------------------------------------------------------------
// HIGHLIGHTS — Training Intelligence v1
// ---------------------------------------------------------------------------
//
// Deterministic templates over numbers that have already been computed. No
// model, no API, no new thresholds: improving, steady, noisy and insufficient
// mean exactly what classifyTrend decided they mean, and every sentence states
// the figures it rests on so a reader can check it against the graph.
//
// "Too little data" counts ONLY status 'insufficient'. A noisy lift has plenty
// of data; its numbers just jump around. Folding the two together would tell
// somebody to train more when the actual answer is that their lifts are
// inconsistent — different problem, different advice.

export const HIGHLIGHT_LIMIT = 3;

// "3 weeks" reads better than "21 days" and the trend minimum guarantees at
// least three whole weeks, so there is no sub-week case to handle.
function weeksPhrase(spanDays) {
  const weeks = Math.max(1, Math.round(spanDays / 7));
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
}

function sessionsPhrase(n) {
  return `${n} ${n === 1 ? 'session' : 'sessions'}`;
}

function improvingSentence(name, trend) {
  const sign = trend.pctChange > 0 ? '+' : '−';
  return `${name}: ${sign}${Math.abs(trend.pctChange).toFixed(1)}% over ${weeksPhrase(trend.spanDays)}, ${sessionsPhrase(trend.sessions)}`;
}

// Names the threshold rather than restating its value, so tuning
// TREND_FLAT_PCT cannot leave this sentence lying.
function steadySentence(name, trend) {
  return `${name}: within ${TREND_FLAT_PCT}% over ${weeksPhrase(trend.spanDays)}, ${sessionsPhrase(trend.sessions)}`;
}

const REASON_PHRASE = {
  too_few_sessions: (n) => `${n} under ${TREND_MIN_SESSIONS} sessions`,
  span_too_short: (n) => `${n} trained over less than ${TREND_MIN_SPAN_DAYS} days`,
  no_load: (n) => `${n} with no load logged`,
  rep_capped: (n) => `${n} trained above ${E1RM_REP_CAP} reps, where est. 1RM stops tracking`
};

export function buildHighlights(workouts, exercises, range) {
  const { rows, withheld } = rankExercises(workouts, exercises, { ...range, mode: 'progression' });

  // rows arrive sorted by percentage gained, so the top improvers are the head
  // of the list and need no second sort.
  const improving = rows
    .filter((r) => r.trend.status === 'improving')
    .slice(0, HIGHLIGHT_LIMIT)
    .map((r) => ({ exercise: r.exercise, trend: r.trend, sentence: improvingSentence(r.exercise.name, r.trend) }));

  const steady = rows
    .filter((r) => r.trend.status === 'steady')
    .slice(0, HIGHLIGHT_LIMIT)
    .map((r) => ({ exercise: r.exercise, trend: r.trend, sentence: steadySentence(r.exercise.name, r.trend) }));

  // Grouped by the withhold REASON, not by the status — a rep-capped lift has a
  // perfectly ordinary status and still cannot be reported on, so it belongs
  // with the lifts that need more data rather than silently vanishing.
  const noisy = withheld.filter((r) => r.reason === 'noisy');
  const insufficient = withheld.filter((r) => r.reason !== 'noisy');

  const byReason = {};
  for (const row of insufficient) byReason[row.reason] = (byReason[row.reason] || 0) + 1;

  const reasonParts = Object.entries(byReason)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => (REASON_PHRASE[reason] ? REASON_PHRASE[reason](n) : `${n} for another reason`));

  return {
    improving,
    steady,
    steadyTotal: rows.filter((r) => r.trend.status === 'steady').length,
    tooVariable: { count: noisy.length, names: noisy.map((r) => r.exercise.name) },
    needMoreData: { count: insufficient.length, byReason },
    sentences: {
      needMoreData: insufficient.length
        ? `${insufficient.length} ${insufficient.length === 1 ? 'lift needs' : 'lifts need'} more data: ${reasonParts.join(', ')}`
        : null,
      tooVariable: noisy.length
        ? `${noisy.length} ${noisy.length === 1 ? 'lift is' : 'lifts are'} too variable to call: ${noisy.map((r) => r.exercise.name).join(', ')}`
        : null
    }
  };
}
