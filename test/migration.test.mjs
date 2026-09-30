// The migration, against the hard cases.
//
// What every one of these tests is really asking: after the upgrade, does this
// device still have everything it had before? Counted, not assumed.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  req, buildLegacyDb, upgradeTo, readStore, deleteDatabase, tally, assertTallyEqual
} from './helpers.mjs';
import {
  ordinaryHistory, inProgressWorkout, brokenRecords, identicalTimestamps,
  unknownExerciseWorkout, largeHistory, legacyExercises, legacySettings
} from './fixtures.mjs';

const { applyUpgrades, CURRENT_DB_VERSION, BACKUP_STORES, BACKUP_META_KEY } =
  await import('../src/db/database.js');
const { orderedSets, setLabels } = await import('../src/db/normalize.js');

let n = 0;
const nextName = () => `migration-test-${++n}`;

// Build at `fromVersion`, upgrade to current, hand back everything a test needs.
async function migrate(fromVersion, data) {
  const name = nextName();
  await buildLegacyDb(name, fromVersion, data);
  const db = await upgradeTo(name, CURRENT_DB_VERSION, applyUpgrades);
  const workouts = await readStore(db, 'workouts');
  const exercises = await readStore(db, 'exercises');
  const settings = await readStore(db, 'settings');
  const backup = {
    workouts: await readStore(db, BACKUP_STORES.workouts),
    exercises: await readStore(db, BACKUP_STORES.exercises),
    settings: await readStore(db, BACKUP_STORES.settings)
  };
  const manifest = await req(db.transaction('meta').objectStore('meta').get(BACKUP_META_KEY));
  return { name, db, workouts, exercises, settings, backup, manifest: manifest?.value };
}

test('v2 → current keeps every workout, set and kilogram', async () => {
  const input = [...ordinaryHistory(), inProgressWorkout];
  const before = tally(input);
  const r = await migrate(2, { workouts: input, exercises: legacyExercises, settings: legacySettings });

  assert.equal(r.db.version, CURRENT_DB_VERSION);
  assert.equal(r.workouts.length, input.length, 'workout count');
  assertTallyEqual(before, tally(r.workouts), 'v2 → current');

  // The three numbers, stated, because "counts match" is the whole claim.
  assert.equal(before.workouts, 25);
  assert.equal(before.sets, 123);        // 24 × 5, plus the 3 of the live session
  assert.equal(before.completedSets, 98); // 24 × 4, plus the 2 already ticked
  assert.ok(before.volumeKg > 0);

  r.db.close();
});

test('v1 jumping straight to current is the same outcome as going via v2', async () => {
  const input = [...ordinaryHistory(6), inProgressWorkout];
  const before = tally(input);
  const r = await migrate(1, { workouts: input, exercises: legacyExercises, settings: legacySettings });

  assertTallyEqual(before, tally(r.workouts), 'v1 → current');
  // The v2 stores must exist even though the v1 database never had them: a
  // device that skipped the social release still needs an outbox.
  const names = [...r.db.objectStoreNames];
  for (const s of ['outbox', 'socialCache', ...Object.values(BACKUP_STORES)]) {
    assert.ok(names.includes(s), `missing store ${s}`);
  }
  assert.ok(r.workouts.every((w) => Array.isArray(w.skipped) && w.split === null));
  r.db.close();
});

test('an empty database upgrades cleanly and takes no backup it does not need', async () => {
  const r = await migrate(2, {});
  assert.equal(r.workouts.length, 0);
  assert.equal(r.backup.workouts.length, 0);
  // The manifest IS written (there was a database, just an empty one), with
  // zero counts — which is what makes the Settings row hide itself.
  assert.equal(r.manifest.counts.workouts, 0);
  r.db.close();
});

