import { useCallback, useEffect, useMemo, useState } from 'react';
import { Swords, Trophy, Clock, Check, X, CloudOff, Plus } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import {
  listChallenges, respondToChallenge, createChallenge, resolveFinishedChallenges
} from '../services/challengesApi.js';
import { listFriendships } from '../services/friendsApi.js';
import { buildLiftsSummary } from '../services/socialSummary.js';
import { formatWeight } from '../utils/units.js';

// Beat My PR — the one competitive mechanic in V1.
//
// A challenge freezes the challenger's current best as a target, and both sides
// then have N days to beat it. The target cannot move, and progress is stamped
// server-side, so "I hit it before the clock started" is not available.
export default function ChallengesPanel({
  myId, exercises, workouts, settings, refreshToken, onChanged, presetOpponent, onPresetUsed
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const unit = settings.unit;

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

  const incoming = rows.filter((c) => c.status === 'pending' && !c.i_created);
  const active = rows.filter((c) => c.status === 'active');
  const sent = rows.filter((c) => c.status === 'pending' && c.i_created);
  const done = rows.filter((c) => c.status === 'complete');

  return (
    <div className="space-y-3">
      <button
        onClick={() => setCreating(true)}
        className="w-full h-11 rounded-xl bg-accent text-white font-semibold flex items-center justify-center gap-2 active:opacity-80"
      >
        <Plus size={16} /> New challenge
      </button>

      {stale && (
        <p className="text-[11px] text-warn flex items-center gap-1.5 px-1">
          <CloudOff size={12} /> Showing saved challenges — you are offline.
        </p>
      )}

      {loading && rows.length === 0 && (
        <div className="flex justify-center py-10">
          <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <Swords size={26} className="text-muted mx-auto mb-2" />
          <p className="text-sm font-medium">No challenges yet</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Pick a lift, and a friend gets your current PR as a target to beat.
          </p>
        </div>
      )}

      {incoming.map((c) => (
        <Card key={c.id} c={c} exNames={exNames} unit={unit} accent>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => respond(c.id, true)}
              className="flex-1 h-10 rounded-xl bg-success text-white font-semibold text-sm flex items-center justify-center gap-1.5 active:opacity-80"
            >
              <Check size={15} /> Accept
            </button>
            <button
              onClick={() => respond(c.id, false)}
              className="flex-1 h-10 rounded-xl border border-border text-muted text-sm flex items-center justify-center gap-1.5 active:bg-card"
            >
              <X size={15} /> Decline
            </button>
          </div>
        </Card>
      ))}

      {active.map((c) => <Card key={c.id} c={c} exNames={exNames} unit={unit} myId={myId} />)}
      {sent.map((c) => <Card key={c.id} c={c} exNames={exNames} unit={unit} />)}
      {done.map((c) => <Card key={c.id} c={c} exNames={exNames} unit={unit} myId={myId} />)}

      <NewChallengeModal
        open={creating}
        onClose={() => { setCreating(false); onPresetUsed?.(); }}
        workouts={workouts}
        exercises={exercises}
        unit={unit}
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

function Card({ c, exNames, unit, myId, accent, children }) {
  const name = exNames.get(c.exercise_id) || c.exercise_id;
  const bodyweight = Number(c.target_weight_kg) === 0;
  const fmt = (w, r) => (bodyweight ? `${r} reps` : `${formatWeight(Number(w), unit)} × ${r}`);

  const mine = fmt(c.my_best_weight_kg, c.my_best_reps);
  const theirs = fmt(c.their_best_weight_kg, c.their_best_reps);
  const hasMine = Number(c.my_best_weight_kg) > 0 || c.my_best_reps > 0;
  const hasTheirs = Number(c.their_best_weight_kg) > 0 || c.their_best_reps > 0;

  return (
    <section className={`bg-surface border rounded-2xl p-3 ${accent ? 'border-accent/50' : 'border-border'}`}>
      <div className="flex items-center gap-2.5">
        <Avatar profile={{ display_name: c.other_display_name, username: c.other_username, avatar_url: c.other_avatar_url }} size={34} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{name}</h3>
          <p className="text-[11px] text-muted truncate">
            {c.i_created ? 'You challenged' : 'Challenged by'} {c.other_display_name}
          </p>
        </div>
        <StatusPill c={c} myId={myId} />
      </div>

      <div className="mt-3 rounded-xl bg-card border border-border p-2.5 text-center">
        <p className="text-[10px] tracking-wider text-muted font-semibold">TARGET TO BEAT</p>
        <p className="text-lg font-bold tabular-nums mt-0.5">
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
        <p className="text-[11px] text-muted text-center mt-2 flex items-center justify-center gap-1">
          <Clock size={12} /> {timeLeft(c.ends_at)}
        </p>
      )}

      {children}
    </section>
  );
}

