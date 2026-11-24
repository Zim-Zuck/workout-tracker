// MILESTONES: A ROUND NUMBER YOU HAVE CROSSED, AND THE DAY YOU CROSSED IT.
//
// The date is the entire reason this file exists. The app already knows you have
// done 54 workouts, and Profile already shows a "Workhorse — 50 workouts" badge.
// Neither can say that the 50th was on 12 March.
//
// NOT AN EXTENSION OF achievements.js, which has a hard rule at the top of its
// own file: an achievement must be decidable from `stats` and `lifts` alone,
// because the same function evaluates a friend's published summary. A
// date-reached cannot come out of that summary — it needs the raw set history —
// so an achievement can never carry one. See docs/phase-3-milestones.md for the
// three subjects that deliberately overlap, and why merging them would mean
// giving up either the dates or friends' profiles.
//
// NO NEW DEFINITION OF ANYTHING. Volume is workingVolume, the streak is
// computeStreak, and a PR is whatever prs.js says it is. This module counts and
// dates; it does not decide.
//
// NO FORMATTED DATES. `date` comes back as a raw timestamp and the caller
// formats it, the same split progressSummary.js uses — a locale-dependent string
// baked into a pure function makes its tests depend on the machine they run on.
import { workingVolume, computeStreak } from './calculations.js';
import { prTimeline } from './prs.js';
import { startOfWeek } from '../utils/date.js';
import { compactVolume } from '../utils/units.js';

const WEEK = 7 * 86400000;

export const MILESTONE_CATEGORIES = ['workouts', 'streak', 'volume', 'prs'];

// Finished workouts. 10 is where logging has become a habit rather than an
// experiment; each step after it is roughly 2–2.5x the last, so a milestone
// takes months rather than weeks and never lands twice in a fortnight.
export const WORKOUT_MILESTONES = [10, 25, 50, 100, 250, 500];

// Consecutive weeks containing a session, as computeStreak defines one. 4 is a
// month, 12 a quarter, 26 half a year, 52 a year — all units a person already
// thinks in. 8 exists because 4→12 is otherwise the longest unrewarded stretch.
export const STREAK_MILESTONES = [4, 8, 12, 26, 52];

// Cumulative working volume, round in TONNES because that is the unit the app
// already switches to for lifetime totals (compactVolume). A hard session moves
// 5–10 t, so 10 t arrives in the first fortnight and 1000 t is a career number.
export const VOLUME_MILESTONES_KG = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

// Lifetime PR count, straight off prTimeline. 1 is on the ladder because a first
// PR is a real event and arrives within a session or two, which is what keeps
// the row from being empty for a new user.
export const PR_MILESTONES = [1, 10, 25, 50, 100];

const THRESHOLDS = {
  workouts: WORKOUT_MILESTONES,
  streak: STREAK_MILESTONES,
  volume: VOLUME_MILESTONES_KG,
  prs: PR_MILESTONES
};

// Ordered by (date, id). Two workouts logged on the same day both count, and the
// tiebreak on id makes "the 10th workout" the same workout on every render.
//
// Active sessions are excluded so a milestone cannot be announced mid-workout
// and then taken back. Callers above the hooks layer are already filtered; this
// is here so the function is correct on any input.
function finishedInOrder(workouts) {
  return (workouts || [])
    .filter((w) => w && !w.isActive && Number.isFinite(w.date))
    .sort((a, b) => a.date - b.date || String(a.id).localeCompare(String(b.id)));
}

function label(category, threshold) {
  switch (category) {
    case 'workouts': return `${threshold.toLocaleString()} workouts`;
    case 'streak': return `${threshold}-week streak`;
    case 'volume': {
      const { value, unit } = compactVolume(threshold);
      return `${value} ${unit} lifted`;
    }
    case 'prs': return threshold === 1 ? 'First personal record' : `${threshold} personal records`;
    default: return String(threshold);
  }
}

// THE TILE FORM: a value short enough to set at 32px, and the subject it
// counts, as two pieces rather than one sentence.
//
// `label` stays the sentence form ("100 workouts") because the Ahead list and
// the next-milestone headline both read as sentences. The shelf does not: a
// tile is a number with a word under it, and splitting "100 workouts" in the
// component would mean a regex over a string this module is free to change.
//
// The unit rides on the VALUE, not the subject — "4w", "50t" — so the subject
// line stays the same word whatever the magnitude, and a tile never prints its
// unit twice.
function shortValue(category, threshold) {
  switch (category) {
    case 'streak': return `${threshold}w`;
    case 'volume': {
      const { value, unit } = compactVolume(threshold);
      return `${value}${unit}`;
    }
    default: return threshold.toLocaleString();
  }
}

