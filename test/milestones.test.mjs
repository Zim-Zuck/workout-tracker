// MILESTONES.
//
// The two things that matter most here are that a milestone is dated by the
// WORKOUT THAT CROSSED IT (not by when the function ran), and that a lapsed
// streak is measured against the current streak rather than the best ever. Most
// of this file is those two plus the arithmetic edges that could emit NaN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  milestonesFor, WORKOUT_MILESTONES, STREAK_MILESTONES,
  VOLUME_MILESTONES_KG, PR_MILESTONES, MILESTONE_CATEGORIES
} from '../src/services/milestones.js';
import { startOfWeek } from '../src/utils/date.js';

const DAY = 86400000;
const WEEK = 7 * DAY;
// A fixed Wednesday, so a week boundary never lands inside a test by accident.
const NOW = new Date(2026, 4, 13, 12, 0, 0).getTime();

function set(exerciseId, weightKg, reps, i = 0) {
  return {
    id: `s${i}`, exerciseId, type: 'working', weightKg, reps, timestamp: 0, completed: true
  };
}

// n workouts, one every `everyDays` days ending at `endAt`, each moving a fixed
// volume with no progression — so volume and count milestones fire but PR ones
// (beyond the first session) do not.
function history(n, { endAt = NOW, everyDays = 3, weightKg = 100, reps = 10 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const date = endAt - (n - 1 - i) * everyDays * DAY;
    return {
      id: `wo_${String(i).padStart(3, '0')}`,
      date,
      isActive: 0,
      sets: [set('ex_bench_press', weightKg, reps, i)]
    };
  });
}

const achievedOf = (r, category) => r.achieved.filter((m) => m.category === category);
const nextOf = (r, category) => r.next.find((n) => n.category === category) || null;

// ---- the ladders themselves ----

test('the thresholds are the documented ones, ascending, and each has a category', () => {
  assert.deepEqual(WORKOUT_MILESTONES, [10, 25, 50, 100, 250, 500]);
  assert.deepEqual(STREAK_MILESTONES, [4, 8, 12, 26, 52]);
  assert.deepEqual(VOLUME_MILESTONES_KG, [10000, 50000, 100000, 250000, 500000, 1000000]);
  assert.deepEqual(PR_MILESTONES, [1, 10, 25, 50, 100]);
  assert.deepEqual(MILESTONE_CATEGORIES, ['workouts', 'streak', 'volume', 'prs']);
  for (const ladder of [WORKOUT_MILESTONES, STREAK_MILESTONES, VOLUME_MILESTONES_KG, PR_MILESTONES]) {
    for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i] > ladder[i - 1]);
  }
});

// ---- the date comes from the workout, not from the clock ----

test('a workout-count milestone is dated by the workout that crossed it', () => {
  // 12 workouts three days apart: the 10th is the one that crossed 10.
  const h = history(12);
  const r = milestonesFor(h, { asOf: NOW });
  const ten = achievedOf(r, 'workouts').find((m) => m.threshold === 10);
  assert.ok(ten);
  assert.equal(ten.date, h[9].date);
  assert.equal(ten.workoutId, h[9].id);
  assert.equal(ten.label, '10 workouts');
  // And it does not move when the function runs a year later.
  const later = milestonesFor(h, { asOf: NOW + 365 * DAY });
  assert.equal(achievedOf(later, 'workouts').find((m) => m.threshold === 10).date, h[9].date);
});

test('a volume milestone is dated by the session the running total crossed on', () => {
  // 1000 kg a session: the 10th session takes the lifetime total to 10,000.
  const h = history(12, { weightKg: 100, reps: 10 });
  const r = milestonesFor(h, { asOf: NOW });
  const ten = achievedOf(r, 'volume').find((m) => m.threshold === 10000);
  assert.ok(ten);
  assert.equal(ten.date, h[9].date);
  assert.equal(r.totals.volumeKg, 12000);
  assert.equal(ten.label, '10 t lifted');
});

