// RANDOMISED HISTORIES AGAINST THE FOUR ANALYSIS FUNCTIONS.
//
// The example-based tests above pin the ANSWERS. This file pins something
// weaker but broader: that no input a real device can hold ever produces a NaN,
// an Infinity or a throw. Those are the failures that reach the UI as "NaN kg"
// or a blank screen, and they come from inputs nobody writes a test for — a
// workout with no sets, two sessions on the same millisecond, a weight typed as
// a string, a period with nothing in it on one side.
//
// DETERMINISTIC. A seeded PRNG, so a failure is reproducible from the seed
// printed in the assertion message rather than being a test that fails once a
// month and passes on re-run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTrend, rankExercises, buildHighlights, exerciseConsistency } from '../src/services/exerciseStats.js';
import { compareTrainingPeriods, precedingRange } from '../src/services/trainingEvolution.js';
import { milestonesFor } from '../src/services/milestones.js';
import { muscleVolume, repRangeCounts, e1rmSeries, computeStreak } from '../src/services/calculations.js';
import { prTimeline } from '../src/services/prs.js';

const DAY = 86400000;
const NOW = new Date(2026, 4, 13, 12).getTime();

// mulberry32 — small, seedable, good enough to shake out shapes.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EX_IDS = ['ex_bench_press', 'ex_squat', 'ex_deadlift', 'ex_pullup', 'ex_ghost'];
const EXERCISES = [
  { id: 'ex_bench_press', name: 'Bench Press', muscleGroups: ['Chest', 'Triceps'] },
  { id: 'ex_squat', name: 'Back Squat', muscleGroups: ['Quads', 'Glutes'] },
  { id: 'ex_deadlift', name: 'Deadlift', muscleGroups: ['Back', 'Hamstrings'] },
  { id: 'ex_pullup', name: 'Pull-Up', muscleGroups: ['Back', 'Biceps'] }
  // 'ex_ghost' deliberately absent: sets pointing at a merged-away or deleted
  // exercise are the normal case, not an exotic one.
];

// THE NASTY VALUES. Each is something a real record has actually held: an
// abandoned set with no weight, an import that wrote strings, a bodyweight lift
// at zero load, and the two that should never exist but must not crash anything
// if they do.
const WEIGHTS = [0, 0.5, 20, 100, 2.5, null, undefined, NaN, Infinity, -5, '80', -0];
const REPS = [0, 1, 5, 8, 12, 20, 100, null, undefined, NaN, -3, '10'];
const TYPES = ['working', 'warmup', 'drop', 'failure', undefined];

function randomHistory(r, { count = 20, sameDates = false, span = 200 } = {}) {
  const n = Math.floor(r() * count);
  const out = [];
  for (let i = 0; i < n; i++) {
    // sameDates collapses everything onto three days, which is how duplicate
    // timestamps and same-millisecond sessions actually arise.
    const date = sameDates
      ? NOW - [0, 1, 2][Math.floor(r() * 3)] * DAY
      : NOW - Math.floor(r() * span) * DAY;
    const setCount = Math.floor(r() * 6);
    out.push({
      id: `wo_${i}`,
      date,
      isActive: r() < 0.08 ? 1 : 0,
      sets: Array.from({ length: setCount }, (_, j) => ({
        id: `s_${i}_${j}`,
        exerciseId: EX_IDS[Math.floor(r() * EX_IDS.length)],
        type: TYPES[Math.floor(r() * TYPES.length)],
        weightKg: WEIGHTS[Math.floor(r() * WEIGHTS.length)],
        reps: REPS[Math.floor(r() * REPS.length)],
        completed: r() < 0.85,
        timestamp: date + j
      }))
    });
  }
  return out;
}

// Every number anywhere in the returned structure has to be finite. A single
// NaN two levels down is exactly the one that reaches the screen.
function assertAllFinite(value, where, seed) {
  const seen = new Set();
  const walk = (v, path) => {
    if (typeof v === 'number') {
      assert.ok(
        Number.isFinite(v),
        `${where}: ${path} is ${v} (seed ${seed}) — a non-finite number reaches the UI as "NaN"`
      );
      return;
    }
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(value, where);
}

const RUNS = 300;

test('classifyTrend never throws and never returns a non-finite number', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = rng(seed);
    const workouts = randomHistory(r, { sameDates: seed % 4 === 0 });
    for (const id of [...EX_IDS, 'never_trained']) {
      let out;
      assert.doesNotThrow(() => { out = classifyTrend(workouts, id, { start: -Infinity, end: NOW }); }, `seed ${seed}`);
      assertAllFinite(out, `classifyTrend(${id})`, seed);
      assert.ok(typeof out.status === 'string' && out.status.length > 0, `seed ${seed}: status must always be set`);
    }
  }
});

