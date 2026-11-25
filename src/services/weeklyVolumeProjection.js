// PROJECTED WEEKLY VOLUME.
//
// The Weekly Volume card used to plot the current, still-running week as if it
// were finished, so Tuesday always read as a ~50% crash. This predicts where
// the week will actually land, from the user's own recent rhythm — no planned
// routines, no per-session-type modelling, just "how often do you usually
// train, and how big is a typical session." It is an estimate and the UI
// must say so.
//
// Pure and React-free so it can be unit tested without a DOM.
import { workingVolume } from './calculations.js';
import { startOfWeek, startOfDay } from '../utils/date.js';

const DAY = 86400000;

// How many of the most recent non-empty completed weeks feed the baseline.
// Capped so a single great (or terrible) month from a year ago cannot still
// be steering this week's estimate.
const BASELINE_WEEKS = 6;

// How many of the most recent sessions define a "typical" one.
const TYPICAL_SESSION_COUNT = 8;

// Below these, there is nothing honest to project from.
const MIN_BASELINE_WEEKS = 2;
const MIN_TOTAL_SESSIONS = 4;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// workouts: [{ date, sets, isActive? }, ...]. now: a timestamp (defaults to
// Date.now(), overridable so tests are not at the mercy of the clock).
//
// Returns null when there is not enough history to project from — fewer than
// two non-empty completed weeks in the baseline window, or fewer than four
// logged sessions overall. The caller's UI must fall back to treating the
// current week as what it actually is: incomplete.
export function projectWeeklyVolume(workouts, now = Date.now()) {
  const finished = (workouts || []).filter((w) => !w.isActive && Number.isFinite(w?.date));
  const currentWeekStart = startOfWeek(now);

  const byWeek = new Map();
  for (const w of finished) {
    const wk = startOfWeek(w.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(w);
  }

  // Completed weeks, most recent first. A week with zero workouts is never a
  // key in this map, so it is already excluded here — a break in training
  // just gets stepped over rather than counted as a zero that drags the
  // average down.
  const completedWeeks = [...byWeek.keys()]
    .filter((wk) => wk < currentWeekStart)
    .sort((a, b) => b - a)
    .slice(0, BASELINE_WEEKS);

  const baseline = completedWeeks.map((wk) => {
    const ws = byWeek.get(wk);
    return { sessions: ws.length, volumeKg: ws.reduce((a, w) => a + workingVolume(w.sets || []), 0) };
  });

  if (baseline.length < MIN_BASELINE_WEEKS || finished.length < MIN_TOTAL_SESSIONS) return null;

  const expectedSessions = clamp(
    Math.round(baseline.reduce((a, b) => a + b.sessions, 0) / baseline.length),
    1, 7
  );
  const averageWeeklyVolume = baseline.reduce((a, b) => a + b.volumeKg, 0) / baseline.length;

  const recentSessions = [...finished].sort((a, b) => b.date - a.date).slice(0, TYPICAL_SESSION_COUNT);
  const typicalSessionVolume = recentSessions.length
    ? recentSessions.reduce((a, w) => a + workingVolume(w.sets || []), 0) / recentSessions.length
    : 0;

  const thisWeek = byWeek.get(currentWeekStart) || [];
  const sessionsDone = thisWeek.length;
  const volumeDone = thisWeek.reduce((a, w) => a + workingVolume(w.sets || []), 0);

  const today = startOfDay(now);
  const dow = Math.round((today - currentWeekStart) / DAY); // 0 = Monday
  const hasWorkoutToday = thisWeek.some((w) => startOfDay(w.date) === today);
  // Days left to train this week: today still counts if it has nothing logged
  // yet, and drops out once it does — that session is already in sessionsDone.
  const daysLeft = clamp(7 - dow - (hasWorkoutToday ? 1 : 0), 0, 7);

  const remainingSessions = clamp(expectedSessions - sessionsDone, 0, daysLeft);
  const projected = Math.max(volumeDone, volumeDone + remainingSessions * typicalSessionVolume);

  return {
    projected,
    volumeDone,
    sessionsDone,
    expectedSessions,
    remainingSessions,
    typicalSessionVolume,
    averageWeeklyVolume,
    isFinal: remainingSessions === 0
  };
}

// WEEKLY PACE — the one-word verdict Ronnie reacts to.
//
// Derived purely from a projectWeeklyVolume() result, so it shares its
// "not enough history" guard: no projection, no verdict. Six states, in the
// order a week actually moves through them:
//
//   not_started  nothing logged yet this week
//   behind       trending more than PACE_TOLERANCE_PCT below the average
//   on_pace      within tolerance either side of the average
//   ahead        trending more than PACE_TOLERANCE_PCT above the average
//   done_above   the week is over (or its quota is met) at or above average
//   done_below   the week is over (or its quota is met) below average
export const WEEKLY_PACE_STATES = ['not_started', 'behind', 'on_pace', 'ahead', 'done_above', 'done_below'];

// Within 5 points of the average reads as "on pace", not a verdict — a flat
// percentage badge would just trade one false alarm for another. Shared with
// the card's "vs avg" badge wording so the two never disagree about where
// "on pace" ends.
export const PACE_TOLERANCE_PCT = 5;

export function weeklyPaceState(projection) {
  if (!projection) return null;
  if (projection.sessionsDone === 0) return 'not_started';
  if (projection.isFinal) {
    return projection.projected >= projection.averageWeeklyVolume ? 'done_above' : 'done_below';
  }
  const pct = projection.averageWeeklyVolume > 0
    ? ((projection.projected - projection.averageWeeklyVolume) / projection.averageWeeklyVolume) * 100
    : 0;
  if (pct < -PACE_TOLERANCE_PCT) return 'behind';
  if (pct > PACE_TOLERANCE_PCT) return 'ahead';
  return 'on_pace';
}
