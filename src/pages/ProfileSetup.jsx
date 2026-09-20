import { useEffect, useRef, useState } from 'react';
import { AtSign, User, Check, X } from 'lucide-react';
import { validateUsername, isUsernameAvailable, normalizeUsername, createProfile } from '../services/profileApi.js';

// One-time step after signing up: claim a username and display name.
//
// The username is checked live because discovering it is taken only on submit
// is a miserable experience — people type their name, wait, then have to think
// again. The check is debounced and never blocks typing.
export default function ProfileSetup({ userId, onDone, defaultDisplayName = '' }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [status, setStatus] = useState({ state: 'idle' }); // idle|checking|free|taken|invalid
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const raw = username.trim();
    if (!raw) { setStatus({ state: 'idle' }); return; }

    const problem = validateUsername(raw);
    if (problem) { setStatus({ state: 'invalid', message: problem }); return; }

    setStatus({ state: 'checking' });
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(raw);
        // Ignore a response that arrived after the user kept typing.
        if (mine !== seq.current) return;
        setStatus(free ? { state: 'free' } : { state: 'taken', message: 'Already taken.' });
      } catch {
        if (mine !== seq.current) return;
        setStatus({ state: 'idle' });
      }
    }, 400);

    return () => clearTimeout(t);
  }, [username]);

  const canSubmit = status.state === 'free' && displayName.trim().length > 0 && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const p = await createProfile(userId, { username, displayName });
      onDone?.(p);
    } catch (err) {
      setError(err.message);
      setStatus({ state: 'taken', message: 'Already taken.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <div className="text-center mb-6 mt-2">
        <h1 className="text-xl font-bold">Pick your name</h1>
        <p className="text-sm text-muted mt-2 max-w-xs mx-auto">
          This is how friends find you and how you appear on leaderboards.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs text-muted mb-1.5 block px-1">Username</label>
          <div className={`flex items-center gap-2 px-3 rounded-xl bg-card border ${
            status.state === 'taken' || status.state === 'invalid' ? 'border-danger/60' :
            status.state === 'free' ? 'border-success/60' : 'border-border'
          }`}>
            <AtSign size={16} className="text-muted shrink-0" />
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="kunashe"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              aria-label="Username"
              className="w-full h-12 bg-transparent outline-none text-sm"
            />
            {status.state === 'checking' && (
              <span className="w-4 h-4 rounded-full border-2 border-muted border-t-transparent animate-spin shrink-0" />
            )}
            {status.state === 'free' && <Check size={16} className="text-success shrink-0" />}
            {(status.state === 'taken' || status.state === 'invalid') && <X size={16} className="text-danger shrink-0" />}
          </div>
          <p className={`text-xs mt-1.5 px-1 ${
            status.state === 'free' ? 'text-success' :
            status.state === 'taken' || status.state === 'invalid' ? 'text-danger' : 'text-muted'
          }`}>
            {status.state === 'free' ? `@${normalizeUsername(username)} is available` :
             status.message || 'Letters, numbers and underscores. 3–20 characters.'}
          </p>
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block px-1">Display name</label>
          <div className="flex items-center gap-2 px-3 rounded-xl bg-card border border-border focus-within:border-accent">
            <User size={16} className="text-muted shrink-0" />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Kunashe Makahamadze"
              maxLength={40}
              aria-label="Display name"
              className="w-full h-12 bg-transparent outline-none text-sm"
            />
          </div>
        </div>

        {error && <p role="alert" className="text-xs text-danger px-1">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-40 active:opacity-80 flex items-center justify-center gap-2"
        >
          {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Continue
        </button>

        <p className="text-[11px] text-muted text-center px-4 leading-relaxed">
          Your username is how people find you, so it is visible to anyone signed in.
          Your training numbers are only ever shown to friends you accept.
        </p>
      </form>
    </div>
  );
}
