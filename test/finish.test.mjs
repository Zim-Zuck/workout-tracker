// FINISHING A WORKOUT, OFFLINE AND ONLINE, AND EVERY WAY IT USED TO FAIL.
//
// These tests drive the REAL completion service and the REAL outbox against
// fake-indexeddb. Nothing here reimplements the logic it is checking, and
// nothing here is allowed to touch a network: the fake Supabase client below is
// the only thing that can "reach a server", and the offline cases simply do not
// hand one over.
//
// The invariant every case exists to protect: once Finish has returned, the
// session is on this device. Whether the server has it, whether the phone has
// signal, whether the upload has been attempted — none of that can change that
// fact, and none of it is allowed to delay it.
import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyDb, upgradeTo, deleteDatabase } from './helpers.mjs';

const db = await import('../src/db/database.js');
const completion = await import('../src/services/workoutCompletion.js');
const outbox = await import('../src/services/outbox.js');
const sync = await import('../src/services/workoutSync.js');

const NAME = db.DB_NAME_FOR_TESTS;
const USER = 'user-1';

function activeWorkout(id = 'wo_1', { sets = 3 } = {}) {
  const now = 1_700_000_000_000;
  return {
    id,
    clientId: id,
    date: now,
    startTime: now,
    endTime: null,
    split: 'push',
    name: 'Push',
    exercises: ['ex_bench_press'],
    sets: Array.from({ length: sets }, (_, i) => ({
      id: `${id}_s${i}`,
      exerciseId: 'ex_bench_press',
      type: 'working',
      weightKg: 80 + i * 2.5,
      reps: 8,
      order: i,
      timestamp: now + i,
      completedAt: now + i,
      completed: true
    })),
    skipped: [],
    notes: '',
    isActive: 1,
    status: 'active',
    synced: false
  };
}

async function freshDb() {
  await db.closeDB();
  await deleteDatabase(NAME);
  await buildLegacyDb(NAME, 2, {});
  const conn = await upgradeTo(NAME, db.CURRENT_DB_VERSION, db.applyUpgrades);
  conn.close();
  await db.closeDB();
}

// A Supabase stand-in that records what it was asked to write and can be told
// to fail. `rows` is keyed the way the real unique constraint is keyed, so a
// duplicate upload shows up here as one row, not two.
function fakeSupabase({ failTimes = 0 } = {}) {
  const state = { rows: new Map(), calls: 0, failures: 0 };
  let remaining = failTimes;
  return {
    state,
    from(table) {
      return {
        upsert(payload) {
          state.calls += 1;
          if (remaining > 0) {
            remaining -= 1;
            state.failures += 1;
            return Promise.resolve({ error: new Error('network down') });
          }
          const list = Array.isArray(payload) ? payload : [payload];
          for (const row of list) {
            state.rows.set(`${table}:${row.user_id}:${row.client_id ?? row.exercise_id ?? 'x'}`, row);
          }
          return Promise.resolve({ error: null });
        },
        delete() { return { eq: () => ({ in: () => Promise.resolve({ error: null }) }) }; }
      };
    },
    rpc() { return Promise.resolve({ error: null }); }
  };
}

beforeEach(async () => {
  await freshDb();
  await db.clearOutbox();
});

test('an offline finish saves locally, with no network of any kind', async () => {
  await db.saveWorkout(activeWorkout());

  // No client is created, no client is passed. If anything in the critical path
  // reached for one, this test could not pass.
  const done = await completion.finishActiveWorkout();

  assert.equal(done.isActive, 0);
  assert.equal(done.status, 'finished');
  assert.equal(done.synced, false, 'a finished workout starts unsynced');
  assert.equal(done.clientId, 'wo_1');
  assert.ok(done.endTime > 0, 'the session is stamped with when it ended');

  // The authority is the database, not the returned object.
  const onDisk = await db.getWorkout('wo_1');
  assert.equal(onDisk.isActive, 0);
  assert.equal(onDisk.synced, false);
  assert.equal(onDisk.sets.length, 3, 'every logged set survived');
  assert.equal(await db.getActiveWorkout(), null, 'no session is left active');
});

