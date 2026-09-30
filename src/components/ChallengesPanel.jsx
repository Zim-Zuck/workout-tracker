import { useCallback, useEffect, useMemo, useState } from 'react';
import { Swords, Trophy, Clock, Check, X, CloudOff, Plus, Search , BellRing } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import {
  listChallenges, respondToChallenge, createChallenge, resolveFinishedChallenges,
  withdrawChallenge, nudgeChallenge, ServerFeatureMissing
} from '../services/challengesApi.js';
import { listFriendships, searchUsers } from '../services/friendsApi.js';
import { buildLiftsSummary } from '../services/socialSummary.js';
import { formatWeight } from '../utils/units.js';

// Beat My PR — the one competitive mechanic in V1.
//
// A challenge freezes the challenger's current best as a target, and both sides
// then have N days to beat it. The target cannot move, and progress is stamped
// server-side, so "I hit it before the clock started" is not available.
//
// Anyone on Kun can be challenged, friend or not (migration 014). The server
// enforces the rest: you cannot challenge yourself, cannot start two live
// challenges with the same person on the same lift, and cannot fire off more
// than a handful a day.
export default function ChallengesPanel({
  myId, exercises, workouts, refreshToken, onChanged, presetOpponent, onPresetUsed
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null);
  const toast = useToast();

  const exNames = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listChallenges();
      setRows(res.rows);
      setStale(!!res.stale);
      // Settle anything whose window has closed, then show the result.
      if (!res.stale && await resolveFinishedChallenges(res.rows)) {
        const again = await listChallenges();
        setRows(again.rows);
        onChanged?.();
      }
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast, onChanged]);

  useEffect(() => { load(); }, [load, refreshToken]);

  // Opening a challenge straight from a friend's profile.
  useEffect(() => {
    if (presetOpponent) setCreating(true);
  }, [presetOpponent]);

  const respond = async (id, accept) => {
    try {
      await respondToChallenge(id, accept);
      toast(accept ? 'Challenge accepted — clock started' : 'Challenge declined',
        { tone: accept ? 'success' : undefined });
      await load();
      onChanged?.();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  // Withdrawing removes the challenge from the other person's inbox, so it is
  // undoable the only way it can be: it isn't. It IS, however, the one
  // destructive action here that costs somebody else nothing — the challenge
  // was never accepted — so it needs no ceremony either.
  const withdraw = async (id, who) => {
    setBusy(id);
    try {
      await withdrawChallenge(id);
      toast(`Challenge to ${who} withdrawn`);
      await load();
      onChanged?.();
    } catch (err) {
      toast(err.message, { tone: 'error', duration: err instanceof ServerFeatureMissing ? 5000 : 2200 });
    } finally {
      setBusy(null);
    }
  };

  const sendNudge = async (id) => {
    setBusy(id);
    try {
      await nudgeChallenge(id);
      toast('Nudged', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error', duration: err instanceof ServerFeatureMissing ? 5000 : 2200 });
    } finally {
      setBusy(null);
    }
  };

  const incoming = rows.filter((c) => c.status === 'pending' && !c.i_created);
  const active = rows.filter((c) => c.status === 'active');
  const sent = rows.filter((c) => c.status === 'pending' && c.i_created);
  const done = rows.filter((c) => c.status === 'complete');

  return (
    <div className="space-y-3">
      <button
        onClick={() => setCreating(true)}
        className="w-full h-tap rounded-row bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 active:opacity-80"
      >
        <Plus size={16} /> New challenge
      </button>

      {stale && (
        <p className="text-micro tracking-normal text-ink-secondary flex items-center gap-1.5 px-1">
          <CloudOff size={12} /> Showing saved challenges — you are offline.
        </p>
      )}

      {loading && rows.length === 0 && (
        <div className="flex justify-center py-10">
          <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-glass border border-glass-border rounded-card p-6 text-center">
          <Swords size={26} className="text-ink-tertiary mx-auto mb-2" />
          <p className="text-label font-semibold">No challenges yet</p>
          <p className="text-label text-ink-tertiary mt-1 leading-relaxed">
            Pick a lift, pick anyone on Kun, and they get your current PR as a target to beat.
          </p>
        </div>
      )}

      {incoming.map((c) => (
        <Card key={c.id} c={c} exNames={exNames} accent>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => respond(c.id, true)}
              className="flex-1 h-10 rounded-row bg-done text-on-primary font-semibold text-label flex items-center justify-center gap-1.5 active:opacity-80"
            >
              <Check size={15} /> Accept
            </button>
            <button
              onClick={() => respond(c.id, false)}
              className="flex-1 h-10 rounded-row border border-glass-border text-ink-tertiary text-label flex items-center justify-center gap-1.5 active:bg-glass-inset"
            >
              <X size={15} /> Decline
            </button>
          </div>
        </Card>
      ))}

      {active.map((c) => <Card key={c.id} c={c} exNames={exNames} myId={myId} />)}

      {/* A challenge you sent that nobody has answered. Until now the only
          thing you could do with one was look at it. */}
      {sent.map((c) => (
        <Card key={c.id} c={c} exNames={exNames}>
          <div className="flex gap-sm mt-md">
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => sendNudge(c.id)}
              className="flex-1 h-tap rounded-full border border-glass-border text-ink text-label
                         font-semibold flex items-center justify-center gap-xs
                         transition-colors duration-fast ease-out active:bg-glass-pressed disabled:opacity-40"
            >
              <BellRing size={15} strokeWidth={2.2} /> Nudge
            </button>
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => withdraw(c.id, c.other_display_name)}
              className="flex-1 h-tap rounded-full border border-danger-border bg-danger-soft text-danger
                         text-label font-semibold flex items-center justify-center gap-xs
                         transition-colors duration-fast ease-out disabled:opacity-40"
            >
              <X size={15} strokeWidth={2.2} /> Cancel
            </button>
          </div>
        </Card>
      ))}
      {done.map((c) => <Card key={c.id} c={c} exNames={exNames} myId={myId} />)}

      <NewChallengeModal
        open={creating}
        onClose={() => { setCreating(false); onPresetUsed?.(); }}
        workouts={workouts}
        exercises={exercises}
        presetOpponent={presetOpponent}
        onCreated={async () => {
          setCreating(false);
          onPresetUsed?.();
          await load();
          onChanged?.();
        }}
      />
    </div>
  );
}

