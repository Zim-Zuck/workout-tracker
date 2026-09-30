import { useMemo, useRef, useState } from 'react';
import { Flame, Dumbbell, Pencil, Eye, EyeOff, Check, CloudOff, RefreshCw, Camera, Trash2, Users, Sparkles } from 'lucide-react';
import { Avatar } from '../components/AppHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatWeight } from '../utils/units.js';
import { relativeDay } from '../utils/date.js';
import { buildStatsSummary, buildLiftsSummary, pickTopLifts } from '../services/socialSummary.js';
import { updateProfile } from '../services/profileApi.js';
import { uploadAvatar, removeAvatar } from '../services/avatarApi.js';
import AchievementsRow from '../components/AchievementsRow.jsx';

// Your own profile — rendered from LOCAL data, not from the cloud.
//
// That is the important choice on this screen: the numbers here are the same
// ones the rest of the app computes, so the profile is instant, correct and
// works offline. What the cloud holds is a copy for friends to read, and the
// sync row below says whether that copy is current.
export default function ProfileScreen({ profileState, workouts, exercises, auth }) {
  const { profile, setProfile, publish, pendingSync, lastSyncAt } = profileState;
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const exNames = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const stats = useMemo(() => buildStatsSummary(workouts), [workouts]);
  const topLifts = useMemo(() => pickTopLifts(buildLiftsSummary(workouts), 3), [workouts]);

  if (!profile) return null;

  const toggleSharing = async () => {
    const next = !profile.share_stats;
    try {
      const updated = await updateProfile(profile.id, { share_stats: next });
      setProfile(updated);
      toast(next ? 'Friends can see your stats' : 'Your stats are hidden from friends', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  // The second, separate switch. Toggling it also clears the one-time notice:
  // somebody who has just used the control has, by definition, seen it.
  const toggleActivity = async () => {
    const next = !profile.share_activity;
    try {
      const updated = await updateProfile(profile.id, {
        share_activity: next,
        community_notice_pending: false
      });
      setProfile(updated);
      toast(next ? 'You are in the community' : 'Your activity is hidden from the community', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const dismissNotice = async () => {
    try {
      const updated = await updateProfile(profile.id, { community_notice_pending: false });
      setProfile(updated);
    } catch { /* the notice reappearing is not worth an error toast */ }
  };

  return (
    <div className="p-3 space-y-3">
      {/* Identity */}
      <section className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Avatar profile={profile} size={56} />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">{profile.display_name}</h1>
            <p className="text-sm text-muted">@{profile.username}</p>
            {profile.bio && <p className="text-sm mt-2 leading-snug">{profile.bio}</p>}
          </div>
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit profile"
            className="p-2 -m-1 text-muted active:text-text shrink-0"
          >
            <Pencil size={18} />
          </button>
        </div>

        {stats.streak_weeks > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-warn/15 border border-warn/30">
            <Flame size={14} className="text-warn" />
            <span className="text-sm font-semibold text-warn">
              {stats.streak_weeks} week{stats.streak_weeks === 1 ? '' : 's'} in a row
            </span>
          </div>
        )}
      </section>

      {/* Totals */}
      <section className="grid grid-cols-3 gap-2">
        <Stat label="Workouts" value={stats.total_workouts} />
        <Stat label="This week" value={stats.workouts_this_week} />
        <Stat
          label="Volume"
          value={formatWeight(stats.lifetime_volume_kg, { withUnit: false })}
          suffix="kg"
        />
      </section>

      {/* Top lifts */}
      <section className="bg-surface border border-border rounded-2xl p-3">
        <h2 className="text-sm font-semibold mb-2">Top lifts</h2>
        {topLifts.length === 0 ? (
          <p className="text-xs text-muted py-3 text-center">
            Log a few working sets on the built-in exercises and your best lifts show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {topLifts.map((l) => (
              <li key={l.exercise_id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{exNames.get(l.exercise_id) || 'Exercise'}</div>
                  <div className="text-[11px] text-muted">{relativeDay(new Date(l.achieved_at).getTime())}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-bold tabular-nums">
                    {l.top_weight_kg > 0
                      ? formatWeight(l.top_weight_kg)
                      : `${l.top_weight_reps} reps`}
                  </div>
                  {l.top_weight_kg > 0 && (
                    <div className="text-[11px] text-muted">× {l.top_weight_reps}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AchievementsRow stats={stats} lifts={buildLiftsSummary(workouts)} />

      {/* The one-time explanation, for accounts that existed before the
          community did. Raised by migration 009 and cleared the moment this
          person has read it or touched either switch. */}
      {profile.community_notice_pending && (
        <section className="bg-accent/10 border border-accent/40 rounded-2xl p-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles size={15} className="text-accent" /> Kun is now one community
          </h2>
          <p className="text-xs text-muted mt-1.5 leading-relaxed">
            You no longer need friends to use the social features. Everyone shares a feed, a
            leaderboard and a weekly recap.
          </p>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Because you were already sharing stats with friends, your community sharing was
            turned <strong className="text-text">{profile.share_activity ? 'on' : 'off'}</strong> to
            match. It covers far less than your friends already see — milestones only, never
            your detailed numbers. The two switches below are separate, and you can change
            either one.
          </p>
          <button
            onClick={dismissNotice}
            className="mt-3 h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold active:opacity-80"
          >
            Got it
          </button>
        </section>
      )}

      {/* Privacy — two switches, two different promises.
          
          Kept visually as one section with a divider rather than two separate
          cards, because the whole risk here is somebody reading one and assuming
          it governs the other. They are adjacent, and each says exactly who it
          is about. */}
      <section className="bg-surface border border-border rounded-2xl p-3">
        <h2 className="text-sm font-semibold mb-1">Who can see what</h2>

        <button
          onClick={toggleActivity}
          className="w-full flex items-center justify-between gap-3 min-h-[44px] text-left pt-1"
        >
          <span className="flex items-center gap-2.5">
            {profile.share_activity
              ? <Users size={18} className="text-success shrink-0" />
              : <EyeOff size={18} className="text-muted shrink-0" />}
            <span>
              <span className="text-sm block">Appear in the community</span>
              <span className="text-[11px] text-muted block leading-snug">
                {profile.share_activity
                  ? 'Everyone on Kun sees your records, streaks and workout count.'
                  : 'You are hidden from the feed, the global board and the weekly recap.'}
              </span>
            </span>
          </span>
          <Toggle on={profile.share_activity} />
        </button>

        <div className="h-px bg-border my-2" />

        <button
          onClick={toggleSharing}
          className="w-full flex items-center justify-between gap-3 min-h-[44px] text-left"
        >
          <span className="flex items-center gap-2.5">
            {profile.share_stats
              ? <Eye size={18} className="text-success shrink-0" />
              : <EyeOff size={18} className="text-muted shrink-0" />}
            <span>
              <span className="text-sm block">Share detailed stats with friends</span>
              <span className="text-[11px] text-muted block leading-snug">
                {profile.share_stats
                  ? 'Accepted friends also see your volume, every top lift and your full week.'
                  : 'Friends see only what the community sees.'}
              </span>
            </span>
          </span>
          <Toggle on={profile.share_stats} />
        </button>

        <p className="text-[11px] text-muted mt-2 pt-2 border-t border-border leading-relaxed">
          The community sees milestones — a new record, a streak, a workout count. Friends see
          the detail behind them. Nobody, in either case, ever sees your individual sets, reps
          or notes — those never leave this device.
        </p>
      </section>

      {/* Sync status */}
      <section className="bg-surface border border-border rounded-2xl p-3">
        <div className="flex items-center justify-between gap-2 min-h-[44px]">
          <span className="flex items-center gap-2 text-sm">
            {pendingSync > 0
              ? <CloudOff size={16} className="text-warn" />
              : <Check size={16} className="text-success" />}
            <span className="text-muted">
              {pendingSync > 0
                ? `${pendingSync} change${pendingSync === 1 ? '' : 's'} waiting to sync`
                : lastSyncAt
                  ? `Synced ${relativeDay(lastSyncAt).toLowerCase()}`
                  : 'Up to date'}
            </span>
          </span>
          <button
            onClick={async () => {
              setSyncing(true);
              try {
                await publish();
                toast('Profile synced', { tone: 'success' });
              } catch (err) {
                toast(err.message, { tone: 'error' });
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="h-9 px-3 rounded-lg border border-border text-sm text-muted flex items-center gap-1.5 active:bg-card disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Sync
          </button>
        </div>
      </section>

      <EditProfileModal
        open={editing}
        profile={profile}
        onClose={() => setEditing(false)}
        onSaved={(p) => { setProfile(p); setEditing(false); toast('Profile updated', { tone: 'success' }); }}
        onAvatarChanged={(p) => { setProfile(p); toast(p.avatar_url ? 'Picture updated' : 'Picture removed', { tone: 'success' }); }}
      />
    </div>
  );
}

function Stat({ label, value, suffix }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-3 text-center">
      <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] text-muted mt-0.5">{suffix ? `${label} (${suffix})` : label}</div>
    </div>
  );
}

function Toggle({ on }) {
  return (
    <span
      aria-hidden="true"
      className={`w-11 h-6 rounded-full shrink-0 relative transition-colors ${on ? 'bg-success' : 'bg-border'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </span>
  );
}

function EditProfileModal({ open, profile, onClose, onSaved, onAvatarChanged }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  // Reset the draft each time the sheet opens so a cancelled edit is discarded.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDisplayName(profile?.display_name || '');
      setBio(profile?.bio || '');
      setError(null);
    }
  }

  const save = async () => {
    if (!displayName.trim()) { setError('Display name cannot be empty.'); return; }
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateProfile(profile.id, { display_name: displayName, bio }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // The picture saves immediately on pick rather than waiting for the sheet's
  // Save button. Uploading is slow and can fail on its own terms, so it needs
  // its own spinner and its own error — bundling it into Save would mean a
  // flaky connection loses the name change too.
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    // Reset first: picking the same file twice must still fire a change event.
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      onAvatarChanged(await uploadAvatar(profile.id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const clearPhoto = async () => {
    setPhotoBusy(true);
    setError(null);
    try {
      onAvatarChanged(await removeAvatar(profile.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border">Cancel</button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-50"
          >
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className="relative rounded-full active:opacity-70 disabled:opacity-60"
            aria-label={profile?.avatar_url ? 'Change profile picture' : 'Add a profile picture'}
          >
            <Avatar profile={profile} size={64} />
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-accent border-2 border-surface flex items-center justify-center">
              {photoBusy
                ? <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                : <Camera size={12} className="text-white" />}
            </span>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium">Profile picture</p>
            <p className="text-[11px] text-muted leading-snug">
              Shown to friends. Resized on this device before it is uploaded.
            </p>
            {profile?.avatar_url && (
              <button
                onClick={clearPhoto}
                disabled={photoBusy}
                className="mt-1.5 h-8 px-2.5 -ml-2.5 rounded-lg text-[11px] text-muted flex items-center gap-1.5 active:text-danger disabled:opacity-50"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
          {/* accept="image/*" is what gives iOS and Android the native
              camera-or-library sheet, which is the whole mobile experience. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pickPhoto}
            className="hidden"
          />
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            className="w-full h-11 px-3 rounded-xl bg-card border border-border outline-none focus:border-accent text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1.5 block">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            placeholder="Optional"
            className="w-full min-h-[70px] p-3 rounded-xl bg-card border border-border outline-none focus:border-accent text-sm"
          />
          <p className="text-[11px] text-muted mt-1 text-right">{bio.length}/160</p>
        </div>
        <p className="text-[11px] text-muted flex items-center gap-1.5">
          <Dumbbell size={12} /> @{profile?.username} cannot be changed.
        </p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
