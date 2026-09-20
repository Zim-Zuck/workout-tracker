// Supabase client — the app's ONLY external backend.
//
// Two rules this module exists to enforce:
//   1. The app must boot and run fully without these env vars being set. A user who
//      never signs in, or a build with no Supabase config, gets the original
//      offline-first tracker with the social layer quietly absent.
//   2. The client is created lazily on first use, so the auth/realtime bundle is
//      never parsed for a logged-out user on a slow phone.
//
// Only the anon key is ever present here. It is designed to be public; row-level
// security in Postgres is what actually protects data. The service_role key must
// never appear in this repo.

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Whether a cloud backend is configured at all. Screens check this to decide
// between "sign in" and hiding social affordances entirely.
export const CLOUD_CONFIGURED = Boolean(URL && ANON_KEY);

let _clientPromise = null;

// Returns the shared SupabaseClient, or null when the app is built without cloud
// config. Callers must handle null rather than assuming a client exists.
export async function getSupabase() {
  if (!CLOUD_CONFIGURED) return null;
  if (!_clientPromise) {
    _clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(URL, ANON_KEY, {
        auth: {
          // Session lives in localStorage and is refreshed in the background, so a
          // returning user is already signed in on launch.
          persistSession: true,
          autoRefreshToken: true,
          // No OAuth redirects in V1 (email + password only), so there is never a
          // session to recover from the URL fragment.
          detectSessionInUrl: false
        },
        // No realtime subscriptions in V1 — polling on screen focus is cheaper on
        // battery and mobile data than holding a websocket open at the gym.
        realtime: { params: { eventsPerSecond: 1 } },
        global: { headers: { 'x-client-info': 'kun-workouts' } }
      })
    );
  }
  return _clientPromise;
}

// True when the browser believes it has a connection. Never treat this as a
// guarantee — a request can still fail — but it lets us skip doomed round-trips.
export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

// Normalizes the assorted shapes of failure (network error, PostgREST error,
// auth error) into a short sentence we can put in a toast.
export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  const msg = String(err.message || err);
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) {
    return 'No connection. This will sync when you are back online.';
  }
  if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(msg)) return 'Check your email to confirm your account first.';
  if (/User already registered/i.test(msg)) return 'That email already has an account. Try signing in.';
  if (/duplicate key|already exists|unique constraint/i.test(msg)) return 'That is already taken.';
  if (/JWT|session|token/i.test(msg)) return 'Your session expired. Sign in again.';
  if (/row-level security|permission denied|policy/i.test(msg)) return 'You do not have access to that.';
  return msg.length > 120 ? 'Something went wrong. Try again.' : msg;
}