test('a brand-new database gets the backup stores but no manifest', async () => {
  const name = nextName();
  await deleteDatabase(name);
  const db = await upgradeTo(name, CURRENT_DB_VERSION, applyUpgrades);
  for (const s of Object.values(BACKUP_STORES)) {
    assert.ok([...db.objectStoreNames].includes(s), `missing ${s}`);
  }
  const manifest = await req(db.transaction('meta').objectStore('meta').get(BACKUP_META_KEY));
  assert.equal(manifest, undefined, 'a fresh install has nothing to protect');
  db.close();
});

test('the pre-upgrade backup is a byte-for-byte copy of the OLD shape', async () => {
  const input = [...ordinaryHistory(5), inProgressWorkout];
  const r = await migrate(2, { workouts: input, exercises: legacyExercises, settings: legacySettings });

  assert.equal(r.backup.workouts.length, input.length);
  assert.equal(r.backup.exercises.length, legacyExercises.length);
  assert.equal(r.backup.settings.length, legacySettings.length);

  // The snapshot must NOT have been normalised: it is the pre-migration truth,
  // and the moment it carries `order` it is a copy of the result instead.
  const byId = new Map(r.backup.workouts.map((w) => [w.id, w]));
  for (const original of input) {
    assert.deepEqual(byId.get(original.id), original, `backup of ${original.id} differs from the original`);
  }
  assertTallyEqual(tally(input), tally(r.backup.workouts), 'backup');

  assert.equal(r.manifest.fromVersion, 2);
  assert.equal(r.manifest.counts.workouts, input.length);
  assert.equal(r.manifest.counts.exercises, legacyExercises.length);
  assert.equal(r.manifest.counts.settings, legacySettings.length);
  assert.equal(r.manifest.launches, 0);
  r.db.close();
});

test('the migration is additive: no original field is dropped or rewritten', async () => {
  const input = ordinaryHistory(8);
  const r = await migrate(2, { workouts: input, exercises: legacyExercises, settings: legacySettings });
  const byId = new Map(input.map((w) => [w.id, w]));

  for (const w of r.workouts) {
    const o = byId.get(w.id);
    for (const key of Object.keys(o)) {
      if (key === 'sets') continue;
      assert.deepEqual(w[key], o[key], `workout ${w.id}.${key} was changed`);
    }
    const setsById = new Map(o.sets.map((s) => [s.id, s]));
    for (const s of w.sets) {
      const os = setsById.get(s.id);
      assert.ok(os, `set ${s.id} did not exist before the upgrade`);
      for (const key of Object.keys(os)) {
        assert.deepEqual(s[key], os[key], `set ${s.id}.${key} was changed`);
      }
      // And the new fields are there.
      assert.equal(typeof s.order, 'number');
      assert.notEqual(s.completedAt, undefined);
    }
  }
  // Exercises and settings are not touched at all by this migration.
  assert.deepEqual([...r.exercises].sort((a, b) => a.id < b.id ? -1 : 1), [...legacyExercises].sort((a, b) => a.id < b.id ? -1 : 1));
  assert.deepEqual([...r.settings].sort((a, b) => a.key < b.key ? -1 : 1), [...legacySettings].sort((a, b) => a.key < b.key ? -1 : 1));
  r.db.close();
});

test('an in-progress session survives as the active session, with its sets intact', async () => {
  const r = await migrate(2, { workouts: [...ordinaryHistory(3), inProgressWorkout] });
  const active = r.workouts.filter((w) => w.isActive === 1);
  assert.equal(active.length, 1, 'exactly one active session');
  assert.equal(active[0].id, 'wo_active');
  assert.equal(active[0].sets.length, 3);
  assert.equal(active[0].endTime, null, 'an unfinished session must not gain an end time');
  // Ordering must reflect what was logged, and the uncompleted set must stay last
  // and stay uncompleted.
  const ordered = orderedSets(active[0].sets, 'ex_squat');
  assert.deepEqual(ordered.map((s) => s.id), ['sa1', 'sa2', 'sa3']);
  assert.equal(ordered[2].completed, false);
  assert.equal(ordered[2].completedAt, null);
  r.db.close();
});

