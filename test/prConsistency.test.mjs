// ONE AUTHORITY ON "IS THIS A PR?" (D2).
//
// Three places used to answer that question. prs.js said weight → reps →
// volume, at most one per exercise per session, with estimated 1RM as a
// tiebreaker and never a badge. But workoutSummary.workoutPRs and
// weeklySummary.prCountsByWorkout both called detectPRs() directly and counted
// weight, reps OR e1rm while ignoring volume — so a session could set a PR on
// the share-card image and none on the Progress page, or the reverse.
//
// These tests pin the three to each other, and pin the two specific
// disagreements that used to exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prTimeline, sessionPRs, prKindFrom, PR_PRIORITY } from '../src/services/prs.js';
import { workoutPRs } from '../src/services/workoutSummary.js';
import { buildWeeklySummaries } from '../src/services/weeklySummary.js';
import { estimate1RM } from '../src/services/calculations.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 11, 12, 0).getTime();

const set = (exerciseId, weightKg, reps, i = 0) => ({
  id: `s_${exerciseId}_${weightKg}_${reps}_${i}`,
  exerciseId, type: 'working', weightKg, reps, completed: true, timestamp: i
});

const EXERCISES = [{ id: 'ex_bench', name: 'Bench Press', muscleGroups: ['Chest'] }];
const exMap = new Map(EXERCISES.map((e) => [e.id, e]));

// Session 1 establishes a baseline; session 2 is the one under test.
const pair = (secondSets) => [
  { id: 'w1', date: NOW - 7 * DAY, sets: [set('ex_bench', 100, 5, 1), set('ex_bench', 100, 5, 2)] },
  { id: 'w2', date: NOW, sets: secondSets }
];

// Counts the PRs weeklySummary attributed to the whole history.
function weeklyPrTotal(workouts) {
  const summary = buildWeeklySummaries(workouts, { asOf: NOW, weeks: 10 });
  return summary.weeks.reduce((a, w) => a + w.prs, 0);
}

test('the PR kinds are exactly weight, reps and volume — e1rm is not one', () => {
  assert.deepEqual(PR_PRIORITY, ['weight', 'reps', 'volume']);
  assert.ok(!PR_PRIORITY.includes('e1rm'));
});

test('an e1RM-only session is not a PR anywhere', () => {
  // 95 kg x 10 estimates at 126.7 against 100 kg x 5's 116.7, so it raises the
  // estimated max — but it is not a heavier bar, not more reps at a weight
  // already owned (95 kg is new), and 950 kg is less work than the baseline
  // session's 1000. Under the old flags this counted as a PR on the share-card
  // image and in the weekly recap, and as nothing on the Progress page.
  const workouts = pair([set('ex_bench', 95, 10, 1)]);
  assert.ok(estimate1RM(95, 10) > estimate1RM(100, 5), 'the fixture must actually raise the estimate');

  assert.deepEqual(sessionPRs(workouts[1], [workouts[0]]), []);
  assert.deepEqual(workoutPRs(workouts[1], workouts, exMap), []);
  assert.equal(weeklyPrTotal(workouts), 0);
  assert.equal(prTimeline(workouts).length, 0);
});

test('a volume-only session is a PR everywhere', () => {
  // Same weight, same reps per set, one extra set: no new top weight, no new
  // reps at that weight, but the most work ever done on the lift in a session.
  const workouts = pair([set('ex_bench', 100, 5, 1), set('ex_bench', 100, 5, 2), set('ex_bench', 100, 5, 3)]);

  const authority = sessionPRs(workouts[1], [workouts[0]]);
  assert.equal(authority.length, 1);
  assert.equal(authority[0].kind, 'volume');
  assert.equal(workoutPRs(workouts[1], workouts, exMap).length, 1);
  assert.equal(workoutPRs(workouts[1], workouts, exMap)[0].kind, 'volume');
  assert.equal(weeklyPrTotal(workouts), 1);
});

test('a weight PR is reported once, not once per kind it also satisfies', () => {
  // A heavier bar for more total work is one achievement. Rule 2.
  const workouts = pair([set('ex_bench', 110, 5, 1), set('ex_bench', 110, 5, 2), set('ex_bench', 110, 5, 3)]);
  const authority = sessionPRs(workouts[1], [workouts[0]]);
  assert.equal(authority.length, 1);
  assert.equal(authority[0].kind, 'weight');
  assert.equal(workoutPRs(workouts[1], workouts, exMap).length, 1);
  assert.equal(weeklyPrTotal(workouts), 1);
});

