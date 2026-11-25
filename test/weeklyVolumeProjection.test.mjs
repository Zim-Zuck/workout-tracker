// PROJECTED WEEKLY VOLUME.
//
// projectWeeklyVolume predicts where the current, still-running week will
// land, from the user's own recent rhythm. Every number it returns is
// exercised here directly — no DOM, no React.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectWeeklyVolume, weeklyPaceState, PACE_TOLERANCE_PCT } from '../src/services/weeklyVolumeProjection.js';
import { startOfWeek } from '../src/utils/date.js';

const DAY = 86400000;

// A Wednesday at noon — dow 2 (Monday = 0), matching the rest of the suite's
// fixed "now" convention so this file does not pass or fail by the calendar.
const NOW = new Date(2025, 5, 11, 12, 0).getTime();
const WEEK_START = startOfWeek(NOW);

let n = 0;
const set = (weightKg, extra = {}) => ({
  id: `s${n++}`, exerciseId: 'ex', type: 'working', weightKg, reps: 1,
  completed: true, timestamp: 0, ...extra
});
// One working set of exactly `volumeKg` (weight 1 x reps volumeKg would also
// work; weight=volumeKg, reps=1 keeps the numbers readable).
const workout = (date, volumeKg, extraSets = []) => ({
  id: `w${n++}`, date, sets: [set(volumeKg), ...extraSets]
});

// `weeksBack` weeks of `sessionsPerWeek` sessions at `volumePerSession` each,
// landing on Monday + 1 day of each of those completed weeks, oldest first.
function baselineWeeks(count, sessionsPerWeek, volumePerSession, { skip = [] } = {}) {
  const out = [];
  for (let back = 1; back <= count; back++) {
    if (skip.includes(back)) continue;
    const weekStart = WEEK_START - back * 7 * DAY;
    for (let s = 0; s < sessionsPerWeek; s++) {
      out.push(workout(weekStart + s * DAY, volumePerSession));
    }
  }
  return out;
}

test('normal case: projects the rest of the week from recent rhythm', () => {
  // Six completed weeks of 3 sessions x 1000 kg. Today (Wednesday) already
  // has one session logged.
  const history = [
    ...baselineWeeks(6, 3, 1000),
    workout(NOW, 1000)
  ];
  const p = projectWeeklyVolume(history, NOW);
  assert.ok(p, 'expected a projection');
  assert.equal(p.expectedSessions, 3);
  assert.equal(p.averageWeeklyVolume, 3000);
  assert.equal(p.typicalSessionVolume, 1000);
  assert.equal(p.sessionsDone, 1);
  assert.equal(p.volumeDone, 1000);
  // Wednesday, today already logged: 7 - 2 - 1 = 4 days left.
  assert.equal(p.remainingSessions, 2); // clamp(3 - 1, 0, 4)
  assert.equal(p.projected, 3000); // 1000 + 2 * 1000
  assert.equal(p.isFinal, false);
});

test('a gap week is excluded, not counted as a zero', () => {
  // Weeks 1,2,4,5,6 back have 1000 kg each; week 3 back is a total break
  // (nothing logged). Week 7 back is reachable and distinct (9000 kg) so the
  // baseline must extend out to it rather than quietly running with 5 weeks,
  // or treating the break as a zero-volume week that drags the average down.
  const history = baselineWeeks(7, 1, 1000, { skip: [3] })
    .map((w) => (startOfWeek(w.date) === WEEK_START - 7 * 7 * DAY ? { ...w, sets: [{ ...w.sets[0], weightKg: 9000 }] } : w));
  const p = projectWeeklyVolume(history, NOW);
  assert.ok(p);
  // 1000, 1000, 1000, 1000, 1000, 9000 over the 6 weeks the baseline actually
  // used (back 1,2,4,5,6,7) — week 3's absence changed nothing but which
  // weeks were read.
  assert.equal(p.averageWeeklyVolume, (1000 * 5 + 9000) / 6);
  assert.equal(p.expectedSessions, 1);
});

test('a brand-new user has nothing to project from', () => {
  assert.equal(projectWeeklyVolume([], NOW), null);
});

test('fewer than 2 non-empty completed weeks in the baseline returns null', () => {
  const history = [...baselineWeeks(1, 2, 1000), workout(NOW, 500), workout(NOW - DAY, 500)];
  assert.equal(projectWeeklyVolume(history, NOW), null);
});

test('fewer than 4 sessions total returns null even with 2 baseline weeks', () => {
  const history = [
    workout(WEEK_START - 7 * DAY, 1000),
    workout(WEEK_START - 14 * DAY, 1000),
    workout(NOW, 500)
  ];
  assert.equal(history.length, 3);
  assert.equal(projectWeeklyVolume(history, NOW), null);
});

test('already hit the expected session count: projected equals actual', () => {
  const history = [
    ...baselineWeeks(6, 3, 1000),
    workout(WEEK_START, 900),
    workout(WEEK_START + DAY, 900),
    workout(NOW, 900)
  ];
  const p = projectWeeklyVolume(history, NOW);
  assert.ok(p);
  assert.equal(p.expectedSessions, 3);
  assert.equal(p.sessionsDone, 3);
  assert.equal(p.remainingSessions, 0);
  assert.equal(p.projected, p.volumeDone);
  assert.equal(p.isFinal, true);
});

