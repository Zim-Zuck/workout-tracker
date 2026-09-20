// Friends: search, requests, list, and the friend-profile read.
//
// Every write goes through a database function rather than a table write, so the
// relational rules (who may accept, what a crossing request means) live in one
// audited place instead of being re-implemented here.
import { getSupabase, isOnline, friendlyError } from './supabase.js';
import { getCached, setCached } from '../db/database.js';

const FRIENDS_KEY = 'friends';
const NOTIFICATIONS_KEY = 'notifications';

async function rpc(name, args) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(friendlyError(error));
  return data;
}

export async function searchUsers(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  if (!isOnline()) throw new Error('Search needs a connection.');
  return (await rpc('search_users', { q })) || [];
}

export async function sendFriendRequest(targetId) {
  return rpc('send_friend_request', { target_id: targetId });
}

export async function respondToRequest(otherId, accept) {
  return rpc('respond_to_friend_request', { other_id: otherId, accept });
}

// Covers both "remove a friend" and "withdraw my pending request" — the row is
// the same either way, and RLS already restricts deletion to its two members.
export async function removeFriend(otherId, myId) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');
  const [low, high] = [myId, otherId].sort();
  const { error } = await sb
    .from('friendships')
    .delete()
    .eq('user_low', low)
    .eq('user_high', high);
  if (error) throw new Error(friendlyError(error));
}

// Returns { rows, cachedAt, stale }. Offline or on failure it serves the last
// good copy with a timestamp, so the Friends screen shows real names at the gym
// rather than an error.
export async function listFriendships() {
  if (!isOnline()) {
    const c = await getCached(FRIENDS_KEY);
    return { rows: c?.value || [], cachedAt: c?.cachedAt ?? null, stale: true };
  }
  try {
    const rows = (await rpc('list_friendships')) || [];
    await setCached(FRIENDS_KEY, rows);
    return { rows, cachedAt: Date.now(), stale: false };
  } catch (err) {
    const c = await getCached(FRIENDS_KEY);
    if (c) return { rows: c.value, cachedAt: c.cachedAt, stale: true, error: err.message };
    throw err;
  }
}

export async function getFriendProfile(targetId) {
  return rpc('get_friend_profile', { target_id: targetId });
}

// ---- Notifications ----

export async function listNotifications(limit = 30) {
  if (!isOnline()) {
    const c = await getCached(NOTIFICATIONS_KEY);
    return { rows: c?.value || [], stale: true };
  }
  const sb = await getSupabase();
  if (!sb) return { rows: [], stale: false };

  const { data, error } = await sb
    .from('notifications')
    .select('id, type, payload, read_at, created_at, actor_id')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    const c = await getCached(NOTIFICATIONS_KEY);
    return { rows: c?.value || [], stale: true, error: friendlyError(error) };
  }

  // Actor identities are fetched separately rather than embedded.
  // notifications.actor_id references auth.users (so that deleting an account
  // nulls it without erasing other people's history), NOT public.profiles —
  // there is no foreign key between those two tables for PostgREST to follow,
  // and asking it to embed one fails the whole query. One extra request against
  // a table every signed-in user may read is the cheaper fix by far.
  const rows = data || [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];

  let byId = new Map();
  if (actorIds.length) {
    const { data: actors } = await sb
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', actorIds);
    byId = new Map((actors || []).map((a) => [a.id, a]));
  }

  // A null actor is normal: system notifications have none, and so does an
  // actor who has since deleted their account.
  const withActors = rows.map((r) => ({ ...r, actor: r.actor_id ? byId.get(r.actor_id) || null : null }));

  await setCached(NOTIFICATIONS_KEY, withActors);
  return { rows: withActors, stale: false };
}

export async function markNotificationsRead(ids) {
  if (!ids?.length) return;
  const sb = await getSupabase();
  if (!sb) return;
  await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null);
}

export async function unreadCount() {
  if (!isOnline()) return 0;
  const sb = await getSupabase();
  if (!sb) return 0;
  const { count, error } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return error ? 0 : (count || 0);
}