test('the first session on a lift sets no PR, in any of the three', () => {
  const first = [{ id: 'w1', date: NOW, sets: [set('ex_bench', 200, 5, 1)] }];
  assert.deepEqual(sessionPRs(first[0], []), []);
  assert.deepEqual(workoutPRs(first[0], first, exMap), []);
  assert.equal(weeklyPrTotal(first), 0);
});

test('warm-ups set no PR, in any of the three', () => {
  const workouts = pair([{ ...set('ex_bench', 500, 5, 1), type: 'warmup' }]);
  assert.deepEqual(sessionPRs(workouts[1], [workouts[0]]), []);
  assert.deepEqual(workoutPRs(workouts[1], workouts, exMap), []);
  assert.equal(weeklyPrTotal(workouts), 0);
});

test('the three agree across a longer history, workout by workout', () => {
  const history = [
    // a: first session on the lift — nothing to beat.
    { id: 'a', date: NOW - 40 * DAY, sets: [set('ex_bench', 100, 5, 1)] },
    // b: more reps at a weight already owned.
    { id: 'b', date: NOW - 33 * DAY, sets: [set('ex_bench', 100, 6, 1), set('ex_bench', 100, 6, 2)] },
    // c: raises the estimated max and nothing else. Not a PR.
    { id: 'c', date: NOW - 26 * DAY, sets: [set('ex_bench', 95, 10, 1)] },
    // d: a heavier bar.
    { id: 'd', date: NOW - 19 * DAY, sets: [set('ex_bench', 105, 5, 1)] },
    // e: the most work on the lift in one session, at a weight and rep count
    // already owned. A PR the old flags never counted.
    { id: 'e', date: NOW - 12 * DAY, sets: [set('ex_bench', 100, 6, 1), set('ex_bench', 100, 6, 2), set('ex_bench', 100, 6, 3)] },
    // f: a light session. Nothing.
    { id: 'f', date: NOW - 5 * DAY, sets: [set('ex_bench', 60, 5, 1)] }
  ];

  const expected = { a: 0, b: 1, c: 0, d: 1, e: 1, f: 0 };
  for (let i = 0; i < history.length; i++) {
    const w = history[i];
    const before = history.slice(0, i);
    assert.equal(sessionPRs(w, before).length, expected[w.id], `authority on ${w.id}`);
    assert.equal(workoutPRs(w, history, exMap).length, expected[w.id], `workoutPRs on ${w.id}`);
  }
  const total = Object.values(expected).reduce((a, n) => a + n, 0);
  assert.equal(prTimeline(history).length, total);
  assert.equal(weeklyPrTotal(history), total);
});

test('prKindFrom is the decision both paths now share', () => {
  // One prior session of 2 x 100 kg x 5: top weight 100, 5 reps at 100,
  // session volume 1000.
  const prevSets = [set('ex_bench', 100, 5, 1), set('ex_bench', 100, 5, 2)];
  const prevSessions = [prevSets];
  assert.equal(prKindFrom(prevSets, prevSessions, [set('ex_bench', 110, 5, 3)]), 'weight');
  assert.equal(prKindFrom(prevSets, prevSessions, [set('ex_bench', 100, 7, 3)]), 'reps');
  assert.equal(
    prKindFrom(prevSets, prevSessions, [set('ex_bench', 100, 5, 3), set('ex_bench', 100, 5, 4), set('ex_bench', 100, 5, 5)]),
    'volume'
  );
  // Raises the estimate, beats nothing else.
  assert.equal(prKindFrom(prevSets, prevSessions, [set('ex_bench', 95, 10, 3)]), null);
  // No history is no PR, whatever was lifted.
  assert.equal(prKindFrom([], [], [set('ex_bench', 300, 5, 2)]), null);
  // No current sets is no PR either.
  assert.equal(prKindFrom(prevSets, prevSessions, []), null);
});

test('the share-card image labels a PR with the authority\'s own words', () => {
  const workouts = pair([set('ex_bench', 110, 5, 1)]);
  const [pr] = workoutPRs(workouts[1], workouts, exMap);
  assert.equal(pr.label, 'Weight PR');
  assert.equal(pr.exerciseName, 'Bench Press');
  // The fields ShareCard.jsx draws.
  assert.equal(typeof pr.value, 'number');
  assert.equal(pr.unit, 'kg');
});
