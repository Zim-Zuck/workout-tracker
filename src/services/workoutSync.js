// BACKGROUND SYNC FOR FINISHED WORKOUTS.
//
// The contract, stated once so the rest of the app can stop thinking about it:
//
//   A finished workout lives on this device the instant Finish is tapped, with
//   synced=false. Getting it to the server is a separate, retryable, entirely
//   background concern. Nothing the user does ever waits for it, and nothing
//   about it can fail in a way that loses the session.
//
// Durability comes from the outbox (an IndexedDB store), so a queued upload
// survives the tab being killed, the phone running out of battery, and a week
// in a flat with no wifi. Idempotency comes from the workout's client-generated
// id: the server upserts on (user_id, client_id), so a request that timed out
// after committing is retried onto the same row rather than creating a second.
//
// THE SWEEP IS THE SAFETY NET. The queue is the fast path, but the database is
// the source of truth: sweepUnsynced() asks IndexedDB for every finished
// workout with synced=false and re-queues anything missing. That means a
// workout whose queue write failed, or whose queued item was dropped by an old
// build, is still picked up — the flag on the record is what decides, not the
// presence of a queue entry.
import { getUnsyncedWorkouts } from '../db/database.js';
import { enqueueWorkoutUpload, flushOutbox, nextRetryAt, getOutboxSnapshot } from './outbox.js';
import { isOnline } from './supabase.js';

export { enqueueWorkoutUpload };

// Re-queue everything the server does not have. Safe to run as often as you
// like: enqueueing is keyed by client id, so an already-queued workout is
// replaced in place rather than duplicated.
export async function sweepUnsynced() {
  const pending = await getUnsyncedWorkouts();
  for (const w of pending) await enqueueWorkoutUpload(w);
  return pending.length;
}

// One full sync pass: sweep, then drain.
//
// `userId` null (signed out) or no connection means there is nothing useful to
// do — the workouts stay queued, which is the correct resting state for someone
// who has never signed in.
export async function syncNow(userId, opts = {}) {
  const swept = await sweepUnsynced();
  if (!userId || !isOnline()) return { swept, sent: 0, failed: 0, skipped: true };
  const res = await flushOutbox(userId, opts);
  return { swept, ...res };
}

// ---- The scheduler ----
//
// One timer for the whole app, armed from the queue's own persisted backoff
// rather than polling on a fixed interval. Started once at boot; it re-arms
// itself after every pass and whenever the connection comes back.

let timer = null;
let getUserId = () => null;
let running = false;

const MIN_DELAY_MS = 1000;
const IDLE_DELAY_MS = 5 * 60 * 1000;

async function pass() {
  timer = null;
  if (running) return;
  running = true;
  try {
    await syncNow(getUserId());
  } catch (err) {
    // A sync pass must never be able to throw into the app. The queue is
    // unchanged by a failure here, so the next pass tries again.
    console.warn('Workout sync pass failed:', err);
  } finally {
    running = false;
    await arm();
  }
}

async function arm() {
  if (timer) return;
  let delay = IDLE_DELAY_MS;
  try {
    const items = await getOutboxSnapshot();
    if (items.length) {
      const next = await nextRetryAt();
      delay = Math.max(MIN_DELAY_MS, (next ?? 0) - Date.now());
      // A queue with nothing in a backoff window still gets a short delay
      // rather than a tight loop.
      if (!Number.isFinite(delay)) delay = IDLE_DELAY_MS;
    }
  } catch { /* fall through to the idle delay */ }
  timer = setTimeout(() => { pass(); }, Math.min(delay, IDLE_DELAY_MS));
  // Never hold the process open in Node (the test runner imports this module).
  timer?.unref?.();
}

// Start the engine. Idempotent — calling it twice does not create two timers.
// `userIdGetter` is a function rather than a value because the signed-in user
// changes while the app is running and the engine outlives any one of them.
export function startSyncEngine(userIdGetter) {
  getUserId = userIdGetter || (() => null);
  if (typeof window !== 'undefined' && !startSyncEngine._bound) {
    startSyncEngine._bound = true;
    // Coming back online is the single most likely moment for the queue to
    // drain, so it gets an immediate pass rather than waiting for a timer.
    window.addEventListener('online', () => { kick(); });
    // Reopening the app after it was backgrounded at the gym is the second.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') kick();
    });
  }
  kick();
}

// Run a pass now, cancelling any armed timer.
export function kick() {
  if (timer) { clearTimeout(timer); timer = null; }
  pass();
}

export function stopSyncEngine() {
  if (timer) { clearTimeout(timer); timer = null; }
}
