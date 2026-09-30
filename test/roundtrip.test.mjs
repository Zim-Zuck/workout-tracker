// Export → wipe → import → deep-equal.
//
// This is the test that makes "export a backup" a promise rather than a hope. If
// a round trip is not lossless, the backup button is a button that produces a
// file which cannot fully restore you, and nobody finds that out until the day
// it matters.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyDb, upgradeTo, readStore, deleteDatabase, tally, assertTallyEqual, req } from './helpers.mjs';
import {
  ordinaryHistory, inProgressWorkout, brokenRecords, identicalTimestamps,
  unknownExerciseWorkout, legacyExercises, legacySettings, myExport
} from './fixtures.mjs';

const db = await import('../src/db/database.js');
const dm = await import('../src/services/dataManager.js');

const NAME = db.DB_NAME_FOR_TESTS;

// Put the app's real database into a known state, through the real upgrade path,
// then let the real dataManager work on it.
async function seedAppDb(data) {
  await db.closeDB();
  await deleteDatabase(NAME);
  await buildLegacyDb(NAME, 2, data);
  const conn = await upgradeTo(NAME, db.CURRENT_DB_VERSION, db.applyUpgrades);
  conn.close();
  await db.closeDB();
}

test('export → wipe → import restores exactly what was there', async () => {
  await seedAppDb({
    workouts: [...ordinaryHistory(20), inProgressWorkout, identicalTimestamps, unknownExerciseWorkout],
    exercises: legacyExercises,
    settings: legacySettings
  });

  const before = await dm.exportAll();
  const beforeTally = tally(before.workouts);

  // Everything the app can hold must be in the file. Listed explicitly rather
  // than spot-checked, because the failure mode here is a field somebody adds in
  // six months that quietly never gets exported.
  assert.ok(Array.isArray(before.workouts) && before.workouts.length === 23);
  assert.ok(Array.isArray(before.exercises) && before.exercises.length === 2);
  assert.equal(before.settings.defaultRestSec, 150);
  assert.equal(before.settings.soundEnabled, false);
  // The split override lives on the exercise record, so it rides along with it.
  assert.equal(before.exercises.find((e) => e.id === 'ex_split_override').split, 'pull');
  assert.equal(before.exercises.find((e) => e.id === 'ex_split_override').incrementKg, 2.5);
  // Set-level detail: tags (type), order, completion time, per-set weight.
  const tagged = before.workouts.flatMap((w) => w.sets).filter((s) => s.type !== 'working');
  assert.ok(tagged.length > 0, 'warm-up and other tagged sets must be in the export');
  assert.ok(before.workouts.every((w) => w.sets.every((s) => typeof s.order === 'number')));

  await dm.wipeAllData();
  const emptied = await dm.exportAll();
  assert.equal(emptied.workouts.length, 0);
  assert.equal(emptied.exercises.length, 0);
  assert.deepEqual(emptied.settings, {});

  const result = await dm.importReplaceAll(before);
  assert.equal(result.workouts, 23);

  const after = await dm.exportAll();

  // THE DEEP EQUAL. Sorted first, because neither store guarantees an order and
  // "same data in a different order" is not a difference anybody cares about.
  const norm = (d) => ({
    settings: d.settings,
    exercises: [...d.exercises].sort((a, b) => (a.id < b.id ? -1 : 1)),
    workouts: [...d.workouts]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((w) => ({ ...w, sets: [...w.sets].sort((a, b) => (a.id < b.id ? -1 : 1)) }))
  });
  assert.deepStrictEqual(norm(after), norm(before), 'the round trip was not lossless');
  assertTallyEqual(beforeTally, tally(after.workouts), 'round trip');
});

test('a second round trip is identical to the first — importing is idempotent', async () => {
  await seedAppDb({ workouts: ordinaryHistory(6), exercises: legacyExercises, settings: legacySettings });
  const first = await dm.exportAll();
  await dm.importReplaceAll(first);
  const second = await dm.exportAll();
  await dm.importReplaceAll(second);
  const third = await dm.exportAll();
  const strip = (d) => JSON.stringify({ ...d, exportedAt: null });
  assert.equal(strip(second), strip(third), 'importing an export of an import changed the data');
});

test('a schema v1 backup with none of the v3 fields imports cleanly', async () => {
  await seedAppDb({});
  // Exactly what an export from the pre-redesign app looked like.
  const old = {
    app: 'lift-workout-tracker',
    schemaVersion: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    settings: { defaultRestSec: 90 },
    exercises: legacyExercises,
    workouts: ordinaryHistory(4)
  };
  const before = tally(old.workouts);
  const r = await dm.importReplaceAll(old);
  assert.equal(r.workouts, 4);
  const after = await dm.exportAll();
  assertTallyEqual(before, tally(after.workouts), 'v1 backup import');
  assert.ok(after.workouts.every((w) => w.sets.every((s) => typeof s.order === 'number')));
  assert.ok(after.workouts.every((w) => Array.isArray(w.skipped) && w.split === null));
  assert.equal(after.settings.defaultRestSec, 90);
});

