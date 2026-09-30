// Is the old app's data fully readable by the new app?
//
// The migration tests above read the stores directly. This one goes through the
// app's own front door — getAllWorkouts(), getActiveWorkout(), and the real
// volume and PR calculations — because "the records are intact" and "the app can
// read them" are two different claims, and only the second one is what a user
// experiences.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyDb, upgradeTo, deleteDatabase, tally } from './helpers.mjs';
import { ordinaryHistory, inProgressWorkout, unknownExerciseWorkout, identicalTimestamps, legacyExercises, legacySettings } from './fixtures.mjs';

const db = await import('../src/db/database.js');
const calc = await import('../src/services/calculations.js');
const NAME = db.DB_NAME_FOR_TESTS;

// The app's definition of total volume, applied to raw old records — so the
// before number is computed the same way as the after number.
function totalVolume(workouts) {
  let v = 0;
  for (const w of workouts) v += calc.workingVolume(w.sets || []);
  return Math.round(v * 100) / 100;
}

const INPUT = [
  ...ordinaryHistory(24),
  inProgressWorkout,
  unknownExerciseWorkout,
  identicalTimestamps
];

test('counts and total volume are identical before and after the upgrade', async () => {
  await db.closeDB();
  await deleteDatabase(NAME);

  // BEFORE — measured on the v2 records, through the app's own volume function.
  const before = {
    ...tally(INPUT),
    volumeByAppCalc: totalVolume(INPUT)
  };

  await buildLegacyDb(NAME, 2, { workouts: INPUT, exercises: legacyExercises, settings: legacySettings });
  const conn = await upgradeTo(NAME, db.CURRENT_DB_VERSION, db.applyUpgrades);
  conn.close();
  await db.closeDB();

  // AFTER — read the way every screen in the app reads.
  const workouts = await db.getAllWorkouts();
  const after = { ...tally(workouts), volumeByAppCalc: totalVolume(workouts) };

  assert.equal(after.workouts, before.workouts);
  assert.equal(after.sets, before.sets);
  assert.equal(after.completedSets, before.completedSets);
  assert.equal(after.reps, before.reps);
  assert.equal(after.volumeKg, before.volumeKg);
  assert.equal(after.volumeByAppCalc, before.volumeByAppCalc);

  console.log(
    `      before: ${before.workouts} workouts · ${before.sets} sets `
    + `(${before.completedSets} completed) · ${before.reps} reps · ${before.volumeKg.toLocaleString()} kg`
  );
  console.log(
    `      after:  ${after.workouts} workouts · ${after.sets} sets `
    + `(${after.completedSets} completed) · ${after.reps} reps · ${after.volumeKg.toLocaleString()} kg`
  );

  // getAllWorkouts() sorts newest first, which History depends on.
  for (let i = 1; i < workouts.length; i++) {
    assert.ok(workouts[i - 1].date >= workouts[i].date, 'history must come back newest first');
  }
});

test('the active session is found through the isActive index after the upgrade', async () => {
  const active = await db.getActiveWorkout();
  assert.ok(active, 'getActiveWorkout() must find the migrated in-flight session');
  assert.equal(active.id, 'wo_active');
  assert.equal(active.sets.length, 3);
  // Normalised on the way out, so WorkoutScreen can render it without a guard.
  assert.ok(active.sets.every((s) => typeof s.order === 'number'));
  assert.deepEqual(active.skipped, []);
});

test('per-workout summaries and PRs compute on migrated data', async () => {
  const workouts = await db.getAllWorkouts();
  // Bests must be findable — this is what Progress and the PR badges read.
  const bench = workouts.filter((w) => w.sets.some((s) => s.exerciseId === 'ex_bench_press'));
  assert.ok(bench.length > 0);
  const best = calc.bestWorkingSet(bench[0].sets.filter((s) => s.exerciseId === 'ex_bench_press'));
  assert.ok(best && best.set.weightKg > 0 && best.e1rm > 0, 'a best working set must be computable');

  const series = calc.e1rmSeries(workouts, 'ex_bench_press');
  assert.ok(series.length > 0, 'the 1RM series must have points');

  const timeline = calc.buildPrTimeline(workouts);
  assert.ok(Array.isArray(timeline));

  const streak = calc.computeStreak(workouts, 1727000000000);
  assert.ok(streak !== undefined);

  // Grouping must not lose a set, including the ones on unknown exercises.
  const grouped = calc.groupSetsByExercise(unknownWorkout(workouts).sets);
  const totalGrouped = [...(grouped instanceof Map ? grouped.values() : Object.values(grouped))]
    .reduce((n, arr) => n + arr.length, 0);
  assert.equal(totalGrouped, 3);
});

function unknownWorkout(workouts) {
  const w = workouts.find((x) => x.id === 'wo_unknownex');
  assert.ok(w, 'the unknown-exercise workout must have survived');
  return w;
}