test('achieved is newest first', () => {
  const r = milestonesFor(history(60), { asOf: NOW });
  for (let i = 1; i < r.achieved.length; i++) {
    assert.ok(r.achieved[i - 1].date >= r.achieved[i].date);
  }
  assert.ok(r.achieved.length > 1);
});

// ---- PRs come from prs.js and nowhere else ----

test('PR milestones count what prTimeline counts', () => {
  // Rising weight every session, so every session after the first is a PR.
  const h = history(12).map((w, i) => ({
    ...w, sets: [set('ex_bench_press', 60 + i * 2.5, 8, i)]
  }));
  const r = milestonesFor(h, { asOf: NOW });
  const first = achievedOf(r, 'prs').find((m) => m.threshold === 1);
  assert.ok(first);
  assert.equal(first.label, 'First personal record');
  // The first session has nothing to beat, so the first PR is the second.
  assert.equal(first.date, h[1].date);
  assert.equal(r.totals.prs, 11);
  const ten = achievedOf(r, 'prs').find((m) => m.threshold === 10);
  assert.equal(ten.date, h[10].date);
  assert.equal(ten.label, '10 personal records');
});

test('a history with no improvement earns no PR milestone past the first session', () => {
  const r = milestonesFor(history(20), { asOf: NOW });
  assert.equal(r.totals.prs, 0);
  assert.equal(achievedOf(r, 'prs').length, 0);
  assert.equal(nextOf(r, 'prs').threshold, 1);
});

// ---- streaks ----

test('a streak milestone is dated by the first session of the week that completed it', () => {
  // One session a week for six straight weeks, ending this week.
  const h = Array.from({ length: 6 }, (_, i) => ({
    id: `wo_${i}`, date: NOW - (5 - i) * WEEK, isActive: 0,
    sets: [set('ex_bench_press', 100, 10, i)]
  }));
  const r = milestonesFor(h, { asOf: NOW });
  const four = achievedOf(r, 'streak').find((m) => m.threshold === 4);
  assert.ok(four);
  // The 4th consecutive week is index 3.
  assert.equal(four.date, h[3].date);
  assert.equal(four.label, '4-week streak');
  assert.equal(r.currentStreak, 6);
  assert.equal(r.bestStreak, 6);
  assert.equal(nextOf(r, 'streak').threshold, 8);
  assert.equal(nextOf(r, 'streak').lapsed, false);
});

test('a lapsed streak keeps the milestone it earned and aims at the next one above TODAY', () => {
  // Nine straight weeks, then a three-month gap, then two recent weeks.
  const old = Array.from({ length: 9 }, (_, i) => ({
    id: `old_${i}`, date: NOW - (24 - i) * WEEK, isActive: 0,
    sets: [set('ex_bench_press', 100, 10, i)]
  }));
  const recent = Array.from({ length: 2 }, (_, i) => ({
    id: `new_${i}`, date: NOW - (1 - i) * WEEK, isActive: 0,
    sets: [set('ex_bench_press', 100, 10, i)]
  }));
  const r = milestonesFor([...old, ...recent], { asOf: NOW });
  assert.equal(r.bestStreak, 9);
  assert.equal(r.currentStreak, 2);
  // 4 and 8 were really reached and stay reached, dated back in the old block.
  assert.deepEqual(achievedOf(r, 'streak').map((m) => m.threshold).sort((a, b) => a - b), [4, 8]);
  const next = nextOf(r, 'streak');
  // Measured against the CURRENT streak of 2, so 4 — not 12, which is what
  // measuring against the best ever would have given.
  assert.equal(next.threshold, 4);
  assert.equal(next.current, 2);
  assert.equal(next.progressLabel, '2 more weeks');
  assert.equal(next.lapsed, true, 'the UI needs to know the best was higher');
});

test('a broken week resets the run, so two short blocks are not one long streak', () => {
  // Three weeks, skip one, three weeks. Never a streak of 4.
  const dates = [0, 1, 2, 4, 5, 6].map((i) => NOW - (6 - i) * WEEK);
  const h = dates.map((date, i) => ({
    id: `wo_${i}`, date, isActive: 0, sets: [set('ex_bench_press', 100, 10, i)]
  }));
  const r = milestonesFor(h, { asOf: NOW });
  assert.equal(r.bestStreak, 3);
  assert.equal(achievedOf(r, 'streak').length, 0);
});