test('finish uses the record on disk, not a stale copy from the caller', async () => {
  // The old bug: the screen held an `active` snapshot taken before the last set
  // was ticked, and finishing wrote that snapshot back — losing the set.
  const stale = activeWorkout();
  const fresh = { ...stale, sets: [...stale.sets, {
    id: 'wo_1_s3', exerciseId: 'ex_bench_press', type: 'working',
    weightKg: 90, reps: 5, order: 3, timestamp: 1, completedAt: 1, completed: true
  }] };
  await db.saveWorkout(fresh);

  const done = await completion.finishActiveWorkout({ fallback: stale });

  assert.equal(done.sets.length, 4, 'the set logged last must not be dropped');
  assert.ok(done.sets.some((s) => s.id === 'wo_1_s3'));
});

test('finish falls back to the caller copy only when IndexedDB has no active session', async () => {
  const held = activeWorkout('wo_fallback');
  const done = await completion.finishActiveWorkout({ fallback: held });
  assert.equal(done.id, 'wo_fallback');
  assert.equal((await db.getWorkout('wo_fallback')).isActive, 0);
});

test('nothing to finish returns null rather than inventing a workout', async () => {
  assert.equal(await completion.finishActiveWorkout(), null);
});

test('a failed local write throws, and leaves the session open', async () => {
  await db.saveWorkout(activeWorkout());

  // Simulated local-storage failure, injected at the one place the critical
  // path writes. The point of the test is the CONSEQUENCE: an error the UI can
  // show, and a session that is still there afterwards.
  const realOpen = indexedDB.open;
  let broken = true;
  indexedDB.open = function (...args) {
    if (broken) {
      const req = realOpen.apply(this, args);
      // Break the connection the way a failing transaction does.
      const original = req;
      return new Proxy(original, {
        get(target, prop) {
          if (prop === 'result') {
            const real = target.result;
            if (!real) return real;
            return new Proxy(real, {
              get(t2, p2) {
                if (p2 === 'transaction') return () => { throw new Error('QuotaExceededError'); };
                const v = t2[p2];
                return typeof v === 'function' ? v.bind(t2) : v;
              }
            });
          }
          const v = target[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        },
        set(target, prop, value) { target[prop] = value; return true; }
      });
    }
    return realOpen.apply(this, args);
  };

  await db.closeDB();
  let threw = null;
  try {
    await completion.finishActiveWorkout({ fallback: activeWorkout() });
  } catch (err) {
    threw = err;
  } finally {
    indexedDB.open = realOpen;
    broken = false;
    await db.closeDB();
  }

  assert.ok(threw, 'a local save that cannot be completed must throw, not resolve');
  assert.equal(threw.name, 'WorkoutSaveError');
  assert.match(threw.message, /still open/i, 'the message tells the user nothing was lost');

  // And the session really is still there.
  const stillActive = await db.getActiveWorkout();
  assert.ok(stillActive, 'the active session survived the failed finish');
  assert.equal(stillActive.id, 'wo_1');
});

test('finishing twice is harmless: the second call has nothing to finish', async () => {
  await db.saveWorkout(activeWorkout());
  const first = await completion.finishActiveWorkout();
  const second = await completion.finishActiveWorkout();
  assert.ok(first);
  assert.equal(second, null, 'a double tap cannot produce a second workout');
  const all = await db.getAllWorkouts();
  assert.equal(all.length, 1);
});

test('rapid concurrent finishes produce exactly one finished workout', async () => {
  await db.saveWorkout(activeWorkout());
  const results = await Promise.all([
    completion.finishActiveWorkout(),
    completion.finishActiveWorkout(),
    completion.finishActiveWorkout()
  ]);
  const saved = await db.getAllWorkouts();
  assert.equal(saved.length, 1, 'one session in, one session out');
  assert.equal(saved[0].isActive, 0);
  assert.ok(results.some((r) => r && r.id === 'wo_1'));
});

test('the finished workout is queued for upload under its client id', async () => {
  await db.saveWorkout(activeWorkout());
  const done = await completion.finishActiveWorkout();
  await completion.queueWorkoutUpload(done);

  const queued = await db.getOutbox();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].kind, outbox.KIND.WORKOUT);
  assert.equal(queued[0].id, 'ob_wo_wo_1');
  assert.equal(queued[0].payload.client_id, 'wo_1');
  assert.equal(queued[0].payload.payload.sets.length, 3);

  // Queueing the SAME workout again replaces the item rather than adding one.
  await completion.queueWorkoutUpload(done);
  assert.equal((await db.getOutbox()).length, 1, 'enqueue is idempotent per workout');
});

