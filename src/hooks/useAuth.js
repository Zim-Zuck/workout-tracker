// Session state for the optional cloud account.
//
// Design constraint: this hook must resolve quickly and never block the workout
// UI. `ready` flips true as soon as we know whether a session exists — including
// immediately, when the app is built without Supabase config. A signed-out user
// and a user with no internet reach exactly the same state: session === null.
import { useCallback, useEffect, useState } from 'react';
import { getSupabase, CLOUD_CONFIGURED, friendlyError } from '../services/supabase.js';
import { clearSocialCache, clearOutbox } from '../db/database.js';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!CLOUD_CONFIGURED);

  useEffect(() => {
    if (!CLOUD_CONFIGURED) return;
    let cancelled = false;
    let unsubscribe = null;

    (async () => {
      try {
        const sb = await getSupabase();
        if (!sb || cancelled) return;
        // Reads the persisted session from localStorage; does not require network.
        const { data } = await sb.auth.getSession();
        if (cancelled) return;
        setSession(data?.session ?? null);

        const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
          setSession(next ?? null);
        });
        unsubscribe = () => sub?.subscription?.unsubscribe();
      } catch (err) {
        // A broken or unreachable backend must never prevent the app from
        // starting — fall through to the signed-out state.
        console.warn('Auth init failed, continuing signed out:', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  const signUp = useCallback(async (email, password) => {
    const sb = await getSupabase();
    if (!sb) throw new Error('Cloud features are not configured in this build.');
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(friendlyError(error));
    // With "Confirm email" enabled in Supabase, signUp returns a user but no
    // session — the caller shows a "check your email" state rather than
    // assuming it is signed in.
    return { needsConfirmation: !data.session, session: data.session ?? null };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const sb = await getSupabase();
    if (!sb) throw new Error('Cloud features are not configured in this build.');
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendlyError(error));
  }, []);

  const signOut = useCallback(async () => {
    const sb = await getSupabase();
    // Local cloud state goes first: if the network call fails we still want this
    // device to stop showing the previous account's friends and stats.
    await clearSocialCache();
    await clearOutbox();
    setSession(null);
    if (sb) await sb.auth.signOut().catch(() => {});
  }, []);

  return {
    session,
    user: session?.user ?? null,
    userId: session?.user?.id ?? null,
    signedIn: !!session,
    authReady: ready,
    cloudConfigured: CLOUD_CONFIGURED,
    signUp,
    signIn,
    signOut
  };
}
