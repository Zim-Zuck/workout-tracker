// Challenges and the friends leaderboard.
//
// Every mutation is a database function, never a table write: the rules about
// who may accept, when the clock runs and what counts as an improvement are
// enforced server-side where a modified client cannot reach them.
import { getSupabase, isOnline, friendlyError } from './supabase.js';
import { getCached, setCached } from '../db/database.js';

const CHALLENGES_KEY = 'challenges';
const LEADERBOARD_KEY = 'leaderboard';

async function rpc(name, args) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(friendlyError(error));
  return data;
}

export async function createChallenge(targetUserId, exerciseId, days) {
  return rpc('create_challenge', { target_user: targetUserId, ex_id: exerciseId, days });
}

export async function respondToChallenge(challengeId, accept) {
  return rpc('respond_to_challenge', { challenge: challengeId, accept });
}

export async function resolveChallenge(challengeId) {
  return rpc('resolve_challenge', { challenge: challengeId });
}

export async function listChallenges() {
  if (!isOnline()) {
    const c = await getCached(CHALLENGES_KEY);
    return { rows: c?.value || [], stale: true };
  }
  try {
    const rows = (await rpc('list_challenges')) || [];
    await setCached(CHALLENGES_KEY, rows);
    return { rows, stale: false };
  } catch (err) {
    const c = await getCached(CHALLENGES_KEY);
    if (c) return { rows: c.value, stale: true, error: err.message };
    throw err;
  }
}

export async function fetchLeaderboard(metric = 'workouts') {
  const key = `${LEADERBOARD_KEY}:${metric}`;
  if (!isOnline()) {
    const c = await getCached(key);
    return { rows: c?.value || [], stale: true };
  }
  try {
    const rows = (await rpc('friends_leaderboard', { metric })) || [];
    await setCached(key, rows);
    return { rows, stale: false };
  } catch (err) {
    const c = await getCached(key);
    if (c) return { rows: c.value, stale: true, error: err.message };
    throw err;
  }
}

// After a workout, report the user's best effort in each ACTIVE challenge.
//
// Called with the freshly-built local lift summary. The database ignores
// anything that is not an improvement, so this is safe to call every time and
// there is no local bookkeeping about what has already been reported.
export async function reportProgressForActiveChallenges(lifts) {
  if (!isOnline() || !lifts?.length) return { reported: 0 };
  const byExercise = new Map(lifts.map((l) => [l.exercise_id, l]));

  let rows;
  try {
    rows = (await rpc('list_challenges')) || [];
  } catch {
    return { reported: 0 };
  }

  let reported = 0;
  for (const c of rows) {
    if (c.status !== 'active') continue;
    const lift = byExercise.get(c.exercise_id);
    if (!lift) continue;
    try {
      const res = await rpc('report_challenge_progress', {
        challenge: c.id,
        weight_kg: lift.top_weight_kg,
        reps: lift.top_weight_reps
      });
      if (res?.status === 'recorded') reported++;
    } catch {
      // One challenge failing must not stop the others.
    }
  }
  return { reported };
}

// Ask the server to settle any challenge whose window has closed. The outcome is
// computed from stored progress, so it does not matter which participant's app
// happens to trigger it.
export async function resolveFinishedChallenges(rows) {
  const due = (rows || []).filter(
    (c) => c.status === 'active' && c.ends_at && new Date(c.ends_at).getTime() < Date.now()
  );
  if (!due.length) return 0;
  let resolved = 0;
  for (const c of due) {
    try {
      const res = await resolveChallenge(c.id);
      if (res?.status === 'complete') resolved++;
    } catch { /* another client may have resolved it first */ }
  }
  return resolved;
}