test('background sync uploads the workout and only then marks it synced', async () => {
  await db.saveWorkout(activeWorkout());
  const done = await completion.finishActiveWorkout();
  await completion.queueWorkoutUpload(done);

  const sb = fakeSupabase();
  const res = await outbox.flushOutbox(USER, { client: sb });

  assert.equal(res.sent, 1);
  assert.equal(sb.state.rows.size, 1);
  assert.equal((await db.getWorkout('wo_1')).synced, true, 'synced is the server receipt');
  assert.equal((await db.getOutbox()).length, 0, 'a sent item leaves the queue');
});

test('a server failure keeps the workout queued, unsynced, and backs off', async () => {
  await db.saveWorkout(activeWorkout());
  const done = await completion.finishActiveWorkout();
  await completion.queueWorkoutUpload(done);

  const sb = fakeSupabase({ failTimes: 1 });
  const now = 1_000_000;
  const res = await outbox.flushOutbox(USER, { client: sb, now, random: () => 0.5 });

  assert.equal(res.sent, 0);
  assert.equal(res.failed, 1);
  const [item] = await db.getOutbox();
  assert.equal(item.attempts, 1);
  assert.ok(item.nextAttemptAt > now, 'the retry is scheduled, not immediate');
  assert.equal((await db.getWorkout('wo_1')).synced, false, 'a failed upload must not mark synced');

  // Inside the backoff window the item is deferred, not retried.
  const deferredRun = await outbox.flushOutbox(USER, { client: sb, now: now + 1 });
  assert.equal(deferredRun.deferred, 1);
  assert.equal(deferredRun.sent, 0);

  // Past the window it goes, and lands on the same row.
  const after = await outbox.flushOutbox(USER, { client: sb, now: item.nextAttemptAt + 1 });
  assert.equal(after.sent, 1);
  assert.equal(sb.state.rows.size, 1, 'the retry did not create a second server record');
  assert.equal((await db.getWorkout('wo_1')).synced, true);
});

test('backoff grows exponentially and is capped', () => {
  const noJitter = () => 0.5; // exactly 1.0x
  assert.equal(outbox.backoffMs(1, noJitter), outbox.BACKOFF_BASE_MS);
  assert.equal(outbox.backoffMs(2, noJitter), outbox.BACKOFF_BASE_MS * 2);
  assert.equal(outbox.backoffMs(3, noJitter), outbox.BACKOFF_BASE_MS * 4);
  assert.equal(outbox.backoffMs(40, noJitter), outbox.BACKOFF_MAX_MS);
  // Jitter stays inside ±20%.
  const low = outbox.backoffMs(3, () => 0);
  const high = outbox.backoffMs(3, () => 1);
  assert.ok(low < high && low >= outbox.BACKOFF_BASE_MS * 4 * 0.8 - 1);
  assert.ok(high <= outbox.BACKOFF_BASE_MS * 4 * 1.2 + 1);
});

test('an upload retried after a timeout cannot create a duplicate server record', async () => {
  await db.saveWorkout(activeWorkout());
  const done = await completion.finishActiveWorkout();

  const sb = fakeSupabase();
  // Queue, send, then queue the same workout again (the shape of "the response
  // never came back, so we tried again") and send once more.
  await completion.queueWorkoutUpload(done);
  await outbox.flushOutbox(USER, { client: sb });
  await completion.queueWorkoutUpload(done);
  await outbox.flushOutbox(USER, { client: sb });

  assert.equal(sb.state.calls, 2, 'both attempts really were sent');
  assert.equal(sb.state.rows.size, 1, 'and both landed on one row');
});

test('an app restart with unsynced workouts re-queues them from the database', async () => {
  // Two finished-but-unsynced sessions and an empty outbox: exactly the state a
  // phone is in after being killed at the gym.
  await db.saveWorkout({ ...activeWorkout('wo_a'), isActive: 0, status: 'finished', synced: false });
  await db.saveWorkout({ ...activeWorkout('wo_b'), isActive: 0, status: 'finished', synced: false });
  assert.equal((await db.getOutbox()).length, 0);

  const swept = await sync.sweepUnsynced();
  assert.equal(swept, 2);
  const queued = await db.getOutbox();
  assert.equal(queued.length, 2);

  const sb = fakeSupabase();
  await outbox.flushOutbox(USER, { client: sb });
  // The flush stops at the first failure but there are none, so both go.
  assert.equal(sb.state.rows.size, 2);
  assert.equal((await db.getWorkout('wo_a')).synced, true);
  assert.equal((await db.getWorkout('wo_b')).synced, true);
});

