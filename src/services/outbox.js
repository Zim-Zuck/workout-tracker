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
  getOutbox, putOutboxItem, deleteOutboxItem, deleteOutboxByKind
} from '../db/database.js';
import { getSupabase, isOnline } from './supabase.js';
import { uid } from '../utils/id.js';

export const KIND = {
  STATS: 'stats',
  LIFTS: 'lifts',
  CHALLENGE_PROGRESS: 'challenge_progress'
};

// Kinds where only the newest queued item has any meaning.
const COLLAPSIBLE = new Set([KIND.STATS, KIND.LIFTS]);

// Give up after this many failures so a permanently-rejected item (say, one that
// violates a constraint) cannot block the queue forever.
const MAX_ATTEMPTS = 5;

export async function enqueue(kind, payload) {
  if (COLLAPSIBLE.has(kind)) await deleteOutboxByKind(kind);
  return putOutboxItem({
    id: uid('ob'),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null
  });
}

export async function pendingCount() {
  return (await getOutbox()).length;
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
export async function flushOutbox(userId) {
  if (flushing || !userId || !isOnline()) return { sent: 0, failed: 0, skipped: true };
  flushing = true;
  let sent = 0;
  let failed = 0;

  try {
    const sb = await getSupabase();
    if (!sb) return { sent: 0, failed: 0, skipped: true };

    for (const item of await getOutbox()) {
      try {
        await send(sb, item, userId);
        await deleteOutboxItem(item.id);
        sent++;
      } catch (err) {
        const attempts = (item.attempts || 0) + 1;
        failed++;
        if (attempts >= MAX_ATTEMPTS) {
          console.warn(`Dropping outbox item ${item.kind} after ${attempts} attempts:`, err);
          await deleteOutboxItem(item.id);
        } else {
          await putOutboxItem({ ...item, attempts, lastError: String(err?.message || err) });
        }
        // A failure is usually the connection dropping. Stop rather than
        // hammering the rest of the queue against the same dead network.
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed, skipped: false };
}
