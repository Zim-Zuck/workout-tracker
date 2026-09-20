// Your own cloud profile, plus the machinery that publishes local training
// summaries to it.
//
// Publishing is deliberately dumb: on every trigger we recompute the full
// summary from local history and upsert it. Snapshots are idempotent, so a
// missed publish self-heals on the next one and there is no incremental state
// to get out of sync. For data this small, simple beats clever.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMyProfile } from '../services/profileApi.js';
import { buildStatsSummary, buildLiftsSummary } from '../services/socialSummary.js';
import { enqueue, flushOutbox, pendingCount, KIND } from '../services/outbox.js';
import { isOnline } from '../services/supabase.js';
import { reportProgressForActiveChallenges } from '../services/challengesApi.js';

export function useProfile({ userId, signedIn, workouts }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  // true when signed in but no profile row exists yet — the username setup step.
  const [needsSetup, setNeedsSetup] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // Latest workouts without making every callback depend on the array identity.
  const workoutsRef = useRef(workouts);
  workoutsRef.current = workouts;

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  const loadProfile = useCallback(async () => {
    if (!signedIn || !userId) {
      setProfile(null);
      setNeedsSetup(false);
      return;
    }
    setLoading(true);
    try {
      const p = await fetchMyProfile(userId);
      setProfile(p);
      setNeedsSetup(!p);
    } catch (err) {
      // Never block the app on a profile read — the rest of the tracker works.
      console.warn('Profile load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [signedIn, userId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const sync = useCallback(async () => {
    if (!userId) return;
    const res = await flushOutbox(userId);
    await refreshPending();
    if (!res.skipped && res.sent > 0) setLastSyncAt(Date.now());

    // Push current bests into any live challenge, every time we sync.
    //
    // This cannot ride the outbox: reporting needs the list of active
    // challenges, which is a network read the device does not have offline.
    // Instead it self-heals — sync() runs on launch, on reconnect and after
    // every publish, and the server ignores anything that is not an
    // improvement, so a workout finished in a dead zone lands in the challenge
    // the moment the phone gets signal again.
    if (!res.skipped) {
      try {
        await reportProgressForActiveChallenges(buildLiftsSummary(workoutsRef.current || []));
      } catch { /* never block a sync on this */ }
    }
    return res;
  }, [userId, refreshPending]);

  // Queue a fresh snapshot of everything, then try to send. Called after a
  // workout finishes and after history is edited or imported.
  //
  // `justFinished` exists because finishWorkout() refreshes React state
  // asynchronously: at the moment this runs, the workout that triggered it may
  // not be in the list yet. Merging it in explicitly means the very first
  // publish after a session already includes that session, instead of the PR
  // you just hit showing up only after the next one.
  const publish = useCallback(async (justFinished) => {
    if (!userId) return null;
    const base = workoutsRef.current || [];
    const list = justFinished && !base.some((w) => w.id === justFinished.id)
      ? [...base, justFinished]
      : base;

    const lifts = buildLiftsSummary(list);
    await enqueue(KIND.STATS, buildStatsSummary(list));
    await enqueue(KIND.LIFTS, lifts);
    await refreshPending();
    await sync();
    // Handed back so the caller can report the same numbers into live
    // challenges without recomputing them from possibly-stale state.
    return lifts;
  }, [userId, sync, refreshPending]);

  // Flush on sign-in and whenever the connection comes back. Both are moments
  // when queued work from the gym can finally go out.
  useEffect(() => {
    if (!signedIn || !userId) return;
    sync();
    const onOnline = () => sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [signedIn, userId, sync]);

  useEffect(() => { refreshPending(); }, [refreshPending]);

  return {
    profile,
    setProfile,
    profileLoading: loading,
    needsSetup,
    reloadProfile: loadProfile,
    publish,
    sync,
    pendingSync: pending,
    lastSyncAt,
    online: isOnline()
  };
}