test('sweeping is safe to repeat and never queues an already-synced workout', async () => {
  await db.saveWorkout({ ...activeWorkout('wo_a'), isActive: 0, status: 'finished', synced: false });
  await db.saveWorkout({ ...activeWorkout('wo_old'), isActive: 0, status: 'finished', synced: true });

  await sync.sweepUnsynced();
  await sync.sweepUnsynced();
  await sync.sweepUnsynced();

  const queued = await db.getOutbox();
  assert.equal(queued.length, 1, 'repeated sweeps do not pile up');
  assert.equal(queued[0].payload.client_id, 'wo_a');
});

test('going offline mid-sync leaves the rest of the queue intact', async () => {
  await db.saveWorkout({ ...activeWorkout('wo_a'), isActive: 0, status: 'finished', synced: false });
  await db.saveWorkout({ ...activeWorkout('wo_b'), isActive: 0, status: 'finished', synced: false });
  await sync.sweepUnsynced();

  // The connection dies on the second request.
  const sb = fakeSupabase();
  let calls = 0;
  const flaky = {
    from: (t) => ({
      upsert: (p) => {
        calls += 1;
        if (calls === 2) return Promise.resolve({ error: new Error('Failed to fetch') });
        return sb.from(t).upsert(p);
      }
    }),
    rpc: () => Promise.resolve({ error: null })
  };

  const res = await outbox.flushOutbox(USER, { client: flaky, now: 1000, random: () => 0.5 });
  assert.equal(res.sent, 1);
  assert.equal(res.failed, 1);

  const left = await db.getOutbox();
  assert.equal(left.length, 1, 'the workout that did not get through is still queued');
  const syncedCount = (await db.getAllWorkouts()).filter((w) => w.synced).length;
  assert.equal(syncedCount, 1, 'only the one that reached the server is marked synced');

  // Connection back: the remainder goes.
  const after = await outbox.flushOutbox(USER, { client: sb, now: left[0].nextAttemptAt + 1 });
  assert.equal(after.sent, 1);
  assert.equal((await db.getOutbox()).length, 0);
  assert.equal((await db.getAllWorkouts()).filter((w) => w.synced).length, 2);
});

test('syncing while signed out or offline is a no-op that keeps everything queued', async () => {
  await db.saveWorkout({ ...activeWorkout('wo_a'), isActive: 0, status: 'finished', synced: false });

  const signedOut = await sync.syncNow(null);
  assert.equal(signedOut.skipped, true);
  assert.equal(signedOut.swept, 1, 'it still sweeps, so the queue is ready for sign-in');
  assert.equal((await db.getWorkout('wo_a')).synced, false);
  assert.equal((await db.getOutbox()).length, 1);
});

test('a queued workout whose local record was deleted is dropped, not retried forever', async () => {
  await db.saveWorkout({ ...activeWorkout('wo_gone'), isActive: 0, status: 'finished', synced: false });
  await sync.sweepUnsynced();
  await db.deleteWorkout('wo_gone');

  const sb = fakeSupabase();
  const res = await outbox.flushOutbox(USER, { client: sb });
  assert.equal(res.sent, 0);
  assert.equal(res.failed, 0);
  assert.equal(sb.state.calls, 0, 'nothing was uploaded for a workout that no longer exists');
  assert.equal((await db.getOutbox()).length, 0, 'and the dead item left the queue');
});

test('legacy workouts default to synced so an update does not queue a whole history', async () => {
  // A record written by a build that predates these fields.
  await db.saveWorkout({
    id: 'wo_legacy', date: 1, startTime: 1, endTime: 2, isActive: 0,
    exercises: ['ex_bench_press'], sets: []
  });
  const read = await db.getWorkout('wo_legacy');
  assert.equal(read.synced, true);
  assert.equal(read.status, 'finished');
  assert.equal(read.clientId, 'wo_legacy');
  assert.equal((await db.getUnsyncedWorkouts()).length, 0);
});
