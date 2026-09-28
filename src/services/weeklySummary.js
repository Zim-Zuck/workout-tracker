// Derives the per-week summaries published to the cloud for the friend recap.
//
// Sibling of socialSummary.js, and subject to the same rule: this is a
// local → cloud boundary, so what leaves the device must be readable off one
// screen. Everything here is a count or a total for a whole week.
//
// What is published:  weekly counts/totals, and per-exercise weekly totals for
//                     BUILT-IN exercises only.
// What never is:      individual sets, reps per set, RPE, notes, timestamps,
//                     session-by-session breakdowns, custom exercises.
//
// Every number is derived from calculations.js. There is no second definition
// of volume or of a PR anywhere in this file.
import { isWorking, setVolume, estimate1RM, detectPRs } from './calculations.js';
import { isShareableExercise } from './socialSummary.js';
import { startOfWeek, startOfDay, ymd } from '../utils/date.js';

export const WEEK_MS = 7 * 86400000;

// How many weeks back a publish rewrites. Two, not one: a workout finished at
// 23:50 on Sunday, or a history edit made on Monday morning, has to be able to
// correct the week it actually belongs to.
export const PUBLISH_WEEKS = 2;

// Weeks of history the "is this week unusual for them" baseline averages over.
const BASELINE_WEEKS = 4;

// Mirrors the CHECK constraints in migration 006, so an implausible local value
// is dropped here with a reason rather than bouncing off Postgres as an opaque
// constraint violation the user can do nothing about.
const LIMITS = {
  workouts: 100, sets: 2000, reps: 40000, volume: 10000000,
  prs: 500, durationMin: 10080, weightKg: 500, repsPerSet: 100, e1rmKg: 600
};