test('a backup full of broken records imports instead of throwing', async () => {
  await seedAppDb({});
  const file = {
    app: 'lift-workout-tracker', schemaVersion: 1, exportedAt: new Date().toISOString(),
    settings: {}, exercises: [{ id: 'ex_ok', name: 'Fine' }, { id: 'ex_noname' }, null],
    workouts: [...brokenRecords, null, { id: 'wo_empty', date: 1 }]
  };
  const r = await dm.importReplaceAll(file);
  // Every salvageable record landed. The old importer threw on the first null
  // date and wrote nothing at all.
  assert.equal(r.workouts, brokenRecords.length + 1);
  assert.equal(r.problems.droppedWorkouts, 1, 'only the literal null was unusable');

  const after = await dm.exportAll();
  const byId = new Map(after.workouts.map((w) => [w.id, w]));
  // The null date was repaired from startTime rather than left to break a chart.
  assert.equal(byId.get('wo_nulldate').date, 1726999998000);
  assert.equal(typeof byId.get('wo_nosets').date, 'number');
  assert.deepEqual(byId.get('wo_nosets').sets, []);
  // Null numbers became zeroes, which is what a chart can render.
  assert.equal(byId.get('wo_nullnums').sets[0].weightKg, 0);
  // The set with no exerciseId kept its weight and reps under a sentinel id.
  assert.equal(byId.get('wo_noex').sets[0].exerciseId, 'ex_unknown');
  assert.equal(byId.get('wo_noex').sets[0].reps, 12);
  // Only one session may be active after an import.
  assert.equal(after.workouts.filter((w) => w.isActive).length, 1);
});

test('duplicate ids in a backup are kept as separate records, not collapsed', async () => {
  await seedAppDb({});
  const base = ordinaryHistory(1)[0];
  const file = {
    app: 'lift-workout-tracker', schemaVersion: 1, exportedAt: new Date().toISOString(),
    settings: {}, exercises: legacyExercises,
    workouts: [base, { ...base, name: 'Same id, fewer sets', sets: base.sets.slice(0, 2) }]
  };
  const r = await dm.importReplaceAll(file);
  assert.equal(r.workouts, 2, 'both records were stored');
  assert.equal(r.problems.duplicateWorkouts, 1);
  const after = await dm.exportAll();
  // The more complete session kept the original id; the other was re-keyed and
  // says what it came from.
  const kept = after.workouts.find((w) => w.id === base.id);
  assert.equal(kept.sets.length, 5);
  const moved = after.workouts.find((w) => w.id !== base.id);
  assert.equal(moved.duplicateOf, base.id);
  assert.equal(moved.sets.length, 2);
});

test('restoring from the automatic pre-upgrade backup rebuilds the old data', async () => {
  const input = [...ordinaryHistory(9), inProgressWorkout];
  const before = tally(input);
  await seedAppDb({ workouts: input, exercises: legacyExercises, settings: legacySettings });

  const status = await dm.getAutomaticBackupStatus();
  assert.ok(status, 'the snapshot must be visible to Settings');
  assert.equal(status.counts.workouts, input.length);
  assert.equal(status.fromVersion, 2);

  // Lose everything, the way a bad migration or a mistaken wipe would.
  await dm.wipeAllData();
  assert.equal((await dm.exportAll()).workouts.length, 0);

  const r = await dm.restoreFromAutomaticBackup();
  assert.equal(r.workouts, input.length);
  const after = await dm.exportAll();
  assertTallyEqual(before, tally(after.workouts), 'restore from automatic backup');
  assert.equal(after.settings.defaultRestSec, 150);
  assert.equal(after.exercises.length, 2);

  // The snapshot survives being used, so it can be used again.
  const again = await dm.getAutomaticBackupStatus();
  assert.equal(again.counts.workouts, input.length);
  const second = await dm.restoreFromAutomaticBackup();
  assert.equal(second.workouts, input.length);
});

test('wiping data does not orphan the automatic backup', async () => {
  await seedAppDb({ workouts: ordinaryHistory(3), exercises: legacyExercises, settings: legacySettings });
  await dm.wipeAllData();
  const status = await dm.getAutomaticBackupStatus();
  assert.ok(status, 'the manifest must survive a clear-all, or the restore option disappears');
  assert.equal(status.counts.workouts, 3);
});