function Card({ c, exNames, myId, accent, children }) {
  const name = exNames.get(c.exercise_id) || c.exercise_id;
  const bodyweight = Number(c.target_weight_kg) === 0;
  const fmt = (w, r) => (bodyweight ? `${r} reps` : `${formatWeight(Number(w))} × ${r}`);

  const mine = fmt(c.my_best_weight_kg, c.my_best_reps);
  const theirs = fmt(c.their_best_weight_kg, c.their_best_reps);
  const hasMine = Number(c.my_best_weight_kg) > 0 || c.my_best_reps > 0;
  const hasTheirs = Number(c.their_best_weight_kg) > 0 || c.their_best_reps > 0;

  return (
    <section className={`bg-glass border rounded-card p-3 ${accent ? 'border-focus/50' : 'border-glass-border'}`}>
      <div className="flex items-center gap-2.5">
        <Avatar profile={{ display_name: c.other_display_name, username: c.other_username, avatar_url: c.other_avatar_url }} size={34} />
        <div className="flex-1 min-w-0">
          <h3 className="text-label font-semibold truncate">{name}</h3>
          <p className="text-micro tracking-normal text-ink-tertiary truncate">
            {c.i_created ? 'You challenged' : 'Challenged by'} {c.other_display_name}
          </p>
        </div>
        <StatusPill c={c} myId={myId} />
      </div>

      <div className="mt-3 rounded-row bg-glass-inset border border-glass-border p-2.5 text-center">
        <p className="text-micro tracking-normal tracking-wider text-ink-tertiary font-semibold">TARGET TO BEAT</p>
        <p className="text-body font-semibold tabular-nums mt-0.5">
          {fmt(c.target_weight_kg, c.target_reps)}
        </p>
      </div>

      {c.status !== 'pending' && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Score label="You" value={hasMine ? mine : '—'} />
          <Score label={c.other_display_name.split(' ')[0]} value={hasTheirs ? theirs : '—'} />
        </div>
      )}

      {c.status === 'active' && c.ends_at && (
        <p className="text-micro tracking-normal text-ink-tertiary text-center mt-2 flex items-center justify-center gap-1">
          <Clock size={12} /> {timeLeft(c.ends_at)}
        </p>
      )}

      {children}
    </section>
  );
}