test('Sunday with today already logged: no days left, week is final', () => {
  const sunday = WEEK_START + 6 * DAY + 15 * 3600 * 1000;
  const history = [...baselineWeeks(6, 5, 1000), workout(sunday, 700)];
  const p = projectWeeklyVolume(history, sunday);
  assert.ok(p);
  assert.equal(p.remainingSessions, 0);
  assert.equal(p.projected, p.volumeDone);
  assert.equal(p.isFinal, true);
});

test('Monday with zero sessions done projects the full expected week', () => {
  const monday = WEEK_START + 9 * 3600 * 1000;
  const history = baselineWeeks(6, 4, 800);
  const p = projectWeeklyVolume(history, monday);
  assert.ok(p);
  assert.equal(p.sessionsDone, 0);
  assert.equal(p.volumeDone, 0);
  assert.equal(p.remainingSessions, p.expectedSessions); // 4, well within 7 days left
  assert.equal(p.projected, p.expectedSessions * p.typicalSessionVolume);
});

test('week-start boundary: exactly at the boundary is this week, one ms earlier is last week', () => {
  const history = [
    ...baselineWeeks(6, 3, 1000),
    workout(WEEK_START - 1, 5000),  // 1ms before the boundary: last (completed) week
    workout(WEEK_START, 1234)       // exactly on the boundary: this week
  ];
  const p = projectWeeklyVolume(history, NOW);
  assert.ok(p);
  assert.equal(p.sessionsDone, 1);
  assert.equal(p.volumeDone, 1234);
});

test('warm-ups are excluded from every number this returns', () => {
  const warmup = set(50000, { type: 'warmup' });
  const history = [
    ...baselineWeeks(6, 3, 1000),
    { id: 'wnow', date: NOW, sets: [set(1000), warmup] }
  ];
  const p = projectWeeklyVolume(history, NOW);
  assert.ok(p);
  assert.equal(p.volumeDone, 1000);
  assert.equal(p.typicalSessionVolume, 1000);
  assert.equal(p.averageWeeklyVolume, 3000);
});

// --------------------------------------------------------------- pace ----
//
// weeklyPaceState() is a pure derivation off a projectWeeklyVolume() result —
// these tests build real projections rather than hand-rolled fixtures, so a
// change to the projection's own fields is felt here too.

test('weeklyPaceState: no projection, no verdict', () => {
  assert.equal(weeklyPaceState(null), null);
});

test('weeklyPaceState: not_started overrides everything else when nothing is logged yet', () => {
  const p = projectWeeklyVolume(baselineWeeks(6, 3, 1000), NOW);
  assert.ok(p);
  assert.equal(p.sessionsDone, 0);
  assert.equal(weeklyPaceState(p), 'not_started');
});

test('weeklyPaceState: on_pace when the projection lands within tolerance of average', () => {
  // The normal-case fixture above projects to exactly the average (pct 0).
  const history = [...baselineWeeks(6, 3, 1000), workout(NOW, 1000)];
  const p = projectWeeklyVolume(history, NOW);
  assert.ok(p);
  assert.equal(p.isFinal, false);
  assert.equal(weeklyPaceState(p), 'on_pace');
});

test('weeklyPaceState: behind when a weak session so far drags the projection down', () => {
  const saturday = WEEK_START + 5 * DAY + 10 * 3600 * 1000;
  // One very light session on Monday this week; two sessions/week baseline.
  const history = [...baselineWeeks(6, 2, 1000), workout(WEEK_START, 100)];
  const p = projectWeeklyVolume(history, saturday);
  assert.ok(p);
  assert.equal(p.isFinal, false);
  const pct = ((p.projected - p.averageWeeklyVolume) / p.averageWeeklyVolume) * 100;
  assert.ok(pct < -PACE_TOLERANCE_PCT, `expected clearly behind, got ${pct.toFixed(1)}%`);
  assert.equal(weeklyPaceState(p), 'behind');
});

test('weeklyPaceState: ahead when a strong session so far pushes the projection up', () => {
  const saturday = WEEK_START + 5 * DAY + 10 * 3600 * 1000;
  const history = [...baselineWeeks(6, 2, 1000), workout(WEEK_START, 5000)];
  const p = projectWeeklyVolume(history, saturday);
  assert.ok(p);
  assert.equal(p.isFinal, false);
  const pct = ((p.projected - p.averageWeeklyVolume) / p.averageWeeklyVolume) * 100;
  assert.ok(pct > PACE_TOLERANCE_PCT, `expected clearly ahead, got ${pct.toFixed(1)}%`);
  assert.equal(weeklyPaceState(p), 'ahead');
});

test('weeklyPaceState: done_above once the week is final at or above average', () => {
  // Expected sessions is 2; hitting 2 strong sessions ends the week early
  // regardless of which day it happens to be.
  const history = [
    ...baselineWeeks(6, 2, 1000),
    workout(WEEK_START, 1200),
    workout(WEEK_START + 2 * DAY, 1200)
  ];
  const p = projectWeeklyVolume(history, WEEK_START + 3 * DAY);
  assert.ok(p);
  assert.equal(p.isFinal, true);
  assert.ok(p.projected >= p.averageWeeklyVolume);
  assert.equal(weeklyPaceState(p), 'done_above');
});

test('weeklyPaceState: done_below once the week is final below average', () => {
  const history = [
    ...baselineWeeks(6, 2, 1000),
    workout(WEEK_START, 400),
    workout(WEEK_START + 2 * DAY, 400)
  ];
  const p = projectWeeklyVolume(history, WEEK_START + 3 * DAY);
  assert.ok(p);
  assert.equal(p.isFinal, true);
  assert.ok(p.projected < p.averageWeeklyVolume);
  assert.equal(weeklyPaceState(p), 'done_below');
});