test('the snapshot is retired only after both the age and the launch thresholds', async () => {
  await seedAppDb({ workouts: ordinaryHistory(3), exercises: legacyExercises, settings: legacySettings });
  const info = await db.getBackupInfoLocal();
  const created = info.createdAt;

  // Four launches on day one: kept, every time.
  for (let i = 1; i <= 4; i++) {
    const r = await db.noteLaunchAndMaybeCleanBackup(created + 1000);
    assert.equal(r.kept, true, `launch ${i} on day one must keep the backup`);
    assert.equal(r.launches, i);
  }
  // Enough launches, not enough days: still kept.
  const old = created + (db.BACKUP_KEEP_DAYS - 1) * 86400000;
  assert.equal((await db.noteLaunchAndMaybeCleanBackup(old)).kept, true, '29 days is not 30');
  // Both thresholds met: retired, and the stores are actually emptied.
  const past = created + (db.BACKUP_KEEP_DAYS + 1) * 86400000;
  const gone = await db.noteLaunchAndMaybeCleanBackup(past);
  assert.equal(gone.kept, false);
  assert.equal(gone.reason, 'retired');
  assert.equal(await dm.getAutomaticBackupStatus(), null);
  assert.deepEqual(await db.readBackupCounts(), { workouts: 0, exercises: 0, settings: 0 });
  // And the live data is untouched by the housekeeping.
  assert.equal((await dm.exportAll()).workouts.length, 3);
  // Calling again on a retired backup is a no-op, not an error.
  assert.equal((await db.noteLaunchAndMaybeCleanBackup(past)).reason, 'none');
});

test('the raw dump reads every store without triggering an upgrade', async () => {
  const input = [...ordinaryHistory(5), inProgressWorkout];
  await seedAppDb({ workouts: input, exercises: legacyExercises, settings: legacySettings });
  await db.closeDB();

  const dump = await db.rawDump();
  assert.equal(dump.dbVersion, db.CURRENT_DB_VERSION);
  assert.equal(dump.stores.workouts.length, input.length);
  assert.equal(dump.stores[db.BACKUP_STORES.workouts].length, input.length);
  assert.equal(dump.stores.exercises.length, 2);
  assert.equal(dump.stores.settings.length, legacySettings.length);
  assertTallyEqual(tally(input), tally(dump.stores.workouts), 'raw dump');
});

test('the raw dump works on a database still at the OLD version', async () => {
  // The scenario the recovery screen exists for: the upgrade failed, the database
  // is still on v2, and the app cannot start. The dump must still produce the
  // user's history.
  const input = ordinaryHistory(7);
  await db.closeDB();
  await deleteDatabase(NAME);
  await buildLegacyDb(NAME, 2, { workouts: input, exercises: legacyExercises, settings: legacySettings });

  const dump = await db.rawDump();
  assert.equal(dump.dbVersion, 2, 'opening for a dump must not upgrade anything');
  assert.equal(dump.stores.workouts.length, 7);
  assertTallyEqual(tally(input), tally(dump.stores.workouts), 'raw dump at v2');
  // Still on v2 afterwards: a dump reads, and only reads.
  const check = await db.rawDump();
  assert.equal(check.dbVersion, 2);
});

test('a backup file that is not ours is still refused', async () => {
  assert.throws(() => dm.validateBackup(null), /not a JSON object/);
  assert.throws(() => dm.validateBackup({ app: 'something-else' }), /not a Lift backup/);
  assert.throws(() => dm.validateBackup({ app: 'lift-workout-tracker' }), /Missing schemaVersion/);
  assert.throws(
    () => dm.validateBackup({ app: 'lift-workout-tracker', schemaVersion: 99, exercises: [], workouts: [] }),
    /newer app version/
  );
  assert.throws(
    () => dm.validateBackup({ app: 'lift-workout-tracker', schemaVersion: 1, workouts: [] }),
    /exercises must be an array/
  );
});

// ---- The user's own data, if they supplied it ----
const mine = myExport();
test('the supplied real export round-trips exactly', { skip: mine ? false : 'fixtures/my-export.json not present' }, async () => {
  await seedAppDb({});
  const before = tally(mine.workouts || []);
  const r = await dm.importReplaceAll(mine);
  const after = await dm.exportAll();
  assertTallyEqual(before, tally(after.workouts), 'real export import');
  assert.equal(r.problems.droppedWorkouts, 0, 'no record of yours was unusable');
  const again = await dm.exportAll();
  await dm.importReplaceAll(again);
  const third = await dm.exportAll();
  assertTallyEqual(before, tally(third.workouts), 'real export second round trip');
  console.log(`      your export: ${before.workouts} workouts, ${before.sets} sets, ${before.volumeKg.toLocaleString()} kg`);
});
