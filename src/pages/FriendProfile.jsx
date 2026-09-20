import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Flame, EyeOff, UserMinus, Swords, Lock } from 'lucide-react';
import { Avatar } from '../components/AppHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { getFriendProfile, removeFriend, sendFriendRequest } from '../services/friendsApi.js';
import { buildStatsSummary, buildLiftsSummary } from '../services/socialSummary.js';
import AchievementsRow from '../components/AchievementsRow.jsx';
import { formatWeight } from '../utils/units.js';
import { relativeDay } from '../utils/date.js';

// A friend's profile, with head-to-head built in rather than on a separate
// screen. Seeing your number next to theirs is the whole point of opening this,
// so it is the default view, not something you navigate to.
export default function FriendProfile({
  targetId, myId, onBack, workouts, exercises, settings, onChanged, onChallenge
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const toast = useToast();
  const unit = settings.unit;

  const exNames = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const myStats = useMemo(() => buildStatsSummary(workouts), [workouts]);
  const myLifts = useMemo(() => {
    const m = new Map();
    for (const l of buildLiftsSummary(workouts)) m.set(l.exercise_id, l);
    return m;
  }, [workouts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getFriendProfile(targetId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-4">
        <BackBar onBack={onBack} />
        <div className="flex justify-center py-16">
          <span className="w-6 h-6 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <BackBar onBack={onBack} />
        <p className="text-center text-sm text-danger py-10">{error || 'Could not load this profile.'}</p>
        <button onClick={load} className="w-full h-11 rounded-xl border border-border">Try again</button>
      </div>
    );
  }

  const { profile, stats, lifts, can_view_stats: canView, relationship } = data;
  const isFriend = relationship === 'friends';

  // Lifts both people have logged, heaviest first — the head-to-head rows.
  const shared = (lifts || [])
    .filter((l) => myLifts.has(l.exercise_id))
    .sort((a, b) => b.top_weight_kg - a.top_weight_kg)
    .slice(0, 6);

  return (
    <div className="p-3 space-y-3">
      <BackBar onBack={onBack} />

      <section className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Avatar profile={profile} size={56} />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">{profile.display_name}</h1>
            <p className="text-sm text-muted">@{profile.username}</p>
            {profile.bio && <p className="text-sm mt-2 leading-snug">{profile.bio}</p>}
          </div>
        </div>

        {canView && stats?.streak_weeks > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-warn/15 border border-warn/30">
            <Flame size={14} className="text-warn" />
            <span className="text-sm font-semibold text-warn">
              {stats.streak_weeks} week{stats.streak_weeks === 1 ? '' : 's'} in a row
            </span>
          </div>
        )}

        {isFriend && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => onChallenge?.(profile)}
              className="flex-1 h-11 rounded-xl bg-accent text-white font-semibold flex items-center justify-center gap-2 active:opacity-80"
            >
              <Swords size={16} /> Challenge
            </button>
            <button
              onClick={() => setConfirmRemove(true)}
              aria-label="Remove friend"
              className="w-11 h-11 rounded-xl border border-border text-muted flex items-center justify-center active:bg-card"
            >
              <UserMinus size={16} />
            </button>
          </div>
        )}

        {relationship === 'none' && (
          <button
            onClick={async () => {
              try {
                await sendFriendRequest(profile.id);
                toast('Request sent', { tone: 'success' });
                await load();
                onChanged?.();
              } catch (err) { toast(err.message, { tone: 'error' }); }
            }}
            className="w-full mt-4 h-11 rounded-xl bg-accent text-white font-semibold active:opacity-80"
          >
            Add friend
          </button>
        )}
        {relationship === 'requested' && (
          <p className="mt-4 text-sm text-muted text-center">Friend request sent.</p>
        )}
      </section>

      {/* Not friends, or they turned sharing off. Both end here, with different
          wording — "they hid it" and "you can't see it yet" are not the same
          thing and pretending otherwise is confusing. */}
      {!canView && (
        <section className="bg-surface border border-border rounded-2xl p-6 text-center">
          {relationship === 'friends' ? (
            <>
              <EyeOff size={24} className="text-muted mx-auto mb-2" />
              <p className="text-sm font-medium">{profile.display_name} keeps their stats private</p>
              <p className="text-xs text-muted mt-1">They have turned off stat sharing.</p>
            </>
          ) : (
            <>
              <Lock size={24} className="text-muted mx-auto mb-2" />
              <p className="text-sm font-medium">Stats are for friends only</p>
              <p className="text-xs text-muted mt-1">Add {profile.display_name} as a friend to compare lifts.</p>
            </>
          )}
        </section>
      )}

      {canView && stats && (
        <section className="bg-surface border border-border rounded-2xl p-3">
          <h2 className="text-sm font-semibold mb-3">Head to head</h2>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center mb-2">
            <span className="text-[11px] text-muted text-right">You</span>
            <span />
            <span className="text-[11px] text-muted truncate">{profile.display_name.split(' ')[0]}</span>
          </div>

          <CompareRow
            label="Workouts"
            mine={myStats.total_workouts}
            theirs={stats.total_workouts}
          />
          <CompareRow
            label="Streak"
            mine={myStats.streak_weeks}
            theirs={stats.streak_weeks}
            format={(v) => `${v}w`}
          />
          <CompareRow
            label="Volume"
            mine={myStats.lifetime_volume_kg}
            theirs={Number(stats.lifetime_volume_kg)}
            format={(v) => formatWeight(v, unit)}
          />

          {shared.length > 0 && <div className="h-px bg-border my-2" />}

          {shared.map((l) => {
            const mine = myLifts.get(l.exercise_id);
            const bodyweight = Number(l.top_weight_kg) === 0 && mine.top_weight_kg === 0;
            return (
              <CompareRow
                key={l.exercise_id}
                label={exNames.get(l.exercise_id) || 'Exercise'}
                mine={bodyweight ? mine.top_weight_reps : mine.top_weight_kg}
                theirs={bodyweight ? l.top_weight_reps : Number(l.top_weight_kg)}
                format={(v) => (bodyweight ? `${v} reps` : formatWeight(v, unit))}
              />
            );
          })}

          {shared.length === 0 && (
            <p className="text-xs text-muted text-center py-3">
              No lifts in common yet. Train some of the same exercises to compare.
            </p>
          )}

          {stats.last_workout_at && (
            <p className="text-[11px] text-muted mt-3 pt-2 border-t border-border text-center">
              Last trained {relativeDay(new Date(stats.last_workout_at).getTime()).toLowerCase()}
            </p>
          )}
        </section>
      )}

      {canView && stats && (
        <AchievementsRow
          stats={stats}
          lifts={lifts}
          unit={unit}
          title={`${profile.display_name.split(' ')[0]}'s achievements`}
        />
      )}

      {canView && lifts?.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-3">
          <h2 className="text-sm font-semibold mb-2">Their top lifts</h2>
          <ul className="divide-y divide-border">
            {lifts.slice(0, 5).map((l) => (
              <li key={l.exercise_id} className="py-2.5 flex items-center justify-between gap-2">
                <span className="text-sm truncate">{exNames.get(l.exercise_id) || l.exercise_id}</span>
                <span className="text-sm font-bold tabular-nums shrink-0">
                  {Number(l.top_weight_kg) > 0
                    ? `${formatWeight(Number(l.top_weight_kg), unit)} × ${l.top_weight_reps}`
                    : `${l.top_weight_reps} reps`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${profile.display_name}?`}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmRemove(false)} className="flex-1 h-11 rounded-xl border border-border">Cancel</button>
            <button
              onClick={async () => {
                try {
                  await removeFriend(profile.id, myId);
                  toast('Friend removed');
                  setConfirmRemove(false);
                  onChanged?.();
                  onBack();
                } catch (err) { toast(err.message, { tone: 'error' }); }
              }}
              className="flex-1 h-11 rounded-xl bg-danger text-white font-semibold"
            >Remove</button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          You will both stop seeing each other's stats. You can add them again later.
        </p>
      </Modal>
    </div>
  );
}

function BackBar({ onBack }) {
  return (
    <button onClick={onBack} className="h-11 -ml-2 px-2 text-sm text-muted flex items-center gap-1 active:text-text">
      <ArrowLeft size={18} /> Back
    </button>
  );
}

// One comparison row. The winning side is emphasised and the bar underneath is
// proportional, so the gap is readable at a glance without doing arithmetic.
function CompareRow({ label, mine, theirs, format = (v) => String(v) }) {
  const m = Number(mine) || 0;
  const t = Number(theirs) || 0;
  const total = m + t;
  const minePct = total > 0 ? (m / total) * 100 : 50;
  const iWin = m > t;
  const tie = m === t;

  return (
    <div className="py-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-baseline">
        <span className={`text-sm font-bold tabular-nums text-right ${
          tie ? 'text-text' : iWin ? 'text-success' : 'text-muted'
        }`}>
          {format(m)}
        </span>
        <span className="text-[11px] text-muted text-center whitespace-nowrap max-w-[104px] truncate">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${
          tie ? 'text-text' : !iWin ? 'text-success' : 'text-muted'
        }`}>
          {format(t)}
        </span>
      </div>
      <div className="flex h-1 mt-1 rounded-full overflow-hidden bg-border" aria-hidden="true">
        <span
          className={`h-full ${tie ? 'bg-muted' : iWin ? 'bg-success' : 'bg-border'}`}
          style={{ width: `${minePct}%` }}
        />
        <span className={`h-full flex-1 ${tie ? 'bg-muted' : !iWin ? 'bg-success' : 'bg-border'}`} />
      </div>
    </div>
  );
}
