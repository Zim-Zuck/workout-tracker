import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Flame, EyeOff, UserMinus, UserPlus, Swords, Lock, Clock, Check } from 'lucide-react';
import { Avatar } from '../components/AppHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { getFriendProfile, removeFriend, sendFriendRequest, respondToRequest } from '../services/friendsApi.js';
import { fetchUserActivity } from '../services/communityApi.js';
import { describeEvent } from '../services/communityEvents.js';
import { buildStatsSummary, buildLiftsSummary } from '../services/socialSummary.js';
import AchievementsRow from '../components/AchievementsRow.jsx';
import { formatWeight } from '../utils/units.js';
import { relativeDay } from '../utils/date.js';

// Anyone's profile.
//
// This was the friend profile, and it asked one question of a stranger: do you
// want to add them? It now leads with Challenge, for everyone, because that is
// the thing you can actually do with someone you just found in the feed.
// Friending is still here, as a secondary action — it is what unlocks the
// detailed comparison below, which is a reason to do it rather than a toll gate
// in front of the whole screen.
//
// The privacy model underneath is completely unchanged: the head-to-head still
// appears only when can_view_stats() says so, which still means an accepted
// friendship plus their share_stats switch.
export default function UserProfile({
  targetId, myId, onBack, workouts, exercises, onChanged, onChallenge
}) {
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const toast = useToast();

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
      // Two calls, but only the profile can fail the screen. fetchUserActivity
      // swallows its own errors and returns [] — a profile that loads without
      // its activity strip is still a useful profile.
      const [profileData, events] = await Promise.all([
        getFriendProfile(targetId),
        fetchUserActivity(targetId, 8)
      ]);
      setData(profileData);
      setActivity(events);
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
        <p className="text-center text-label text-danger py-10">{error || 'Could not load this profile.'}</p>
        <button onClick={load} className="w-full h-tap rounded-row border border-glass-border">Try again</button>
      </div>
    );
  }

  const { profile, stats, lifts, can_view_stats: canView } = data;
  // Defended rather than trusted. Before migration 015 this came back NULL for
  // anyone you had no friendship row with — every stranger, which is now most of
  // the people you open — and a null here would render a profile with no way to
  // add that person. The migration fixes the source; this keeps the screen
  // correct against a database that has not run it yet.
  const relationship = data.relationship || 'none';

  // Lifts both people have logged, heaviest first — the head-to-head rows.
  const shared = (lifts || [])
    .filter((l) => myLifts.has(l.exercise_id))
    .sort((a, b) => b.top_weight_kg - a.top_weight_kg)
    .slice(0, 6);

  return (
    <div className="p-3 space-y-3">
      <BackBar onBack={onBack} />

      <section className="bg-glass border border-glass-border rounded-card p-4">
        <div className="flex items-start gap-3">
          <Avatar profile={profile} size={56} />
          <div className="flex-1 min-w-0">
            <h1 className="text-body font-semibold leading-tight truncate">{profile.display_name}</h1>
            <p className="text-label text-ink-tertiary">@{profile.username}</p>
            {profile.bio && <p className="text-label mt-2 leading-snug">{profile.bio}</p>}
          </div>
        </div>

        {canView && stats?.streak_weeks > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-glass-inset border border-glass-border">
            <Flame size={14} className="text-ink-secondary" />
            <span className="text-label font-semibold text-ink-secondary">
              {stats.streak_weeks} week{stats.streak_weeks === 1 ? '' : 's'} in a row
            </span>
          </div>
        )}

        {/* Challenge leads, whoever this is. It is the one thing you can do
            with a person you have never met, and it needs no permission from
            them — the server stopped requiring a friendship in migration 014.
            Friending is the smaller button beside it. */}
        {relationship !== 'self' && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => onChallenge?.(profile)}
              className="flex-1 h-tap rounded-row bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 active:opacity-80"
            >
              <Swords size={16} /> Challenge
            </button>

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
                aria-label="Add friend"
                className="h-tap px-3 rounded-row border border-glass-border text-ink-tertiary flex items-center justify-center gap-1.5 active:bg-glass-inset"
              >
                <UserPlus size={16} /> <span className="text-label">Add</span>
              </button>
            )}

            {relationship === 'incoming' && (
              <button
                onClick={async () => {
                  try {
                    await respondToRequest(profile.id, true);
                    toast(`You and ${profile.display_name} are now friends`, { tone: 'success' });
                    await load();
                    onChanged?.();
                  } catch (err) { toast(err.message, { tone: 'error' }); }
                }}
                aria-label="Accept friend request"
                className="h-tap px-3 rounded-row border border-done-border text-done flex items-center justify-center gap-1.5 active:bg-glass-inset"
              >
                <Check size={16} /> <span className="text-label">Accept</span>
              </button>
            )}

            {relationship === 'requested' && (
              <span className="h-tap px-3 rounded-row border border-glass-border text-ink-tertiary flex items-center justify-center gap-1.5 text-label">
                <Clock size={15} /> Sent
              </span>
            )}

            {relationship === 'friends' && (
              <button
                onClick={() => setConfirmRemove(true)}
                aria-label="Remove friend"
                className="w-tap h-tap rounded-row border border-glass-border text-ink-tertiary flex items-center justify-center active:bg-glass-inset"
              >
                <UserMinus size={16} />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Not friends, or they turned sharing off. Both end here, with different
          wording — "they hid it" and "you can't see it yet" are not the same
          thing and pretending otherwise is confusing.
          
          The non-friend case is phrased as what friending would GET you, not as
          what you are being refused. It is the one place in the app where adding
          someone still has a concrete payoff, now that nothing else requires it. */}
      {!canView && (
        <section className="bg-glass border border-glass-border rounded-card p-6 text-center">
          {relationship === 'friends' ? (
            <>
              <EyeOff size={24} className="text-ink-tertiary mx-auto mb-2" />
              <p className="text-label font-semibold">{profile.display_name} keeps their detailed stats private</p>
              <p className="text-label text-ink-tertiary mt-1">They have turned off stat sharing.</p>
            </>
          ) : (
            <>
              <Lock size={24} className="text-ink-tertiary mx-auto mb-2" />
              <p className="text-label font-semibold">Add {profile.display_name.split(' ')[0]} to compare lifts</p>
              <p className="text-label text-ink-tertiary mt-1 leading-relaxed">
                Friends see each other's totals and top lifts side by side. You can still
                challenge them without it.
              </p>
            </>
          )}
        </section>
      )}

      {canView && stats && (
        <section className="bg-glass border border-glass-border rounded-card p-3">
          <h2 className="text-label font-semibold mb-3">Head to head</h2>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center mb-2">
            <span className="text-micro tracking-normal text-ink-tertiary text-right">You</span>
            <span />
            <span className="text-micro tracking-normal text-ink-tertiary truncate">{profile.display_name.split(' ')[0]}</span>
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
            format={(v) => formatWeight(v)}
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
                format={(v) => (bodyweight ? `${v} reps` : formatWeight(v))}
              />
            );
          })}

          {shared.length === 0 && (
            <p className="text-label text-ink-tertiary text-center py-3">
              No lifts in common yet. Train some of the same exercises to compare.
            </p>
          )}

          {stats.last_workout_at && (
            <p className="text-micro tracking-normal text-ink-tertiary mt-3 pt-2 border-t border-glass-border text-center">
              Last trained {relativeDay(new Date(stats.last_workout_at).getTime()).toLowerCase()}
            </p>
          )}
        </section>
      )}

      {canView && stats && (
        <AchievementsRow
          stats={stats}
          lifts={lifts}
          title={`${profile.display_name.split(' ')[0]}'s achievements`}
        />
      )}

      {canView && lifts?.length > 0 && (
        <section className="bg-glass border border-glass-border rounded-card p-3">
          <h2 className="text-label font-semibold mb-2">Their top lifts</h2>
          <ul className="divide-y divide-hairline">
            {lifts.slice(0, 5).map((l) => (
              <li key={l.exercise_id} className="py-2.5 flex items-center justify-between gap-2">
                <span className="text-label truncate">{exNames.get(l.exercise_id) || l.exercise_id}</span>
                <span className="text-label font-semibold tabular-nums shrink-0">
                  {Number(l.top_weight_kg) > 0
                    ? `${formatWeight(Number(l.top_weight_kg))} × ${l.top_weight_reps}`
                    : `${l.top_weight_reps} reps`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activity.length > 0 && (
        <section className="bg-glass border border-glass-border rounded-card p-3">
          <h2 className="text-label font-semibold mb-1">Recent activity</h2>
          <ul className="divide-y divide-hairline">
            {activity.map((ev) => {
              const d = describeEvent(ev, exNames);
              // An event type this build does not know about is skipped rather
              // than rendered blank.
              if (!d) return null;
              return (
                <li key={ev.id} className="py-2.5 flex items-start gap-2.5">
                  <span aria-hidden="true" className="text-body leading-none mt-0.5">{d.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-label leading-snug">{d.headline}</p>
                    {d.detail && (
                      <p className="text-label font-semibold tabular-nums mt-0.5">{d.detail}</p>
                    )}
                  </div>
                  <span className="text-micro tracking-normal text-ink-tertiary shrink-0">
                    {relativeDay(new Date(ev.created_at).getTime())}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${profile.display_name}?`}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmRemove(false)} className="flex-1 h-tap rounded-row border border-glass-border">Cancel</button>
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
              className="flex-1 h-tap rounded-row bg-danger text-on-primary font-semibold"
            >Remove</button>
          </div>
        }
      >
        <p className="text-label text-ink-tertiary">
          You will both stop seeing each other's stats. You can add them again later.
        </p>
      </Modal>
    </div>
  );
}

function BackBar({ onBack }) {
  return (
    <button onClick={onBack} className="h-tap -ml-2 px-2 text-label text-ink-tertiary flex items-center gap-1 active:text-ink">
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
        <span className={`text-label font-semibold tabular-nums text-right ${
          tie ? 'text-ink' : iWin ? 'text-done' : 'text-ink-tertiary'
        }`}>
          {format(m)}
        </span>
        <span className="text-micro tracking-normal text-ink-tertiary text-center whitespace-nowrap max-w-[104px] truncate">{label}</span>
        <span className={`text-label font-semibold tabular-nums ${
          tie ? 'text-ink' : !iWin ? 'text-done' : 'text-ink-tertiary'
        }`}>
          {format(t)}
        </span>
      </div>
      <div className="flex h-1 mt-1 rounded-full overflow-hidden bg-border" aria-hidden="true">
        <span
          className={`h-full ${tie ? 'bg-muted' : iWin ? 'bg-done' : 'bg-border'}`}
          style={{ width: `${minePct}%` }}
        />
        <span className={`h-full flex-1 ${tie ? 'bg-muted' : !iWin ? 'bg-done' : 'bg-border'}`} />
      </div>
    </div>
  );
}