test('records with missing or null fields survive the upgrade unharmed', async () => {
  const r = await migrate(2, { workouts: brokenRecords });
  assert.equal(r.workouts.length, brokenRecords.length, 'not one broken record was dropped');

  const byId = new Map(r.workouts.map((w) => [w.id, w]));
  // A workout with no sets array gets one, and keeps everything else.
  assert.deepEqual(byId.get('wo_nosets').sets, []);
  assert.equal(byId.get('wo_nosets').name, 'Ghost');
  // A null date is left AS IT WAS by the migration — repairing it is the
  // importer's job, not the upgrade's. The upgrade's job is to not lose it.
  assert.equal(byId.get('wo_nulldate').date, null);
  assert.equal(byId.get('wo_nulldate').sets.length, 1);
  // Null numbers are preserved rather than coerced: the upgrade does not invent
  // data, and a 0 kg set would read as a real 0 kg set.
  assert.equal(byId.get('wo_nullnums').sets[0].weightKg, null);
  // A set with no type is given the default, which is the one field the
  // normaliser does fill in, because every consumer switches on it.
  assert.equal(byId.get('wo_notype').sets[0].type, 'working');
  // The stale active record is still here, still active. Resolving which of two
  // active sessions wins belongs to the import path; nothing is deleted on the
  // way through an upgrade.
  assert.equal(r.workouts.filter((w) => w.isActive === 1).length, 1);
  assert.equal(byId.get('wo_active2').isActive, 1);
  // And the backup holds all of them, still broken, still complete.
  assert.equal(r.backup.workouts.length, brokenRecords.length);
  r.db.close();
});

