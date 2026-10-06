import { useMemo, useRef, useState } from 'react';
import { Flame, Dumbbell, Pencil, Eye, EyeOff, Check, CloudOff, RefreshCw, Camera, Trash2, Users, Sparkles } from 'lucide-react';
import { Avatar } from '../components/AppHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatWeight, compactVolume } from '../utils/units.js';
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

  // Tonnes once a lifetime total passes one, so the number fits the tile.
  const volume = compactVolume(stats.lifetime_volume_kg);

  return (
    <div className="px-base pt-base pb-base space-y-md">
      {/* Identity */}
      <section className="bg-glass border border-glass-border rounded-card p-base">
        <div className="flex items-start gap-md">
          <Avatar profile={profile} size={56} />
          <div className="flex-1 min-w-0">
            <h1 className="text-body font-semibold leading-tight truncate">{profile.display_name}</h1>
            <p className="text-label text-ink-tertiary">@{profile.username}</p>
            {profile.bio && <p className="text-label mt-sm leading-snug">{profile.bio}</p>}
          </div>
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit profile"
            className="p-sm -m-xs text-ink-tertiary active:text-ink shrink-0"
          >
            <Pencil size={18} />
          </button>
        </div>

        {stats.streak_weeks > 0 && (
          <div className="mt-md inline-flex items-center gap-xs px-md h-8 rounded-full bg-glass-inset border border-glass-border">
            <Flame size={14} className="text-ink-secondary" />
            <span className="text-label font-semibold text-ink-secondary">
              {stats.streak_weeks} week{stats.streak_weeks === 1 ? '' : 's'} in a row
            </span>
          </div>
        )}
      </section>

      {/* Totals */}
      <section className="grid grid-cols-3 gap-sm">
        <Stat label="Workouts" value={stats.total_workouts} />
        <Stat label="This week" value={stats.workouts_this_week} />
        <Stat label="Volume" value={volume.value} suffix={volume.unit} />
      </section>

      {/* Top lifts */}
      <section className="bg-glass border border-glass-border rounded-card p-base">
        <h2 className="text-label font-semibold mb-sm">Top lifts</h2>
        {topLifts.length === 0 ? (
          <p className="text-label text-ink-tertiary py-md text-center">
            Log a few working sets on the built-in exercises and your best lifts show up here.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {topLifts.map((l) => (
              <li key={l.exercise_id} className="py-sm flex items-center justify-between gap-sm">
                <div className="min-w-0">
                  <div className="text-label font-semibold truncate">{exNames.get(l.exercise_id) || 'Exercise'}</div>
                  <div className="text-micro tracking-normal text-ink-tertiary">{relativeDay(new Date(l.achieved_at).getTime())}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-body font-semibold tabular-nums">
                    {l.top_weight_kg > 0
                      ? formatWeight(l.top_weight_kg)
                      : `${l.top_weight_reps} reps`}
                  </div>
                  {l.top_weight_kg > 0 && (
                    <div className="text-micro tracking-normal text-ink-tertiary">× {l.top_weight_reps}</div>
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
        <section className="bg-glass border border-focus/40 rounded-card p-base">
          <h2 className="text-label font-semibold flex items-center gap-xs">
            <Sparkles size={15} className="text-ink" /> Kun is now one community
          </h2>
          <p className="text-label text-ink-tertiary mt-xs leading-relaxed">
            You no longer need friends to use the social features. Everyone shares a feed, a
            leaderboard and a weekly recap.
          </p>
          <p className="text-label text-ink-tertiary mt-sm leading-relaxed">
            Because you were already sharing stats with friends, your community sharing was
            turned <strong className="text-ink">{profile.share_activity ? 'on' : 'off'}</strong> to
            match. It covers far less than your friends already see — milestones only, never
            your detailed numbers. The two switches below are separate, and you can change
            either one.
          </p>
          <button
            onClick={dismissNotice}
            className="mt-md h-10 px-base rounded-row bg-primary text-on-primary text-label font-semibold active:opacity-80"
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
      <section className="bg-glass border border-glass-border rounded-card p-base">
        <h2 className="text-label font-semibold mb-xs">Who can see what</h2>

        <button
          onClick={toggleActivity}
          className="w-full flex items-center justify-between gap-md min-h-tap text-left pt-1"
        >
          <span className="flex items-center gap-sm">
            {profile.share_activity
              ? <Users size={18} className="text-done shrink-0" />
              : <EyeOff size={18} className="text-ink-tertiary shrink-0" />}
            <span>
              <span className="text-label block">Appear in the community</span>
              <span className="text-micro tracking-normal text-ink-tertiary block leading-snug">
                {profile.share_activity
                  ? 'Everyone on Kun sees your records, streaks and workout count.'
                  : 'You are hidden from the feed, the global board and the weekly recap.'}
              </span>
            </span>
          </span>
          <Toggle on={profile.share_activity} />
        </button>

        <div className="h-px bg-hairline my-sm" />

        <button
          onClick={toggleSharing}
          className="w-full flex items-center justify-between gap-md min-h-tap text-left"
        >
          <span className="flex items-center gap-sm">
            {profile.share_stats
              ? <Eye size={18} className="text-done shrink-0" />
              : <EyeOff size={18} className="text-ink-tertiary shrink-0" />}
            <span>
              <span className="text-label block">Share detailed stats with friends</span>
              <span className="text-micro tracking-normal text-ink-tertiary block leading-snug">
                {profile.share_stats
                  ? 'Accepted friends also see your volume, every top lift and your full week.'
                  : 'Friends see only what the community sees.'}
              </span>
            </span>
          </span>
          <Toggle on={profile.share_stats} />
        </button>

        <p className="text-micro tracking-normal text-ink-tertiary mt-sm pt-sm border-t border-glass-border leading-relaxed">
          The community sees milestones — a new record, a streak, a workout count. Friends see
          the detail behind them. Nobody, in either case, ever sees your individual sets, reps
          or notes — those never leave this device.
        </p>
      </section>

      {/* Sync status */}
      <section className="bg-glass border border-glass-border rounded-card p-base">
        <div className="flex items-center justify-between gap-sm min-h-tap">
          <span className="flex items-center gap-sm text-label">
            {pendingSync > 0
              ? <CloudOff size={16} className="text-ink-secondary" />
              : <Check size={16} className="text-done" />}
            <span className="text-ink-tertiary">
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
            className="h-9 px-md rounded-control border border-glass-border text-label text-ink-tertiary flex items-center gap-xs active:bg-glass-inset disabled:opacity-50"
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
    <div className="bg-glass border border-glass-border rounded-card p-md text-center min-w-0">
      {/* A third of a phone wide. The value must shrink rather than spill, so
          it is clamped to the tile and never wraps mid-number. */}
      <div
        className="font-semibold tabular-nums leading-tight truncate"
        style={{ fontSize: 'clamp(20px, 7.5vw, 32px)', letterSpacing: '-0.025em' }}
      >
        {value}
      </div>
      <div className="text-micro tracking-normal text-ink-tertiary mt-xxs truncate">
        {suffix ? `${label} (${suffix})` : label}
      </div>
    </div>
  );
}

function Toggle({ on }) {
  return (
    <span
      aria-hidden="true"
      className={`w-tap h-6 rounded-full shrink-0 relative transition-colors ${on ? 'bg-done' : 'bg-glass-inset'}`}
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
        <div className="flex gap-sm">
          <button onClick={onClose} className="flex-1 h-tap rounded-row border border-glass-border">Cancel</button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 h-tap rounded-row bg-primary text-on-primary font-semibold disabled:opacity-50"
          >
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-md">
        <div className="flex items-center gap-md">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className="relative rounded-full active:opacity-70 disabled:opacity-60"
            aria-label={profile?.avatar_url ? 'Change profile picture' : 'Add a profile picture'}
          >
            <Avatar profile={profile} size={64} />
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-primary border-2 border-surface flex items-center justify-center">
              {photoBusy
                ? <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                : <Camera size={12} className="text-on-primary" />}
            </span>
          </button>
          <div className="min-w-0">
            <p className="text-label font-semibold">Profile picture</p>
            <p className="text-micro tracking-normal text-ink-tertiary leading-snug">
              Shown to friends. Resized on this device before it is uploaded.
            </p>
            {profile?.avatar_url && (
              <button
                onClick={clearPhoto}
                disabled={photoBusy}
                className="mt-xs h-8 px-sm -ml-sm rounded-control text-micro tracking-normal text-ink-tertiary flex items-center gap-xs active:text-danger disabled:opacity-50"
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
          <label className="text-label text-ink-tertiary mb-xs block">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            className="w-full h-tap px-md rounded-row bg-glass-inset border border-glass-border outline-none focus:border-focus text-label"
          />
        </div>
        <div>
          <label className="text-label text-ink-tertiary mb-xs block">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            placeholder="Optional"
            className="w-full min-h-[70px] p-md rounded-row bg-glass-inset border border-glass-border outline-none focus:border-focus text-label"
          />
          <p className="text-micro tracking-normal text-ink-tertiary mt-xs text-right">{bio.length}/160</p>
        </div>
        <p className="text-micro tracking-normal text-ink-tertiary flex items-center gap-xs">
          <Dumbbell size={12} /> @{profile?.username} cannot be changed.
        </p>
        {error && <p role="alert" className="text-label text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
