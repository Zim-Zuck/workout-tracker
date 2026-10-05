// Durable queue of pending cloud writes.
//
// The rule this module exists to enforce: finishing a workout must never wait
// for the network. The workout is already saved to IndexedDB by the time
// anything here runs; a failed or queued sync is invisible to the person
// logging sets.
//
// Snapshot kinds (stats, lifts) are idempotent full-state upserts, so a queued
// item is superseded rather than replayed — queueing a new one drops the older
// one. Event kinds (challenge progress) are not collapsible and queue up.
import {
  getOutbox, putOutboxItem, deleteOutboxItem, deleteOutboxByKind,
  getWorkout, setWorkoutSynced
} from '../db/database.js';
import { getSupabase, isOnline } from './supabase.js';
import { uid } from '../utils/id.js';

export const KIND = {
  STATS: 'stats',
  LIFTS: 'lifts',
  WEEKLY: 'weekly',
  CHALLENGE_PROGRESS: 'challenge_progress',
  // One finished workout, keyed by its client-generated id. Not collapsible —
  // every session is its own row and none of them supersedes another.
  WORKOUT: 'workout'
};

// Kinds where only the newest queued item has any meaning.
const COLLAPSIBLE = new Set([KIND.STATS, KIND.LIFTS, KIND.WEEKLY]);

// Give up after this many failures so a permanently-rejected item (say, one that
// violates a constraint) cannot block the queue forever.
const MAX_ATTEMPTS = 5;

// A WORKOUT is given far more rope than a snapshot. A snapshot that cannot be
// sent is recomputed and re-queued by the next publish, so dropping one costs
// nothing. A workout is the thing the person actually did, and the only other
// copy is on their phone — so it keeps retrying for days rather than being
// dropped after five bad attempts in one dead zone.
const MAX_ATTEMPTS_WORKOUT = 50;

function maxAttemptsFor(kind) {
  return kind === KIND.WORKOUT ? MAX_ATTEMPTS_WORKOUT : MAX_ATTEMPTS;
}

// EXPONENTIAL BACKOFF, PERSISTED.
//
// `nextAttemptAt` lives on the queued record, not in a timer, so a phone that
// is killed and relaunched resumes the same schedule instead of hammering a
// server that has been rejecting it. Doubling from 5 seconds, capped at an hour,
// with jitter so a fleet of phones coming back onto wifi together does not
// arrive as one spike.
export const BACKOFF_BASE_MS = 5000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;

export function backoffMs(attempts, random = Math.random) {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  // ±20% jitter.
  return Math.round(exp * (0.8 + 0.4 * random()));
}

export async function enqueue(kind, payload, { id } = {}) {
  if (COLLAPSIBLE.has(kind)) await deleteOutboxByKind(kind);
  return putOutboxItem({
    // A caller-supplied id makes enqueueing idempotent: queueing the same
    // workout twice replaces the one record rather than adding a second.
    id: id || uid('ob'),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null
  });
}

// Queue one finished workout. Keyed by its client id, so this is safe to call
// again for a workout that is already queued — and safe to call on every
// launch for everything still unsynced.
export function enqueueWorkoutUpload(workout) {
  return enqueue(KIND.WORKOUT, serializeWorkout(workout), { id: `ob_wo_${workout.clientId || workout.id}` });
}

// The wire shape of a workout. Explicit rather than spreading the record, so a
// local-only field added later cannot start leaking to the server by accident.
export function serializeWorkout(w) {
  return {
    client_id: w.clientId || w.id,
    date: new Date(w.date).toISOString(),
    started_at: w.startTime ? new Date(w.startTime).toISOString() : null,
    ended_at: w.endTime ? new Date(w.endTime).toISOString() : null,
    split: w.split ?? null,
    name: w.name ?? null,
    notes: w.notes || '',
    payload: {
      exercises: w.exercises || [],
      skipped: w.skipped || [],
      sets: (w.sets || []).map((s) => ({
        id: s.id,
        exerciseId: s.exerciseId,
        type: s.type || 'working',
        weightKg: s.weightKg || 0,
        reps: s.reps || 0,
        order: s.order ?? 0,
        completed: !!s.completed,
        completedAt: s.completedAt ?? null
      }))
    }
  };
}

export async function pendingCount() {
  return (await getOutbox()).length;
}

// The queue as it stands. Exposed for the sync engine (which needs to know
// whether to arm a timer) and for Settings (which shows the pending count).
export function getOutboxSnapshot() {
  return getOutbox();
}

