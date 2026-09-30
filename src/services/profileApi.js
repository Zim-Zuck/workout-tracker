// Reads and writes for profile identity.
//
// Every function here degrades to cached data or null rather than throwing on a
// dead network — social screens show stale data with a timestamp instead of an
// error, because stale friend stats are far more useful than a spinner.
import { getSupabase, isOnline, friendlyError } from './supabase.js';
import { getCached, setCached } from '../db/database.js';

const MY_PROFILE_KEY = 'myProfile';

export function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function validateUsername(raw) {
  const u = normalizeUsername(raw);
  if (u.length < 3) return 'Usernames are at least 3 characters.';
  if (u.length > 20) return 'Usernames are at most 20 characters.';
  if (!/^[a-z0-9_]+$/.test(u)) return 'Letters, numbers and underscores only.';
  return null;
}

export async function isUsernameAvailable(raw) {
  const sb = await getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc('username_available', { candidate: normalizeUsername(raw) });
  if (error) throw new Error(friendlyError(error));
  return data === true;
}

// Your own profile. Falls back to the cached copy when offline so the header
// avatar and profile screen still render at the gym.
export async function fetchMyProfile(userId) {
  if (!userId) return null;

  if (!isOnline()) {
    const cached = await getCached(MY_PROFILE_KEY);
    return cached?.value ?? null;
  }

  const sb = await getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, share_stats, share_activity, community_notice_pending, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    const cached = await getCached(MY_PROFILE_KEY);
    if (cached?.value) return cached.value;
    throw new Error(friendlyError(error));
  }

  // null is a real answer here: a signed-in user who has not claimed a username
  // yet. The caller shows the setup screen rather than treating it as an error.
  if (data) await setCached(MY_PROFILE_KEY, data);
  return data ?? null;
}

// First-run profile creation. The row id must equal auth.uid() — RLS enforces
// that, so a crafted request cannot create a profile for someone else.
export async function createProfile(userId, { username, displayName }) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');

  const row = {
    id: userId,
    username: normalizeUsername(username),
    display_name: String(displayName || '').trim().slice(0, 40)
  };

  const { data, error } = await sb.from('profiles').insert(row).select().single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message || '')) {
      throw new Error('That username is already taken.');
    }
    throw new Error(friendlyError(error));
  }
  await setCached(MY_PROFILE_KEY, data);
  return data;
}

export async function updateProfile(userId, patch) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');

  const allowed = {};
  if (patch.display_name !== undefined) allowed.display_name = String(patch.display_name).trim().slice(0, 40);
  if (patch.bio !== undefined) allowed.bio = String(patch.bio || '').trim().slice(0, 160) || null;
  if (patch.avatar_url !== undefined) allowed.avatar_url = patch.avatar_url || null;
  if (patch.share_stats !== undefined) allowed.share_stats = !!patch.share_stats;
  // The second, separate switch (migration 009). Kept distinct from share_stats
  // on purpose: one governs what accepted friends see of your numbers, the other
  // whether the rest of Kun sees that you are training. Merging them here would
  // undo in one line the distinction the whole migration exists to draw.
  if (patch.share_activity !== undefined) allowed.share_activity = !!patch.share_activity;
  // Cleared, never set, by the client: it is raised once by migration 009 for
  // accounts that predate community sharing, and lowered the moment that person
  // has seen what changed.
  if (patch.community_notice_pending === false) allowed.community_notice_pending = false;
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('profiles')
    .update(allowed)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(friendlyError(error));
  await setCached(MY_PROFILE_KEY, data);
  return data;
}

// Your own stats as the server has them — used to show what friends would see,
// and to confirm a publish actually landed.
export async function fetchStats(userId) {
  const sb = await getSupabase();
  if (!sb || !isOnline()) return null;
  const { data, error } = await sb
    .from('profile_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function fetchLifts(userId) {
  const sb = await getSupabase();
  if (!sb || !isOnline()) return [];
  const { data, error } = await sb
    .from('user_lifts')
    .select('exercise_id, top_weight_kg, top_weight_reps, best_e1rm_kg, achieved_at')
    .eq('user_id', userId);
  if (error) return [];
  return data || [];
}

// Two steps, in this order deliberately.
//
// Supabase forbids deleting storage.objects rows from SQL, so the user's files
// cannot be removed by the database function — they have to go through the
// Storage API as the user. Files are deleted FIRST: if that fails we abort and
// the account survives, because leaving someone's training data in a bucket
// after they asked to be deleted is worse than a deletion they can retry.
//
// Both buckets are handled here, not in SQL. Migration 004 tried the SQL route
// and broke deletion outright; 005 fixed it by moving the work here; 007 added
// avatars and reinstated the same broken SQL, breaking deletion a second time
// for everything after it. 016 removes it again. If a third bucket is ever
// added, it gets cleaned up in this function — not in the database.
const DELETABLE_FILES = [
  { bucket: 'backups', path: (id) => `${id}/latest.json`, label: 'cloud backup' },
  { bucket: 'avatars', path: (id) => `${id}/avatar.jpg`, label: 'profile picture' }
];

export async function deleteMyAccount(userId) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');

  if (userId) {
    for (const f of DELETABLE_FILES) {
      const { error: storageError } = await sb.storage.from(f.bucket).remove([f.path(userId)]);
      // A missing file is success, not failure — plenty of users never back up
      // and plenty never set a picture.
      if (storageError && !/not found|does not exist/i.test(storageError.message || '')) {
        throw new Error(`Could not remove your ${f.label}, so your account was not deleted. ${friendlyError(storageError)}`);
      }
    }
  }

  const { error } = await sb.rpc('delete_my_account');
  if (error) throw new Error(friendlyError(error));
}