test('several sessions in one week count as one week of streak', () => {
  const weekStart = startOfWeek(NOW);
  const h = [0, 1, 2, 3].map((d) => ({
    id: `wo_${d}`, date: weekStart + d * DAY + 6 * 3600000, isActive: 0,
    sets: [set('ex_bench_press', 100, 10, d)]
  }));
  const r = milestonesFor(h, { asOf: NOW });
  assert.equal(r.currentStreak, 1);
  assert.equal(r.bestStreak, 1);
});

// ---- next up ----

test('next holds one entry per category, sorted by progress, with the closest first', () => {
  const r = milestonesFor(history(12), { asOf: NOW });
  const categories = r.next.map((n) => n.category);
  assert.equal(new Set(categories).size, categories.length, 'one entry per category');
  for (let i = 1; i < r.next.length; i++) assert.ok(r.next[i - 1].pct >= r.next[i].pct);
  for (const n of r.next) {
    assert.ok(n.pct >= 0 && n.pct <= 100);
    assert.ok(Number.isFinite(n.pct));
    assert.equal(n.remaining, n.threshold - n.current);
  }
});

test('a finished ladder contributes no next entry', () => {
  // 500+ workouts tops out the workout ladder.
  const r = milestonesFor(history(520, { everyDays: 1 }), { asOf: NOW });
  assert.equal(nextOf(r, 'workouts'), null);
  assert.equal(achievedOf(r, 'workouts').length, WORKOUT_MILESTONES.length);
});

// ---- edge cases ----

test('no history at all: nothing achieved, the first rung of every ladder ahead', () => {
  for (const input of [[], null, undefined]) {
    const r = milestonesFor(input, { asOf: NOW });
    assert.deepEqual(r.achieved, []);
    assert.equal(r.next.length, MILESTONE_CATEGORIES.length);
    assert.deepEqual(r.totals, { workouts: 0, volumeKg: 0, prs: 0 });
    assert.equal(r.currentStreak, 0);
    assert.equal(r.bestStreak, 0);
    for (const n of r.next) {
      assert.equal(n.current, 0);
      assert.equal(n.pct, 0);
      assert.equal(n.threshold, THRESH[n.category][0]);
    }
  }
});

const THRESH = {
  workouts: WORKOUT_MILESTONES,
  streak: STREAK_MILESTONES,
  volume: VOLUME_MILESTONES_KG,
  prs: PR_MILESTONES
};

test('one workout: nothing crossed, and a one-week streak already counts', () => {
  const r = milestonesFor(history(1), { asOf: NOW });
  assert.deepEqual(r.achieved, []);
  assert.equal(r.totals.workouts, 1);
  assert.equal(r.currentStreak, 1);
  assert.equal(nextOf(r, 'workouts').current, 1);
  assert.equal(nextOf(r, 'workouts').progressLabel, '9 to go');
});

test('an in-progress workout is not counted, so nothing is announced mid-session', () => {
  const h = history(10);
  const withActive = [...h, {
    id: 'wo_active', date: NOW, isActive: 1, sets: [set('ex_bench_press', 100, 10, 99)]
  }];
  assert.equal(milestonesFor(withActive, { asOf: NOW }).totals.workouts, 10);
  // And the 10th milestone is still dated by the 10th FINISHED workout.
  assert.equal(
    achievedOf(milestonesFor(withActive, { asOf: NOW }), 'workouts')[0].date,
    h[9].date
  );
});