function subject(category, threshold) {
  switch (category) {
    case 'workouts': return 'Workouts';
    case 'streak': return 'Streak';
    case 'volume': return 'Volume';
    // The first PR is the tile a new user sees before any other, so it says
    // what it is rather than reading as a count of one.
    case 'prs': return threshold === 1 ? 'First PR' : 'Personal records';
    default: return '';
  }
}

function remainingLabel(category, remaining) {
  switch (category) {
    case 'streak': return `${remaining} more ${remaining === 1 ? 'week' : 'weeks'}`;
    case 'volume': {
      const { value, unit } = compactVolume(remaining);
      return `${value} ${unit} to go`;
    }
    default: return `${remaining.toLocaleString()} to go`;
  }
}

// THE RUNNING-TOTAL CROSSINGS for one category: walk events oldest-first and
// record the event that took the total past each threshold.
//
// `total` must never decrease, or a milestone could un-cross. Callers pass a
// per-event amount already floored at zero.
function crossings(category, events) {
  const thresholds = THRESHOLDS[category];
  const out = [];
  let total = 0;
  let next = 0;
  for (const e of events) {
    total += e.amount;
    while (next < thresholds.length && total >= thresholds[next]) {
      out.push({ category, threshold: thresholds[next], date: e.date, workoutId: e.workoutId });
      next++;
    }
    if (next >= thresholds.length) break;
  }
  return { achieved: out, total, nextIndex: next };
}

// STREAK HIGH-WATER MARKS.
//
// A streak is a run of consecutive weeks each containing at least one session,
// so the run length is known the moment a week gets its FIRST session — that
// workout is where the milestone was crossed, and its date is the one to show.
//
// Returns the crossings plus the longest run ever, which is what tells a lapsed
// streak apart from one that was never long.
function streakCrossings(ordered) {
  const firstWorkoutOfWeek = new Map();
  for (const w of ordered) {
    const wk = startOfWeek(w.date);
    if (!firstWorkoutOfWeek.has(wk)) firstWorkoutOfWeek.set(wk, w);
  }
  const weeks = [...firstWorkoutOfWeek.keys()].sort((a, b) => a - b);

  const achieved = [];
  let best = 0;
  let run = 0;
  let prev = null;
  let next = 0;
  for (const wk of weeks) {
    run = prev !== null && wk - prev === WEEK ? run + 1 : 1;
    prev = wk;
    best = Math.max(best, run);
    while (next < STREAK_MILESTONES.length && run >= STREAK_MILESTONES[next]) {
      const w = firstWorkoutOfWeek.get(wk);
      achieved.push({
        category: 'streak', threshold: STREAK_MILESTONES[next], date: w.date, workoutId: w.id
      });
      next++;
    }
  }
  return { achieved, best };
}

// HOW FAR AHEAD THE NEXT MILESTONE IS, at the rate of the last PACE_WEEKS.
//
// Eight weeks is long enough that one missed week does not double the estimate
// and short enough that it describes how you are training now rather than how
// you trained last winter. A longer baseline would tell a returning lifter
// their next hundred workouts are two years away because of a layoff.
//
// ALWAYS "about", and never a date. The honest precision here is low: this is
// a rate extrapolated from two months, and printing "14 March" would claim a
// certainty the arithmetic does not have.
const PACE_WEEKS = 8;

// Past this the estimate stops being information. "About 7 years" is not
// encouragement and it is not a plan; no line at all is better.
const MAX_ETA_WEEKS = 260;

const WEEKS_PER_MONTH = 52 / 12;

function etaLabel(weeks) {
  if (weeks <= 1) return 'about a week';
  if (weeks <= 8) return `about ${weeks} weeks`;
  const months = Math.round(weeks / WEEKS_PER_MONTH);
  if (months < 18) return `about ${months} months`;
  const years = Math.round(months / 12);
  return years === 1 ? 'about a year' : `about ${years} years`;
}

// Weeks until `remaining` is covered at `perWeek`, or null when there is no
// rate to extrapolate from — a user who logged nothing in the last eight weeks
// has no pace, and dividing by zero to get Infinity is not an estimate.
function etaFor(remaining, perWeek) {
  if (!Number.isFinite(perWeek) || perWeek <= 0) return null;
  const weeks = Math.ceil(remaining / perWeek);
  if (!Number.isFinite(weeks) || weeks <= 0 || weeks > MAX_ETA_WEEKS) return null;
  return { weeks, label: etaLabel(weeks) };
}