test('sets sharing one millisecond get distinct, stable orders', async () => {
  const r = await migrate(2, { workouts: [identicalTimestamps] });
  const w = r.workouts[0];
  const orders = w.sets.map((s) => s.order);
  assert.equal(new Set(orders).size, orders.length, 'orders must be unique');
  assert.deepEqual([...orders].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  // Eight working sets must number 1..8, with no repeats — the bug this field
  // exists to fix.
  const labels = setLabels(orderedSets(w.sets, 'ex_bench_press')).map((x) => x.number);
  assert.deepEqual(labels, [1, 2, 3, 4, 5, 6, 7, 8]);
  r.db.close();
});

test('duplicate ids cannot silently collapse history during an upgrade', async () => {
  // Two records with the same id cannot coexist in IndexedDB — the second put()
  // overwrites the first. So the interesting assertion is about the IMPORT path,
  // which is where duplicates actually arrive (a merged file, a hand-edited
  // export). Here we prove the upgrade at least does not create any.
  const a = { ...ordinaryHistory(1)[0] };
  const b = { ...a, name: 'Second copy', sets: a.sets.slice(0, 2) };
  const name = nextName();
  await buildLegacyDb(name, 2, { workouts: [a, b] });
  const db = await upgradeTo(name, CURRENT_DB_VERSION, applyUpgrades);
  const rows = await readStore(db, 'workouts');
  assert.equal(rows.length, 1, 'IndexedDB keeps one record per key, as expected');
  assert.equal(rows[0].name, 'Second copy', 'the later write is what was on disk before the upgrade');
  // Set ids within the surviving record are unique, so nothing renders twice.
  assert.equal(new Set(rows[0].sets.map((s) => s.id)).size, rows[0].sets.length);
  db.close();
});

test('workouts referencing unknown or custom exercises migrate like any other', async () => {
  const r = await migrate(2, { workouts: [unknownExerciseWorkout], exercises: legacyExercises });
  const w = r.workouts[0];
  assert.equal(w.sets.length, 3);
  // Each unknown exercise is ordered independently, which is the whole point of
  // ordering per exercise rather than per workout.
  for (const exId of ['ex_deleted', 'ex_custom_mine', 'ex_from_the_future']) {
    assert.deepEqual(orderedSets(w.sets, exId).map((s) => s.order), [0]);
  }
  // An unrecognised set type is NOT rewritten to 'working'. A future build's
  // field surviving a downgrade intact is the same promise as an old build's.
  assert.equal(w.sets.find((s) => s.id === 'u3').type, 'myotatic');
  assertTallyEqual(tally([unknownExerciseWorkout]), tally(r.workouts), 'unknown exercises');
  r.db.close();
});

test('a 5,000-workout history migrates completely, and gets a complete backup', async () => {
  const input = largeHistory(5000);
  const before = tally(input);
  assert.equal(before.workouts, 5000);
  assert.equal(before.sets, 30000);

  const started = Date.now();
  const r = await migrate(2, { workouts: input, exercises: legacyExercises, settings: legacySettings });
  const elapsed = Date.now() - started;

  assert.equal(r.workouts.length, 5000);
  assertTallyEqual(before, tally(r.workouts), 'large history');
  // The safety net has to scale with the data, or it is not a safety net for the
  // people with the most to lose.
  assert.equal(r.backup.workouts.length, 5000);
  assertTallyEqual(before, tally(r.backup.workouts), 'large history backup');
  assert.equal(r.manifest.counts.workouts, 5000);
  console.log(`      5,000 workouts / 30,000 sets migrated and backed up in ${elapsed} ms`);
  r.db.close();
});

test('re-opening at the current version changes nothing', async () => {
  const input = [...ordinaryHistory(10), inProgressWorkout, identicalTimestamps];
  const r = await migrate(2, { workouts: input });
  const first = JSON.stringify(r.workouts);
  const firstBackup = JSON.stringify(r.backup.workouts);
  r.db.close();

  const db2 = await upgradeTo(r.name, CURRENT_DB_VERSION, applyUpgrades);
  assert.equal(JSON.stringify(await readStore(db2, 'workouts')), first, 'workouts changed on reopen');
  assert.equal(JSON.stringify(await readStore(db2, BACKUP_STORES.workouts)), firstBackup, 'the backup was overwritten on reopen');
  db2.close();
});

test('a failure mid-upgrade rolls back and leaves the old database untouched', async () => {
  const input = [...ordinaryHistory(12), inProgressWorkout];
  const before = tally(input);
  const name = nextName();
  await buildLegacyDb(name, 2, { workouts: input, exercises: legacyExercises, settings: legacySettings });

  // Run the real upgrade, then throw from inside the same versionchange
  // transaction — which is what a bug in a future migration block looks like.
  await assert.rejects(() => new Promise((res, rej) => {
    const q = indexedDB.open(name, CURRENT_DB_VERSION);
    q.onupgradeneeded = (e) => {
      applyUpgrades(q.result, e.oldVersion, e.target.transaction);
      // A deliberate abort. IndexedDB gives us all-or-nothing for free inside a
      // versionchange transaction; this test is here to prove we are actually
      // relying on it and have not, for instance, moved the data rewrite into a
      // separate transaction of its own.
      e.target.transaction.abort();
    };
    q.onsuccess = () => { q.result.close(); res(); };
    q.onerror = () => rej(q.error || new Error('aborted'));
  }), 'the open must fail when its upgrade transaction aborts');

  // Everything is exactly as it was, at the OLD version, in the OLD shape.
  const db = await new Promise((res, rej) => {
    const q = indexedDB.open(name);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  assert.equal(db.version, 2, 'the database must still be on the old version');
  assert.ok(![...db.objectStoreNames].includes(BACKUP_STORES.workouts), 'the backup store must have rolled back too');
  const rows = await readStore(db, 'workouts');
  assertTallyEqual(before, tally(rows), 'after rollback');
  assert.ok(rows.every((w) => w.sets.every((s) => s.order === undefined)), 'no record was left half-migrated');
  db.close();
});
