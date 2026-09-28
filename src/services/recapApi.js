// Reads for the weekly friend recap.
//
// Same contract as the rest of the social layer: one RPC, cached locally, and
// degrading to the last good copy rather than an error when the phone has no
// signal. A stale recap is still a recap; a spinner at the gym is nothing.
import { getSupabase, isOnline, friendlyError } from './supabase.js';
import { getCached, setCached } from '../db/database.js';
import { currentWeekKey } from './weeklySummary.js';

const cacheKey = (week) => `recap:${week}`;
const SHOWN_KEY = 'recapShown';

// How many previous weeks' statistic picks are remembered, so the engine can
// avoid repeating itself. Two is enough to stop "Most Volume" three weeks
// running without freezing the rotation into a fixed cycle.
const SHOWN_HISTORY = 2;

// The circle's week, in one round trip. Returns { payload, cachedAt, stale }.
export async function fetchWeeklyRecap(week = currentWeekKey()) {
  const key = cacheKey(week);

  if (!isOnline()) {
    const c = await getCached(key);
    return { payload: c?.value ?? null, cachedAt: c?.cachedAt ?? null, stale: true };
  }

  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');

  try {
    const { data, error } = await sb.rpc('get_weekly_recap', { target_week: week });
    if (error) throw new Error(friendlyError(error));
    await setCached(key, data);
    return { payload: data, cachedAt: Date.now(), stale: false };
  } catch (err) {
    const c = await getCached(key);
    if (c?.value) return { payload: c.value, cachedAt: c.cachedAt, stale: true, error: err.message };
    throw err;
  }
}

// Which statistics recent weeks already used, newest first.
//
// Deliberately device-local. It is a presentation preference, not a fact about
// the group — it needs no table, no RLS and no sync, and being slightly
// different on a second device costs nothing.
export async function getRecentlyShown(currentWeek) {
  const c = await getCached(SHOWN_KEY);
  const byWeek = c?.value || {};
  return Object.keys(byWeek)
    .filter((w) => w !== currentWeek)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, SHOWN_HISTORY)
    .flatMap((w) => byWeek[w] || []);
}

export async function rememberShown(week, ids) {
  if (!week || !ids?.length) return;
  const c = await getCached(SHOWN_KEY);
  const byWeek = { ...(c?.value || {}), [week]: [...new Set(ids)] };
  // Keep only the weeks the lookup above can actually reach, plus the current
  // one, so this never grows without bound.
  const keep = Object.keys(byWeek).sort((a, b) => (a < b ? 1 : -1)).slice(0, SHOWN_HISTORY + 1);
  await setCached(SHOWN_KEY, Object.fromEntries(keep.map((w) => [w, byWeek[w]])));
}