test('exerciseConsistency never throws and never returns a non-finite number', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const workouts = randomHistory(rng(seed), { sameDates: seed % 3 === 0 });
    for (const id of [...EX_IDS, 'never_trained']) {
      let out;
      assert.doesNotThrow(() => { out = exerciseConsistency(workouts, id, { start: -Infinity, end: NOW, asOf: NOW }); }, `seed ${seed}`);
      assertAllFinite(out, `exerciseConsistency(${id})`, seed);
    }
  }
});

test('rankExercises never throws, and every row it returns is a real number', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = rng(seed);
    const workouts = randomHistory(r, { sameDates: seed % 5 === 0 });
    for (const mode of ['frequency', 'volume', 'progression']) {
      let out;
      assert.doesNotThrow(() => {
        out = rankExercises(workouts, EXERCISES, { mode, start: NOW - 90 * DAY, end: NOW });
      }, `seed ${seed} mode ${mode}`);
      assertAllFinite(out, `rankExercises(${mode})`, seed);
      // The ranking must be a total order, not an arbitrary one: equal inputs
      // must not reorder between two calls on the same data.
      const again = rankExercises(workouts, EXERCISES, { mode, start: NOW - 90 * DAY, end: NOW });
      assert.deepEqual(
        out.rows.map((x) => x.exercise.id), again.rows.map((x) => x.exercise.id),
        `seed ${seed} mode ${mode}: ranking is not deterministic`
      );
    }
  }
});

test('rankExercises survives an exercise list that does not match the sets', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const workouts = randomHistory(rng(seed));
    for (const exercises of [[], null, undefined, EXERCISES, new Map(EXERCISES.map((e) => [e.id, e]))]) {
      let out;
      assert.doesNotThrow(() => {
        out = rankExercises(workouts, exercises, { mode: 'frequency', start: -Infinity, end: NOW });
      }, `seed ${seed}`);
      assertAllFinite(out, 'rankExercises(mismatched library)', seed);
    }
  }
});

test('compareTrainingPeriods never throws and never returns a non-finite number', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = rng(seed);
    const workouts = randomHistory(r, { sameDates: seed % 6 === 0 });
    const rangeB = { start: NOW - Math.floor(r() * 120) * DAY, end: NOW };
    const ranges = [
      precedingRange(rangeB),
      rangeB,                                            // identical periods
      { start: NOW, end: NOW },                          // a zero-width period
      { start: NOW - 400 * DAY, end: NOW - 399 * DAY },  // a period with nothing in it
      { start: NOW, end: NOW - 10 * DAY }                // reversed
    ];
    for (const rangeA of ranges) {
      let out;
      assert.doesNotThrow(() => { out = compareTrainingPeriods(workouts, EXERCISES, rangeA, rangeB); }, `seed ${seed}`);
      assertAllFinite(out, 'compareTrainingPeriods', seed);
      // A percentage must never be reported alongside a baseline of nothing —
      // that is exactly the "+Infinity%" the `kind` field exists to prevent.
      for (const [k, c] of Object.entries(out.delta)) {
        if (c.kind === 'new') assert.equal(c.pct, null, `seed ${seed}: delta.${k} claims a percentage from a zero baseline`);
      }
    }
  }
});

test('buildHighlights never throws and never returns a non-finite number', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const workouts = randomHistory(rng(seed), { sameDates: seed % 7 === 0 });
    let out;
    assert.doesNotThrow(() => { out = buildHighlights(workouts, EXERCISES, { start: NOW - 90 * DAY, end: NOW }); }, `seed ${seed}`);
    assertAllFinite(out, 'buildHighlights', seed);
  }
});