function clamp(n, max) {
  return Math.max(0, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// A session longer than this was almost certainly left running — the phone was
// pocketed and the workout finished the next morning. Counting it would make
// "most time training" a prize for forgetting to press stop.
const MAX_PLAUSIBLE_SESSION_MIN = 300;

function sessionMinutes(w) {
  if (!w.startTime || !w.endTime) return null;
  const min = Math.round((w.endTime - w.startTime) / 60000);
  if (min <= 0 || min > MAX_PLAUSIBLE_SESSION_MIN) return null;
  return min;
}

// Walks the whole history once, in order, counting how many PRs each workout
// set. Uses detectPRs() — the app's single definition of a PR — and grows the
// "everything before this" set list incrementally, so this stays linear in the
// number of sets rather than quadratic in the number of workouts.
//
// Returns Map<workoutId, prCount>.
function prCountsByWorkout(sortedWorkouts) {
  const priorByExercise = new Map(); // exerciseId -> sets from earlier workouts
  const out = new Map();

  for (const w of sortedWorkouts) {
    const current = new Map(); // exerciseId -> working sets in this workout
    for (const s of w.sets || []) {
      if (!isWorking(s)) continue;
      if (!current.has(s.exerciseId)) current.set(s.exerciseId, []);
      current.get(s.exerciseId).push(s);
    }

    let count = 0;
    for (const [exId, sets] of current) {
      const prior = priorByExercise.get(exId) || [];
      const pr = detectPRs(prior, sets);
      // One PR per exercise per session. A lift that is simultaneously a new
      // top weight and a new estimated max is one achievement, not two, and
      // counting it twice would quietly inflate whoever trains most exercises.
      if (pr.weight || pr.reps || pr.e1rm) count++;
    }
    out.set(w.id, count);

    // Only now do this workout's sets become "prior" for the next one.
    for (const [exId, sets] of current) {
      if (!priorByExercise.has(exId)) priorByExercise.set(exId, []);
      priorByExercise.get(exId).push(...sets);
    }
  }

  return out;
}

// Volume per week key, for the baseline. Includes every finished workout, not
// just the published weeks.
function volumeByWeek(sortedWorkouts) {
  const out = new Map(); // weekStart ms -> volume
  for (const w of sortedWorkouts) {
    const k = startOfWeek(w.date);
    out.set(k, (out.get(k) || 0) + workoutVolume(w));
  }
  return out;
}

function workoutVolume(w) {
  let v = 0;
  for (const s of w.sets || []) if (isWorking(s)) v += setVolume(s);
  return v;
}

// Mean weekly volume over the four weeks before `weekStart`, counting weeks
// with no training as zero.
//
// Counting the zeros is the honest choice: if someone trained once in four
// weeks, their baseline should be low, and a normal week really is a big jump
// for them. Averaging only the weeks they showed up would hide exactly the
// comebacks the recap exists to celebrate. Weeks before their first ever
// workout are excluded, so a new account is not handed a baseline of zero
// spread over a month they were not here for.
function baselineFor(volPerWeek, weekStart, firstWorkoutAt) {
  if (firstWorkoutAt == null) return 0;
  const firstWeek = startOfWeek(firstWorkoutAt);
  let total = 0;
  let counted = 0;
  for (let i = 1; i <= BASELINE_WEEKS; i++) {
    const k = weekStart - i * WEEK_MS;
    if (k < firstWeek) continue;
    total += volPerWeek.get(k) || 0;
    counted++;
  }
  return counted ? round1(total / counted) : 0;
}

// The full publishable payload for the most recent `weeks` weeks.
//
// Returns { weeks: [...], exercises: [...] } shaped exactly as the two tables
// in migration 006 expect, minus user_id (the outbox stamps that).
export function buildWeeklySummaries(workouts, { weeks = PUBLISH_WEEKS, asOf = Date.now() } = {}) {
  const finished = (workouts || [])
    .filter((w) => !w.isActive)
    .sort((a, b) => a.date - b.date);

  const targets = [];
  for (let i = 0; i < weeks; i++) targets.push(startOfWeek(asOf) - i * WEEK_MS);

  // Empty history still returns rows — zeroed ones. That matters: a user who
  // deleted every workout this week must overwrite last publish's numbers, not
  // leave them standing in the cloud.
  if (!finished.length) {
    return {
      weeks: targets.map((t) => emptyWeek(t)),
      exercises: []
    };
  }

  const prs = prCountsByWorkout(finished);
  const volPerWeek = volumeByWeek(finished);
  const firstWorkoutAt = finished[0].date;

  const weekRows = [];
  const exerciseRows = [];

  for (const weekStart of targets) {
    const weekEnd = weekStart + WEEK_MS;
    const inWeek = finished.filter((w) => w.date >= weekStart && w.date < weekEnd);

    const row = emptyWeek(weekStart);
    row.baseline_volume_kg = baselineFor(volPerWeek, weekStart, firstWorkoutAt);

    // The gap is measured from the last session BEFORE this week to the first
    // one inside it — "how long were they gone", not "how long since now".
    const lastBefore = lastWorkoutBefore(finished, weekStart);
    if (inWeek.length && lastBefore != null) {
      row.days_since_prev_workout = clamp(
        Math.round((startOfDay(inWeek[0].date) - startOfDay(lastBefore)) / 86400000),
        3650
      );
    }

    if (!inWeek.length) {
      weekRows.push(row);
      continue;
    }

    const days = new Set();
    let durationMin = 0;
    let durationKnown = 0;
    let maxSession = 0;
    const perExercise = new Map(); // exerciseId -> accumulator

    for (const w of inWeek) {
      const vol = workoutVolume(w);
      row.workouts++;
      row.volume_kg += vol;
      row.prs += prs.get(w.id) || 0;
      days.add(ymd(w.date));
      if (vol > maxSession) maxSession = vol;

      const min = sessionMinutes(w);
      if (min != null) { durationMin += min; durationKnown++; }

      for (const s of w.sets || []) {
        if (!isWorking(s)) continue;
        row.sets++;
        row.reps += s.reps || 0;

        // Custom exercises counted toward the totals above but stop here: their
        // ids are device-random and would never match a friend's.
        if (!isShareableExercise(s.exerciseId)) continue;
        // A set outside the database's plausibility bounds is dropped from the
        // per-exercise rows rather than clamped — a silently corrected 900 kg
        // bench is worse than an absent one.
        if ((s.weightKg || 0) < 0 || (s.weightKg || 0) > LIMITS.weightKg) continue;
        if (!s.reps || s.reps < 1 || s.reps > LIMITS.repsPerSet) continue;

        const acc = perExercise.get(s.exerciseId) || {
          exercise_id: s.exerciseId, sets: 0, reps: 0, volume_kg: 0,
          top_weight_kg: 0, top_weight_reps: 0, best_e1rm_kg: 0
        };
        acc.sets++;
        acc.reps += s.reps;
        acc.volume_kg += setVolume(s);

        // Same "best" rule as buildLiftsSummary(): heavier bar wins outright,
        // equal bar with more reps wins. Keeps the weekly headline consistent
        // with the all-time one on a profile.
        if (
          s.weightKg > acc.top_weight_kg ||
          (s.weightKg === acc.top_weight_kg && s.reps > acc.top_weight_reps)
        ) {
          acc.top_weight_kg = s.weightKg;
          acc.top_weight_reps = s.reps;
        }
        acc.best_e1rm_kg = Math.max(acc.best_e1rm_kg, estimate1RM(s.weightKg, s.reps));
        perExercise.set(s.exerciseId, acc);
      }
    }

    row.active_days = days.size;
    row.max_session_volume_kg = round1(clamp(maxSession, LIMITS.volume));
    row.volume_kg = round1(clamp(row.volume_kg, LIMITS.volume));
    row.workouts = clamp(row.workouts, LIMITS.workouts);
    row.sets = clamp(row.sets, LIMITS.sets);
    row.reps = clamp(row.reps, LIMITS.reps);
    row.prs = clamp(row.prs, LIMITS.prs);
    // Published only when EVERY session in the week was measurable. A partial
    // total would quietly rank someone last for having imported history.
    row.duration_min = durationKnown === inWeek.length ? clamp(durationMin, LIMITS.durationMin) : null;

    weekRows.push(row);

    for (const acc of perExercise.values()) {
      if (acc.best_e1rm_kg > LIMITS.e1rmKg) continue;
      exerciseRows.push({
        week_start: row.week_start,
        exercise_id: acc.exercise_id,
        sets: acc.sets,
        reps: acc.reps,
        volume_kg: round1(acc.volume_kg),
        top_weight_kg: Math.round(acc.top_weight_kg * 100) / 100,
        top_weight_reps: acc.top_weight_reps,
        best_e1rm_kg: Math.round(acc.best_e1rm_kg * 100) / 100
      });
    }
  }

  return { weeks: weekRows, exercises: exerciseRows };
}

function emptyWeek(weekStartMs) {
  return {
    week_start: ymd(weekStartMs),
    workouts: 0,
    sets: 0,
    reps: 0,
    volume_kg: 0,
    prs: 0,
    active_days: 0,
    max_session_volume_kg: 0,
    duration_min: null,
    baseline_volume_kg: 0,
    days_since_prev_workout: null
  };
}

function lastWorkoutBefore(sortedWorkouts, ts) {
  let last = null;
  for (const w of sortedWorkouts) {
    if (w.date >= ts) break;
    last = w.date;
  }
  return last;
}

// The week the app currently considers "this week", as a YYYY-MM-DD Monday.
export function currentWeekKey(asOf = Date.now()) {
  return ymd(startOfWeek(asOf));
}

// Parses a YYYY-MM-DD week key back to local midnight. Deliberately not
// new Date(key), which parses a bare date string as UTC and can land on the
// previous day for anyone west of Greenwich.
export function weekKeyToMs(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
