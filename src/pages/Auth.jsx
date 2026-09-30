import { useState } from 'react';
import { Mail, Lock, ArrowLeft, WifiOff, CheckCircle2 } from 'lucide-react';
import { isOnline } from '../services/supabase.js';

// Email + password sign in / sign up.
//
// The framing matters here: an account is optional and adds social features to a
// tracker that already works. The copy says so, and there is always a way back
// to the app without signing in.
export default function AuthScreen({ auth, onBack, onSignedIn, initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentConfirmation, setSentConfirmation] = useState(false);

  const online = isOnline();
  const isSignUp = mode === 'signup';
  const canSubmit = email.includes('@') && password.length >= 6 && !busy && online;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (isSignUp) {
        const { needsConfirmation } = await auth.signUp(email, password);
        if (needsConfirmation) {
          setSentConfirmation(true);
          return;
        }
      } else {
        await auth.signIn(email, password);
      }
      onSignedIn?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sentConfirmation) {
    return (
      <div className="p-4">
        <BackButton onBack={onBack} />
        <div className="flex flex-col items-center text-center pt-12">
          <CheckCircle2 size={40} className="text-done mb-4" />
          <h1 className="text-title font-semibold">Check your email</h1>
          <p className="text-label text-ink-tertiary mt-2 max-w-xs">
            We sent a confirmation link to <span className="text-ink">{email}</span>. Open it,
            then come back and sign in.
          </p>
          <button
            onClick={() => { setSentConfirmation(false); setMode('signin'); }}
            className="mt-6 h-tap px-6 rounded-row border border-glass-border font-semibold active:bg-glass-inset"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <BackButton onBack={onBack} />

      <div className="text-center mb-6 mt-4">
        <div className="text-micro tracking-normal tracking-[0.2em] font-semibold text-ink-tertiary mb-1">KUN WORKOUTS</div>
        <h1 className="text-title font-semibold">{isSignUp ? 'Create an account' : 'Welcome back'}</h1>
        <p className="text-label text-ink-tertiary mt-2 max-w-xs mx-auto">
          {isSignUp
            ? 'An account adds friends, challenges and backup. Your workouts stay on this device either way.'
            : 'Sign in to reach your friends, challenges and backup.'}
        </p>
      </div>

      {!online && (
        <div className="mb-4 rounded-row border border-glass-border bg-glass-inset p-3 flex items-start gap-2">
          <WifiOff size={16} className="text-ink-secondary mt-0.5 shrink-0" />
          <p className="text-label text-ink-secondary">
            You are offline. Signing in needs a connection — but you can keep logging workouts without one.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <Field icon={Mail}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            className="w-full h-tap bg-transparent outline-none text-label"
          />
        </Field>

        <Field icon={Lock}>
          <input
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="w-full h-tap bg-transparent outline-none text-label"
          />
        </Field>

        {isSignUp && (
          <p className="text-label text-ink-tertiary px-1">At least 6 characters.</p>
        )}

        {error && (
          <p role="alert" className="text-label text-danger px-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-tap rounded-row bg-primary text-on-primary font-semibold disabled:opacity-40 active:opacity-80 flex items-center justify-center gap-2"
        >
          {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          {isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        onClick={() => { setMode(isSignUp ? 'signin' : 'signup'); setError(null); }}
        className="w-full mt-4 h-tap text-label text-ink-tertiary active:text-ink"
      >
        {isSignUp ? 'Already have an account? Sign in' : "No account yet? Create one"}
      </button>

      <p className="text-micro tracking-normal text-ink-tertiary text-center mt-6 px-4 leading-relaxed">
        Your sets, reps and workout history never leave this device. Only your profile,
        top lifts and totals are shared — with friends you accept.
      </p>
    </div>
  );
}

function BackButton({ onBack }) {
  return (
    <button
      onClick={onBack}
      className="h-tap -ml-2 px-2 text-label text-ink-tertiary flex items-center gap-1 active:text-ink"
    >
      <ArrowLeft size={18} /> Back
    </button>
  );
}

function Field({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 px-3 rounded-row bg-glass-inset border border-glass-border focus-within:border-focus">
      <Icon size={16} className="text-ink-tertiary shrink-0" />
      {children}
    </div>
  );
}