function Score({ label, value }) {
  return (
    <div className="rounded-xl border border-border p-2 text-center">
      <p className="text-[10px] text-muted truncate">{label}</p>
      <p className="text-sm font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function StatusPill({ c, myId }) {
  if (c.status === 'pending') {
    return <span className="text-[11px] text-muted flex items-center gap-1 shrink-0"><Clock size={12} /> Pending</span>;
  }
  if (c.status === 'active') {
    return <span className="text-[11px] text-accent font-semibold shrink-0">Live</span>;
  }
  if (c.status === 'complete') {
    if (!c.winner_id) return <span className="text-[11px] text-muted shrink-0">Draw</span>;
    const won = c.winner_id === myId;
    return (
      <span className={`text-[11px] font-semibold flex items-center gap-1 shrink-0 ${won ? 'text-warn' : 'text-muted'}`}>
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

// Creating a challenge: pick a friend, a lift you have actually logged, and a
// duration. Only lifts with a local PR are offered — the server refuses the rest
// anyway, and offering them would be a trap.
function NewChallengeModal({ open, onClose, workouts, exercises, unit, onCreated, presetOpponent }) {
  const [friends, setFriends] = useState([]);
  const [opponent, setOpponent] = useState(null);
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
    setOpponent(presetOpponent ? { other_id: presetOpponent.id, display_name: presetOpponent.display_name, username: presetOpponent.username } : null);
    listFriendships()
      .then((res) => setFriends(res.rows.filter((r) => r.direction === 'friend')))
      .catch(() => setFriends([]));
  }, [open, presetOpponent]);

  const target = myLifts.find((l) => l.exercise_id === exerciseId);

  const submit = async () => {
    if (!opponent || !exerciseId) return;
    setBusy(true);
    setError(null);
    try {
      await createChallenge(opponent.other_id, exerciseId, days);
      toast(`Challenge sent to ${opponent.display_name}`, { tone: 'success' });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Beat my PR"
      footer={
        <button
          onClick={submit}
          disabled={!opponent || !exerciseId || busy}
          className="w-full h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Send challenge
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted mb-1.5 block">Who</label>
          {friends.length === 0 ? (
            <p className="text-sm text-muted py-2">Add a friend first.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {friends.map((f) => (
                <button
                  key={f.other_id}
                  onClick={() => setOpponent(f)}
                  className={`shrink-0 px-3 h-10 rounded-xl border text-sm flex items-center gap-2 ${
                    opponent?.other_id === f.other_id
                      ? 'border-accent bg-accent/10 text-text'
                      : 'border-border text-muted'
                  }`}
                >
                  <Avatar profile={f} size={20} />
                  {f.display_name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">Which lift</label>
          {myLifts.length === 0 ? (
            <p className="text-sm text-muted py-2">
              Log some working sets on a built-in exercise first — a challenge needs a PR to beat.
            </p>
          ) : (
            <select
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm outline-none focus:border-accent"
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
          <div className="rounded-xl bg-card border border-border p-3 text-center">
            <p className="text-[10px] tracking-wider text-muted font-semibold">THEY HAVE TO BEAT</p>
            <p className="text-xl font-bold tabular-nums mt-1">
              {Number(target.top_weight_kg) > 0
                ? `${formatWeight(target.top_weight_kg, unit)} × ${target.top_weight_reps}`
                : `${target.top_weight_reps} reps`}
            </p>
            <p className="text-[11px] text-muted mt-1">Your current best. It is locked in when you send this.</p>
          </div>
        )}

        <div>
          <label className="text-xs text-muted mb-1.5 block">How long</label>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`flex-1 h-10 rounded-xl border text-sm font-medium ${
                  days === d ? 'border-accent bg-accent/10 text-text' : 'border-border text-muted'
                }`}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