test('milestonesFor never throws and never returns a non-finite number', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const workouts = randomHistory(rng(seed), { sameDates: seed % 3 === 0, span: 900 });
    let out;
    assert.doesNotThrow(() => { out = milestonesFor(workouts, { asOf: NOW }); }, `seed ${seed}`);
    assertAllFinite(out, 'milestonesFor', seed);

    // The invariants that make the row meaningful at all.
    assert.ok(out.currentStreak <= out.bestStreak, `seed ${seed}: current streak exceeds the best ever`);
    assert.ok(out.totals.volumeKg >= 0, `seed ${seed}: lifetime volume went negative`);
    for (let i = 1; i < out.achieved.length; i++) {
      assert.ok(out.achieved[i - 1].date >= out.achieved[i].date, `seed ${seed}: achieved is not newest-first`);
    }
    for (const n of out.next) {
      assert.ok(n.pct >= 0 && n.pct <= 100, `seed ${seed}: ${n.label} is at ${n.pct}%`);
      assert.ok(n.remaining > 0, `seed ${seed}: ${n.label} is "next" but nothing is left of it`);
      assert.ok(n.current < n.threshold, `seed ${seed}: ${n.label} is already crossed`);
    }
    // One entry per category, every time.
    const cats = out.next.map((n) => n.category);
    assert.equal(new Set(cats).size, cats.length, `seed ${seed}: duplicate category in next`);
  }
});

test('milestonesFor agrees with the canonical functions it is built on', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const workouts = randomHistory(rng(seed), { span: 900 });
    const finished = workouts.filter((w) => !w.isActive);
    const out = milestonesFor(workouts, { asOf: NOW });
    assert.equal(out.totals.workouts, finished.length, `seed ${seed}: workout count disagrees`);
    assert.equal(out.totals.prs, prTimeline(finished).length, `seed ${seed}: PR count disagrees with prTimeline`);
    assert.equal(out.currentStreak, finished.length ? computeStreak(finished, NOW) : 0,
      `seed ${seed}: streak disagrees with computeStreak`);
  }
});

test('a huge history is handled without throwing', () => {
  const r = rng(99);
  const workouts = Array.from({ length: 3000 }, (_, i) => ({
    id: `wo_${i}`,
    date: NOW - i * 6 * 3600000,
    isActive: 0,
    sets: Array.from({ length: 12 }, (_, j) => ({
      id: `s_${i}_${j}`,
      exerciseId: EX_IDS[j % EX_IDS.length],
      type: 'working',
      weightKg: 40 + ((i * 7 + j) % 120),
      reps: 1 + ((i + j) % 12),
      completed: true,
      timestamp: NOW - i * 6 * 3600000 + j
    }))
  }));
  const out = milestonesFor(workouts, { asOf: NOW });
  assertAllFinite(out, 'milestonesFor(3000 workouts)', 99);
  assert.equal(out.totals.workouts, 3000);
  assert.equal(out.next.find((n) => n.category === 'workouts'), undefined, 'the workout ladder is finished at 3000');
  assertAllFinite(rankExercises(workouts, EXERCISES, { mode: 'volume', start: -Infinity, end: NOW }), 'rankExercises(huge)', 99);
  assertAllFinite(muscleVolume(workouts, EXERCISES, { start: -Infinity, end: NOW }), 'muscleVolume(huge)', 99);
  assertAllFinite(repRangeCounts(workouts, { start: -Infinity, end: NOW }), 'repRangeCounts(huge)', 99);
  assertAllFinite(e1rmSeries(workouts, 'ex_squat', { start: -Infinity, end: NOW }), 'e1rmSeries(huge)', 99);
});

test('every analysis function treats an empty history as empty, not as an error', () => {
  for (const workouts of [[], null, undefined]) {
    assert.doesNotThrow(() => {
      const t = classifyTrend(workouts || [], 'ex_squat', { start: -Infinity, end: NOW });
      assert.equal(t.status, 'insufficient');
      assertAllFinite(t, 'classifyTrend(empty)', 0);
      assertAllFinite(rankExercises(workouts, EXERCISES, { mode: 'frequency' }), 'rankExercises(empty)', 0);
      assertAllFinite(buildHighlights(workouts, EXERCISES, { start: NOW - DAY, end: NOW }), 'buildHighlights(empty)', 0);
      assertAllFinite(
        compareTrainingPeriods(workouts, EXERCISES, { start: NOW - 2 * DAY, end: NOW - DAY }, { start: NOW - DAY, end: NOW }),
        'compareTrainingPeriods(empty)', 0
      );
      assertAllFinite(milestonesFor(workouts, { asOf: NOW }), 'milestonesFor(empty)', 0);
    });
  }
});