function Score({ label, value }) {
  return (
    <div className="rounded-row border border-glass-border p-2 text-center">
      <p className="text-micro tracking-normal text-ink-tertiary truncate">{label}</p>
      <p className="text-label font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function StatusPill({ c, myId }) {
  if (c.status === 'pending') {
    return <span className="text-micro tracking-normal text-ink-tertiary flex items-center gap-1 shrink-0"><Clock size={12} /> Pending</span>;
  }
  if (c.status === 'active') {
    return <span className="text-micro tracking-normal text-ink font-semibold shrink-0">Live</span>;
  }
  if (c.status === 'complete') {
    if (!c.winner_id) return <span className="text-micro tracking-normal text-ink-tertiary shrink-0">Draw</span>;
    const won = c.winner_id === myId;
    return (
      <span className={`text-micro tracking-normal font-semibold flex items-center gap-1 shrink-0 ${won ? 'text-ink-secondary' : 'text-ink-tertiary'}`}>
        <Trophy size={12} /> {won ? 'Won' : 'Lost'}
      </span>
    );
  }
  return null;
}

function timeLeft(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Finished — settling';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.max(1, Math.floor(ms / 3600000));
  return `${hours} hour${hours === 1 ? '' : 's'} left`;
}

// Creating a challenge: pick anyone, pick a lift you have actually logged, and a
// duration. Only lifts with a local PR are offered — the server refuses the rest
// anyway, and offering them would be a trap.
//
// Opponents are found by username search rather than chosen from a friend list.
// Friends still appear as one-tap chips when there are any, because challenging
// someone you train with is common and should not require typing their name —
// but they are a shortcut now, not the only way in.
function NewChallengeModal({ open, onClose, workouts, exercises, onCreated, presetOpponent }) {
  const [friends, setFriends] = useState([]);
  const [opponent, setOpponent] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [exerciseId, setExerciseId] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  const myLifts = useMemo(() => buildLiftsSummary(workouts), [workouts]);
  const exNames = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setQuery('');
    setResults([]);
    setOpponent(presetOpponent ? toOpponent(presetOpponent) : null);
    // Friends are a convenience here, never a requirement: a failure to load
    // them must not stop anyone challenging a stranger.
    listFriendships()
      .then((res) => setFriends(res.rows.filter((r) => r.direction === 'friend').map(toOpponent)))
      .catch(() => setFriends([]));
  }, [open, presetOpponent]);

  // Debounced so typing a username is not one request per keystroke. Matches the
  // server's own two-character minimum.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchUsers(q);
        if (!cancelled) setResults(rows.filter((r) => r.relationship !== 'self').map(toOpponent));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const target = myLifts.find((l) => l.exercise_id === exerciseId);

  const submit = async () => {
    if (!opponent || !exerciseId) return;
    setBusy(true);
    setError(null);
    try {
      await createChallenge(opponent.id, exerciseId, days);
      toast(`Challenge sent to ${opponent.display_name}`, { tone: 'success' });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const shown = query.trim().length >= 2 ? results : friends;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Beat my PR"
      footer={
        <button
          onClick={submit}
          disabled={!opponent || !exerciseId || busy}
          className="w-full h-tap rounded-row bg-primary text-on-primary font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Send challenge
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-label text-ink-tertiary mb-1.5 block">Who</label>

          {opponent ? (
            <div className="flex items-center gap-2.5 h-tap px-3 rounded-row border border-focus bg-glass">
              <Avatar profile={opponent} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-label font-semibold truncate">{opponent.display_name}</div>
                <div className="text-micro tracking-normal text-ink-tertiary truncate">@{opponent.username}</div>
              </div>
              <button
                onClick={() => setOpponent(null)}
                aria-label="Choose someone else"
                className="text-label text-ink-tertiary px-2 h-8 active:text-ink shrink-0"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search anyone by username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Search for someone to challenge"
                  className="w-full h-tap pl-9 pr-3 rounded-row bg-glass-inset border border-glass-border outline-none focus:border-focus text-label"
                />
              </div>

              {query.trim().length < 2 && friends.length > 0 && (
                <p className="text-micro tracking-normal text-ink-tertiary mt-2">Your friends</p>
              )}

              {searching && (
                <p className="text-label text-ink-tertiary py-3 text-center">Searching…</p>
              )}

              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-label text-ink-tertiary py-3 text-center">
                  No one with that username.
                </p>
              )}

              {shown.length > 0 && (
                <ul className="mt-1.5 divide-y divide-hairline max-h-56 overflow-y-auto">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => setOpponent(p)}
                        className="w-full py-2.5 flex items-center gap-2.5 text-left active:opacity-70"
                      >
                        <Avatar profile={p} size={30} />
                        <div className="flex-1 min-w-0">
                          <div className="text-label font-semibold truncate">{p.display_name}</div>
                          <div className="text-micro tracking-normal text-ink-tertiary truncate">@{p.username}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {query.trim().length < 2 && friends.length === 0 && (
                <p className="text-label text-ink-tertiary py-3 leading-relaxed">
                  Type at least 2 characters of someone's username. You do not have to be
                  friends to challenge them.
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <label className="text-label text-ink-tertiary mb-1.5 block">Which lift</label>
          {myLifts.length === 0 ? (
            <p className="text-label text-ink-tertiary py-2">
              Log some working sets on a built-in exercise first — a challenge needs a PR to beat.
            </p>
          ) : (
            <select
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
              className="w-full h-tap px-3 rounded-row bg-glass-inset border border-glass-border text-label outline-none focus:border-focus"
            >
              <option value="">Choose a lift…</option>
              {myLifts.map((l) => (
                <option key={l.exercise_id} value={l.exercise_id}>
                  {exNames.get(l.exercise_id) || l.exercise_id}
                </option>
              ))}
            </select>
          )}
        </div>

        {target && (
          <div className="rounded-row bg-glass-inset border border-glass-border p-3 text-center">
            <p className="text-micro tracking-normal tracking-wider text-ink-tertiary font-semibold">THEY HAVE TO BEAT</p>
            <p className="text-title font-semibold tabular-nums mt-1">
              {Number(target.top_weight_kg) > 0
                ? `${formatWeight(target.top_weight_kg)} × ${target.top_weight_reps}`
                : `${target.top_weight_reps} reps`}
            </p>
            <p className="text-micro tracking-normal text-ink-tertiary mt-1">Your current best. It is locked in when you send this.</p>
          </div>
        )}

        <div>
          <label className="text-label text-ink-tertiary mb-1.5 block">How long</label>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`flex-1 h-10 rounded-row border text-label font-semibold ${
                  days === d ? 'border-focus bg-glass text-ink' : 'border-glass-border text-ink-tertiary'
                }`}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="text-label text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

// Three sources of people reach this modal with three different shapes: a
// friendship row keys the other person as `other_id`, a search hit and a profile
// both use `id`. Normalised once here so everything below can stop caring.
function toOpponent(p) {
  return {
    id: p.id || p.other_id,
    username: p.username,
    display_name: p.display_name,
    avatar_url: p.avatar_url
  };
}