test('two workouts on the same day both count, and the ordering is stable', () => {
  // Eight sessions, then two more logged on one day — so the 9th and 10th
  // workouts of all time share a date and the tiebreak has to decide.
  const day = NOW;
  const h = [
    ...history(8, { endAt: NOW - 3 * DAY }),
    { id: 'wo_zz', date: day, isActive: 0, sets: [set('ex_bench_press', 100, 10, 8)] },
    { id: 'wo_aa', date: day, isActive: 0, sets: [set('ex_bench_press', 100, 10, 9)] }
  ];
  const a = milestonesFor(h, { asOf: NOW });
  const b = milestonesFor([...h].reverse(), { asOf: NOW });
  assert.equal(a.totals.workouts, 10);
  assert.deepEqual(a.achieved, b.achieved, 'input order must not change the answer');
  // The id tiebreak decides which same-day workout is the 10th: 'wo_aa' is the
  // 9th, 'wo_zz' the 10th.
  assert.equal(achievedOf(a, 'workouts')[0].workoutId, 'wo_zz');
});

test('bodyweight work with no load counts as a workout and adds nothing to volume', () => {
  const h = history(12).map((w, i) => ({
    ...w, sets: [{ ...set('ex_pullup', 0, 10, i), weightKg: 0 }]
  }));
  const r = milestonesFor(h, { asOf: NOW });
  assert.equal(r.totals.workouts, 12);
  assert.equal(r.totals.volumeKg, 0);
  assert.ok(Number.isFinite(r.totals.volumeKg));
  assert.ok(achievedOf(r, 'workouts').some((m) => m.threshold === 10));
  assert.equal(achievedOf(r, 'volume').length, 0);
  assert.equal(nextOf(r, 'volume').pct, 0);
});

test('missing, null and malformed sets never produce NaN', () => {
  const h = [
    { id: 'a', date: NOW - 3 * DAY, isActive: 0 },
    { id: 'b', date: NOW - 2 * DAY, isActive: 0, sets: null },
    { id: 'c', date: NOW - DAY, isActive: 0, sets: [] },
    { id: 'd', date: NOW, isActive: 0, sets: [{ ...set('ex_bench_press', 100, 10, 0), weightKg: undefined }] }
  ];
  const r = milestonesFor(h, { asOf: NOW });
  assert.equal(r.totals.workouts, 4);
  assert.ok(Number.isFinite(r.totals.volumeKg));
  for (const n of r.next) assert.ok(Number.isFinite(n.pct) && Number.isFinite(n.remaining));
});

test('a negative session volume cannot un-cross a milestone', () => {
  // 10 honest sessions of 1000 kg, then one logged at a negative weight.
  const h = [
    ...history(10),
    { id: 'wo_bad', date: NOW, isActive: 0, sets: [set('ex_bench_press', -5000, 10, 98)] }
  ];
  const r = milestonesFor(h, { asOf: NOW });
  assert.equal(r.totals.volumeKg, 10000, 'the bad session contributes zero, not a subtraction');
  assert.ok(achievedOf(r, 'volume').some((m) => m.threshold === 10000));
});

test('a workout with no usable date is ignored rather than throwing', () => {
  const h = [...history(10), { id: 'wo_nodate', date: null, isActive: 0, sets: [] }];
  const r = milestonesFor(h, { asOf: NOW });
  assert.equal(r.totals.workouts, 10);
});

test('exercises that were merged away or deleted still count', () => {
  // Sets pointing at an exercise id no exercise record has. The function takes
  // no exercise list at all, so this is free — this test is here to keep it so.
  const h = history(12).map((w, i) => ({
    ...w, sets: [set('ex_deleted_7f3a', 100, 10, i)]
  }));
  const r = milestonesFor(h, { asOf: NOW });
  assert.equal(r.totals.workouts, 12);
  assert.equal(r.totals.volumeKg, 12000);
  assert.ok(achievedOf(r, 'volume').some((m) => m.threshold === 10000));
});

test('every achieved entry carries a label, a date and the workout that crossed it', () => {
  const h = history(60).map((w, i) => ({
    ...w, sets: [set('ex_bench_press', 60 + i, 8, i)]
  }));
  const ids = new Set(h.map((w) => w.id));
  const r = milestonesFor(h, { asOf: NOW });
  assert.ok(r.achieved.length >= 4);
  for (const m of r.achieved) {
    assert.ok(MILESTONE_CATEGORIES.includes(m.category));
    assert.ok(typeof m.label === 'string' && m.label.length > 0);
    assert.ok(Number.isFinite(m.date) && m.date <= NOW);
    assert.ok(ids.has(m.workoutId), `${m.label} points at a real workout`);
  }
});