// Sends one item. Throws on a retryable failure; returns normally when the item
// is done with (succeeded, or failed in a way retrying cannot fix).
async function send(sb, item, userId) {
  switch (item.kind) {
    case KIND.STATS: {
      const { error } = await sb
        .from('profile_stats')
        .upsert({ user_id: userId, ...item.payload, updated_at: new Date().toISOString() });
      if (error) throw error;
      return;
    }

    case KIND.LIFTS: {
      const rows = item.payload.map((r) => ({
        user_id: userId,
        ...r,
        updated_at: new Date().toISOString()
      }));
      if (!rows.length) return;
      const { error } = await sb.from('user_lifts').upsert(rows, { onConflict: 'user_id,exercise_id' });
      if (error) throw error;
      return;
    }

    case KIND.WEEKLY: {
      // Two tables, one queued item, because a week's totals and its
      // per-exercise breakdown must never be half-published: a recap showing
      // last week's bench next to this week's volume would be wrong in a way
      // nobody could diagnose.
      const { weeks, exercises } = item.payload;
      const stamp = new Date().toISOString();

      const weekRows = (weeks || []).map((r) => ({ user_id: userId, ...r, updated_at: stamp }));
      if (weekRows.length) {
        const { error } = await sb
          .from('weekly_stats')
          .upsert(weekRows, { onConflict: 'user_id,week_start' });
        if (error) throw error;
      }

      const weekKeys = (weeks || []).map((r) => r.week_start);
      if (weekKeys.length) {
        // Deleting first is what makes this a true snapshot. Upserting alone
        // would leave a stale row behind for an exercise removed from a logged
        // workout, so last week's battle would keep showing a lift that no
        // longer exists in the user's history.
        const { error: delError } = await sb
          .from('weekly_exercise_stats')
          .delete()
          .eq('user_id', userId)
          .in('week_start', weekKeys);
        if (delError) throw delError;
      }

      const exRows = (exercises || []).map((r) => ({ user_id: userId, ...r, updated_at: stamp }));
      if (exRows.length) {
        const { error } = await sb
          .from('weekly_exercise_stats')
          .upsert(exRows, { onConflict: 'user_id,week_start,exercise_id' });
        if (error) throw error;
      }
      return;
    }

    case KIND.WORKOUT: {
      // UPSERT ON (user_id, client_id) — the whole reason the workout carries a
      // client-generated id. A request that timed out after the server had
      // already committed is retried onto the SAME row, so a flaky connection
      // can never turn one session into two.
      const { error } = await sb
        .from('workouts')
        .upsert({ user_id: userId, ...item.payload, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,client_id' });
      if (error) throw error;
      // Marked synced only now, after the server has it. The flag is the
      // server's receipt, not our intention.
      await setWorkoutSynced(item.payload.client_id, true);
      return;
    }

    case KIND.CHALLENGE_PROGRESS: {
      // Goes through a guarded function rather than a table write: the database
      // stamps the time, checks participation and rejects implausible or
      // backwards values. See migration 003.
      const { error } = await sb.rpc('report_challenge_progress', item.payload);
      if (error) throw error;
      return;
    }

    default:
      // Unknown kind from a future build that was rolled back — drop it rather
      // than retrying forever.
      return;
  }
}

let flushing = false;

// Drains the queue. Silent and safe to call often: offline, signed out or
// already running are all no-ops.
export async function flushOutbox(userId, { client, now = Date.now(), random = Math.random } = {}) {
  if (flushing || !userId || !isOnline()) return { sent: 0, failed: 0, deferred: 0, skipped: true };
  flushing = true;
  let sent = 0;
  let failed = 0;
  let deferred = 0;

  try {
    // `client` is an injection point for tests, which need to drive a failing
    // and then recovering server without a network.
    const sb = client || await getSupabase();
    if (!sb) return { sent: 0, failed: 0, deferred: 0, skipped: true };

    for (const item of await getOutbox()) {
      // Still inside its backoff window: skip it, do not count it as a failure,
      // and keep going — a snapshot that is cooling off must not hold up a
      // workout that is ready to go.
      if ((item.nextAttemptAt || 0) > now) { deferred++; continue; }

      // A queued workout whose local record has been deleted (the user removed
      // the session from History) has nothing left to upload.
      if (item.kind === KIND.WORKOUT && item.payload?.client_id) {
        const local = await getWorkout(item.payload.client_id);
        if (!local) { await deleteOutboxItem(item.id); continue; }
      }

      try {
        await send(sb, item, userId);
        await deleteOutboxItem(item.id);
        sent++;
      } catch (err) {
        const attempts = (item.attempts || 0) + 1;
        failed++;
        if (attempts >= maxAttemptsFor(item.kind)) {
          console.warn(`Dropping outbox item ${item.kind} after ${attempts} attempts:`, err);
          await deleteOutboxItem(item.id);
        } else {
          await putOutboxItem({
            ...item,
            attempts,
            nextAttemptAt: now + backoffMs(attempts, random),
            lastError: String(err?.message || err)
          });
        }
        // A failure is usually the connection dropping. Stop rather than
        // hammering the rest of the queue against the same dead network.
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed, deferred, skipped: false };
}

// When the earliest backoff window expires, or null when nothing is waiting.
// The sync engine uses this to arm one timer instead of polling.
export async function nextRetryAt() {
  const items = await getOutbox();
  if (!items.length) return null;
  return items.reduce((min, i) => Math.min(min, i.nextAttemptAt || 0), Infinity);
}