// The nearest threshold still ahead of `current`, or null when the ladder is
// finished. Deliberately measured against the CURRENT value, not the best ever:
// after a break, the next streak milestone has to be something reachable rather
// than the 52 weeks you were heading for.
function nextFor(category, current, perWeek) {
  const threshold = THRESHOLDS[category].find((t) => t > current);
  if (threshold == null) return null;
  const remaining = threshold - current;
  const pct = Math.min(100, Math.max(0, (current / threshold) * 100));
  const eta = etaFor(remaining, perWeek);
  return {
    category,
    threshold,
    current,
    remaining,
    pct: Number.isFinite(pct) ? pct : 0,
    label: label(category, threshold),
    shortValue: shortValue(category, threshold),
    subject: subject(category, threshold),
    progressLabel: remainingLabel(category, remaining),
    // null when there is no rate to go on. The caller drops the clause rather
    // than printing a hedge about not knowing.
    etaWeeks: eta ? eta.weeks : null,
    etaLabel: eta ? eta.label : null,
    lapsed: false
  };
}

// EVERY MILESTONE CROSSED, AND THE ONE NEAREST TO FALLING IN EACH CATEGORY.
//
// `achieved` is newest first, each entry dated by the workout that crossed it —
// never by `asOf`, so the 100th workout's milestone stays dated the day of the
// 100th workout however long afterwards this runs.
//
// `next` holds at most one entry per category, sorted by progress descending, so
// next[0] is the single closest one and a one-line UI can take it without
// knowing the categories. A finished ladder contributes nothing.
export function milestonesFor(workouts, { asOf = Date.now() } = {}) {
  const ordered = finishedInOrder(workouts);

  // A negative or malformed session volume contributes zero rather than eating
  // into the lifetime total. Zero-load bodyweight work contributes zero too,
  // which is correct: it was trained, it just moved no weight.
  const volumeEvents = ordered.map((w) => {
    const v = workingVolume(w.sets || []);
    return { amount: Number.isFinite(v) && v > 0 ? v : 0, date: w.date, workoutId: w.id };
  });
  const volume = crossings('volume', volumeEvents);

  const countEvents = ordered.map((w) => ({ amount: 1, date: w.date, workoutId: w.id }));
  const counts = crossings('workouts', countEvents);

  // prTimeline is the ONLY authority on what a PR is. It comes back newest
  // first; crossings walks forward, so it has to be reversed.
  const prs = prTimeline(ordered);
  const prEvents = [...prs].reverse().map((p) => ({ amount: 1, date: p.date, workoutId: p.workoutId }));
  const prCrossings = crossings('prs', prEvents);

  const streak = streakCrossings(ordered);
  const currentStreak = ordered.length ? computeStreak(ordered, asOf) : 0;

  const achieved = [
    ...counts.achieved, ...volume.achieved, ...prCrossings.achieved, ...streak.achieved
  ].sort((a, b) => b.date - a.date || b.threshold - a.threshold)
    .map((m) => ({
      ...m,
      label: label(m.category, m.threshold),
      shortValue: shortValue(m.category, m.threshold),
      subject: subject(m.category, m.threshold)
    }));

  // THE RECENT RATE, for the "about N weeks at your pace" estimate. Measured
  // off the SAME event arrays the crossings walked, so the pace cannot drift
  // from the totals it is extrapolating — a second pass over `workouts` with
  // its own filter is how those two come to disagree.
  //
  // A streak advances exactly one week per week by definition, so its rate is
  // 1 and its estimate is just the weeks remaining. That is the one category
  // here where "at your pace" is arithmetic rather than extrapolation.
  const since = asOf - PACE_WEEKS * WEEK;
  const ratePerWeek = (events) =>
    events.reduce((t, e) => t + (e.date >= since ? e.amount : 0), 0) / PACE_WEEKS;

  const next = [
    nextFor('workouts', ordered.length, ratePerWeek(countEvents)),
    nextFor('volume', volume.total, ratePerWeek(volumeEvents)),
    nextFor('prs', prs.length, ratePerWeek(prEvents)),
    nextFor('streak', currentStreak, 1)
  ].filter(Boolean).map((n) => (
    n.category === 'streak' ? { ...n, lapsed: currentStreak < streak.best } : n
  )).sort((a, b) => b.pct - a.pct);

  return {
    achieved,
    next,
    currentStreak,
    bestStreak: streak.best,
    totals: { workouts: ordered.length, volumeKg: volume.total, prs: prs.length }
  };
}
