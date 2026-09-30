// The community layer: feed, reactions, discovery-by-activity, the global board
// and the community week.
//
// Same contract as the rest of the social services (friendsApi, challengesApi,
// recapApi): every read goes through one RPC, is cached locally, and degrades to
// the last good copy rather than an error when the phone has no signal. A stale
// feed is still a feed; a spinner at the gym is nothing.
//
// Every write here is an RPC, never a table write. community_events and
// event_reactions have no insert policy at all (migrations 010 and 011), so
// there is no client-side path to forging activity even if this file were
// modified.
import { getSupabase, isOnline, friendlyError } from './supabase.js';
import { getCached, setCached } from '../db/database.js';

const FEED_KEY = 'communityFeed';
const WEEK_KEY = 'communityWeek';
const BOARD_KEY = 'communityBoard';

// Matches the server's own clamp in get_community_feed(). Kept in sync here so
// the first page and the cache entry are the same size.
export const PAGE_SIZE = 20;

async function rpc(name, args) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(friendlyError(error));
  return data;
}

// ---- Feed ----

// The first page, cached. Returns { events, nextCursor, stale, cachedAt }.
//
// Only page one is ever cached: it is what an offline launch needs to render,
// and caching deeper pages would mean reconstructing a scroll position from
// data that has since moved.
export async function fetchFeed(scope = 'global') {
  const key = `${FEED_KEY}:${scope}`;

  if (!isOnline()) {
    const c = await getCached(key);
    return {
      events: c?.value?.events || [],
      nextCursor: null,
      cachedAt: c?.cachedAt ?? null,
      stale: true
    };
  }

  try {
    const data = await rpc('get_community_feed', {
      scope,
      cursor_created_at: null,
      cursor_id: null,
      page_size: PAGE_SIZE
    });
    const payload = { events: data?.events || [], nextCursor: normalizeCursor(data?.next_cursor) };
    await setCached(key, payload);
    return { ...payload, cachedAt: Date.now(), stale: false };
  } catch (err) {
    const c = await getCached(key);
    if (c?.value) {
      return {
        events: c.value.events || [],
        nextCursor: null,
        cachedAt: c.cachedAt,
        stale: true,
        error: err.message
      };
    }
    throw err;
  }
}

// A subsequent page. Deliberately not cached and deliberately not retried from
// cache: if the connection dies mid-scroll the right answer is to stop, not to
// splice yesterday's rows onto today's.
export async function fetchFeedPage(scope, cursor) {
  if (!cursor) return { events: [], nextCursor: null };
  const data = await rpc('get_community_feed', {
    scope,
    cursor_created_at: cursor.createdAt,
    cursor_id: cursor.id,
    page_size: PAGE_SIZE
  });
  return { events: data?.events || [], nextCursor: normalizeCursor(data?.next_cursor) };
}

// The server returns { created_at, id } or JSON null. Normalised to camelCase or
// null so callers never have to know which shape they got.
function normalizeCursor(raw) {
  if (!raw || raw.created_at == null || raw.id == null) return null;
  return { createdAt: raw.created_at, id: Number(raw.id) };
}

// One person's recent activity, for their profile.
export async function fetchUserActivity(userId, limit = 10) {
  if (!isOnline()) return [];
  try {
    return (await rpc('get_user_activity', { target_id: userId, page_size: limit })) || [];
  } catch {
    // A profile that loads without its activity strip is still a useful profile.
    return [];
  }
}

// ---- Reactions ----
//
// Both calls are idempotent server-side: reacting twice does not double the
// count, and unreacting twice cannot push it below zero. That is what lets the
// UI update optimistically and simply re-read on failure.

export async function reactToEvent(eventId, kind = 'like') {
  return rpc('react_to_event', { event: eventId, kind });
}

export async function unreactFromEvent(eventId) {
  return rpc('unreact_from_event', { event: eventId });
}

// ---- Global leaderboard ----
//
// A separate RPC from friends_leaderboard rather than one function with a scope
// argument. The friends board is SECURITY INVOKER so that RLS filters out
// friends who turned stat sharing off (see migration 003); routing it through a
// SECURITY DEFINER wrapper would run it with elevated rights and silently undo
// that. Two calls, two security models, one switch in the UI.
export async function fetchGlobalLeaderboard(metric = 'workouts') {
  const key = `${BOARD_KEY}:${metric}`;
  if (!isOnline()) {
    const c = await getCached(key);
    return { rows: c?.value || [], stale: true };
  }
  try {
    const rows = (await rpc('global_leaderboard', { metric })) || [];
    await setCached(key, rows);
    return { rows, stale: false };
  } catch (err) {
    const c = await getCached(key);
    if (c) return { rows: c.value, stale: true, error: err.message };
    throw err;
  }
}

// ---- Community week ----

export async function fetchCommunityWeek(week) {
  const key = `${WEEK_KEY}:${week}`;
  if (!isOnline()) {
    const c = await getCached(key);
    return { payload: c?.value ?? null, cachedAt: c?.cachedAt ?? null, stale: true };
  }
  try {
    const payload = await rpc('get_community_week', { target_week: week });
    await setCached(key, payload);
    return { payload, cachedAt: Date.now(), stale: false };
  } catch (err) {
    const c = await getCached(key);
    if (c?.value) return { payload: c.value, cachedAt: c.cachedAt, stale: true, error: err.message };
    throw err;
  }
}