// ---- the pace estimate, and the tile form ----
//
// WHAT THIS GUARDS. The estimate is an extrapolation from eight weeks, so the
// only things worth asserting are that it never emits a number that is not a
// number, never claims a date it cannot know, and goes quiet rather than
// printing "about 7 years". The arithmetic itself is one division.

test('the next milestone carries an estimate at the recent pace', () => {
  // One workout every 3 days for 87 workouts: ~2.3 a week, 13 to go.
  const r = milestonesFor(history(87), { asOf: NOW });
  const next = nextOf(r, 'workouts');
  assert.equal(next.threshold, 100);
  assert.equal(next.remaining, 13);
  assert.ok(next.etaWeeks > 0 && next.etaWeeks < 20, `got ${next.etaWeeks}`);
  assert.match(next.etaLabel, /^about /);
});

test('no recent training means no estimate rather than Infinity', () => {
  // All the training is a year old, so the eight-week pace window is empty.
  const r = milestonesFor(history(30, { endAt: NOW - 52 * WEEK }), { asOf: NOW });
  for (const n of r.next) {
    if (n.category === 'streak') continue; // a streak advances by definition
    assert.equal(n.etaWeeks, null, n.category);
    assert.equal(n.etaLabel, null, n.category);
  }
});

test('a far-off but reachable estimate is still printed, in months', () => {
  // One workout in the pace window against 9 to go: slow, but a real rate and
  // a real answer. Going quiet here would be hiding the thing it was asked.
  const r = milestonesFor(history(1), { asOf: NOW });
  const next = nextOf(r, 'workouts');
  assert.ok(next.etaWeeks > 8, `got ${next.etaWeeks}`);
  assert.match(next.etaLabel, /^about \d+ months$/);
});

test('an estimate past the cap is dropped, not printed', () => {
  // One kilogram lifted, ever, against a ten-tonne milestone. The arithmetic
  // succeeds and the answer is fifteen centuries, which is not information.
  const r = milestonesFor(history(1, { weightKg: 1, reps: 1 }), { asOf: NOW });
  const next = nextOf(r, 'volume');
  assert.equal(next.etaWeeks, null);
  assert.equal(next.etaLabel, null);
});

test('a streak estimate is the weeks remaining, exactly', () => {
  const r = milestonesFor(history(40, { everyDays: 3 }), { asOf: NOW });
  const next = nextOf(r, 'streak');
  assert.equal(next.etaWeeks, next.remaining);
});

test('no next milestone ever carries a NaN or a negative estimate', () => {
  for (const n of [0, 1, 9, 10, 87, 260]) {
    const r = milestonesFor(history(n), { asOf: NOW });
    for (const up of r.next) {
      assert.ok(Number.isFinite(up.pct) && up.pct >= 0 && up.pct <= 100, `pct ${up.pct}`);
      assert.ok(up.etaWeeks === null || (Number.isInteger(up.etaWeeks) && up.etaWeeks > 0),
        `${up.category} eta ${up.etaWeeks}`);
    }
  }
});

test('every milestone carries a short value and a subject for the shelf', () => {
  const r = milestonesFor(history(120), { asOf: NOW });
  assert.ok(r.achieved.length > 0);
  for (const m of [...r.achieved, ...r.next]) {
    assert.ok(m.shortValue && m.shortValue.length <= 6, `${m.category}: ${m.shortValue}`);
    assert.ok(m.subject && m.subject.length > 0, m.category);
  }
  // The unit rides on the value, so the subject never repeats it.
  const streak = achievedOf(r, 'streak')[0];
  assert.match(streak.shortValue, /^\d+w$/);
  assert.equal(streak.subject, 'Streak');
});
