import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { TabBar, ResumePill, UndoToastProvider } from './ui/index.js';
import TodayScreen from './pages/Today.jsx';
import WorkoutScreen from './pages/WorkoutScreen.jsx';
import HistoryScreen from './pages/History.jsx';
import ProgressScreen from './pages/Progress.jsx';
import SocialScreen from './pages/Social.jsx';
import AuthScreen from './pages/Auth.jsx';
import ProfileScreen from './pages/Profile.jsx';
import ProfileSetup from './pages/ProfileSetup.jsx';
import UserProfile from './pages/UserProfile.jsx';
import SettingsScreen from './pages/Settings.jsx';
import AppHeader from './components/AppHeader.jsx';
import { useSettings } from './hooks/useSettings.js';
import { useAuth } from './hooks/useAuth.js';
import { useProfile } from './hooks/useProfile.js';
import { unreadCount } from './services/friendsApi.js';
import { maybeAutoBackup } from './services/backupApi.js';
import { useWorkout } from './hooks/useWorkout.js';
import { useRestTimer } from './hooks/useRestTimer.js';
import { useFeed } from './hooks/useFeed.js';
import { splitLabel } from './services/splits.js';
import { ensureInitialized } from './db/database.js';
import { maybeSeed } from './db/seedData.js';

export default function App() {
  return (
    <ToastProvider>
      <UndoToastProvider>
        <Root />
      </UndoToastProvider>
    </ToastProvider>
  );
}

function Root() {
  // Today is the default home. 'workout' is no longer a tab — the active session
  // is a place you are sent to, from the hero or the resume pill, not a
  // destination you browse to while nothing is running.
  const [tab, setTab] = useState('today');
  const [inSession, setInSession] = useState(false);
  // Auth is shown as an overlay rather than a tab: it is a detour, and you should
  // land back exactly where you were when you finish or back out.
  const [authOpen, setAuthOpen] = useState(null); // null | 'signin' | 'signup'
  // The feed is what the Community tab opens on. It is the answer to "what is
  // happening on Kun?", and it is the one section that has something in it for
  // somebody who joined five minutes ago and knows nobody.
  const [socialSection, setSocialSection] = useState('feed');
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewingUserId, setViewingUserId] = useState(null);
  // Set when 'Challenge' is tapped on someone's profile, so the create sheet
  // opens with them already chosen.
  const [presetOpponent, setPresetOpponent] = useState(null);
  const [unread, setUnread] = useState(0);
  // Bumped whenever something social changes, so open panels reload without
  // each of them holding its own polling timer.
  const [socialRefresh, setSocialRefresh] = useState(0);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const { settings, updateSettings, settingsLoaded } = useSettings();
  const workout = useWorkout();
  const auth = useAuth();
  const profileState = useProfile({
    userId: auth.userId,
    signedIn: auth.signedIn,
    workouts: workout.workouts
  });
  const toast = useToast();

  // One feed instance for the whole app, so the Today preview and the Community
  // tab read the same rows, share one poll, and can never disagree about what
  // happened.
  const feed = useFeed('global', { enabled: auth.signedIn && auth.cloudConfigured });

  // The lift the resume pill names: the last one you touched, which is what
  // "where was I?" actually means.
  const currentExerciseName = useMemo(() => {
    const a = workout.active;
    if (!a) return null;
    const touched = [...(a.sets || [])]
      .filter((s) => s.completedAt)
      .sort((x, y) => y.completedAt - x.completedAt)[0];
    const id = touched?.exerciseId || a.exercises?.[0];
    return workout.exercises.find((e) => e.id === id)?.name || null;
  }, [workout.active, workout.exercises]);

  const restTimer = useRestTimer({
    onComplete: () => {
      if (settings.vibrationEnabled && navigator.vibrate) { try { navigator.vibrate([120, 40, 120]); } catch {} }
      if (settings.soundEnabled) {
        try { playBeep(); } catch {}
      }
      toast('Rest done — next set', { tone: 'success' });
    }
  });

  // Initialize IDB, seed defaults, optionally seed sample data in dev.
  //
  // useWorkout() starts its own first read the moment it mounts, which races
  // this: on a genuinely first launch it can read an empty database, mark
  // itself loaded, and then never look again — so the exercise library and any
  // seeded history stay invisible until the next reload. Refreshing once after
  // initialisation completes closes that window.
  useEffect(() => {
    (async () => {
      try {
        await ensureInitialized();
        if (import.meta.env.DEV) await maybeSeed();
        await workout.refresh();
        setDbReady(true);
      } catch (err) {
        console.error(err);
        setDbError(err.message || String(err));
      }
    })();
    // Intentionally once: this is app boot, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!auth.signedIn) { setUnread(0); return; }
    try { setUnread(await unreadCount()); } catch { /* offline: keep last count */ }
  }, [auth.signedIn]);

  useEffect(() => {
    refreshUnread();
    const onFocus = () => refreshUnread();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshUnread]);

  const onSocialChanged = useCallback(() => {
    setSocialRefresh((n) => n + 1);
    refreshUnread();
  }, [refreshUnread]);

  const onFinishToast = useCallback((w) => {
    if (!w) return;
    const sets = w.sets.filter((s) => s.completed).length;
    toast(`Workout saved · ${sets} sets`, { tone: 'success' });
    // Fire-and-forget: the workout is already in IndexedDB. If this fails or the
    // phone is offline, the summary sits in the outbox until the next flush —
    // the person logging sets never sees a spinner or an error for it.
    if (auth.signedIn) {
      // publish() ends in sync(), which reports into live challenges itself.
      profileState.publish(w)
        .then(() => onSocialChanged())
        // Rate-limited to once a day inside maybeAutoBackup, and last in the
        // chain so a backup failure cannot stop stats or challenge progress.
        .then(() => maybeAutoBackup(auth.userId))
        .catch(() => {});
    }
  }, [toast, auth.signedIn, auth.userId, profileState, onSocialChanged]);

  if (dbError) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center text-center">
        <h1 className="text-lg font-bold text-danger mb-2">Storage unavailable</h1>
        <p className="text-sm text-muted max-w-sm">
          {dbError}. Private-browsing mode disables IndexedDB on some browsers. Try a normal browser window.
        </p>
      </div>
    );
  }

  if (!dbReady || !settingsLoaded || !workout.loaded || !auth.authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-muted border-t-accent animate-spin" />
      </div>
    );
  }

  if (authOpen) {
    return (
      <div className="min-h-screen flex flex-col safe-top">
        <main className="max-w-lg w-full mx-auto flex-1">
          <AuthScreen
            auth={auth}
            initialMode={authOpen}
            onBack={() => setAuthOpen(null)}
            onSignedIn={() => {
              setAuthOpen(null);
              setTab('social');
              toast('Signed in', { tone: 'success' });
            }}
          />
        </main>
      </div>
    );
  }

  // A signed-in user with no profile row yet must claim a username before
  // anything social works. Blocking here rather than scattering null-checks
  // through every social screen.
  if (auth.signedIn && profileState.needsSetup) {
    return (
      <div className="min-h-screen flex flex-col safe-top">
        <main className="max-w-lg w-full mx-auto flex-1">
          <ProfileSetup
            userId={auth.userId}
            defaultDisplayName={(auth.user?.email || '').split('@')[0]}
            onDone={async (p) => {
              profileState.setProfile(p);
              await profileState.reloadProfile();
              await profileState.publish().catch(() => {});
              setTab('social');
              toast('Welcome to Kun Workouts', { tone: 'success' });
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col safe-top">
      <AppHeader
        signedIn={auth.signedIn}
        profile={profileState.profile}
        cloudConfigured={auth.cloudConfigured}
        onAccountTap={() => {
          setViewingUserId(null);
          auth.signedIn ? setProfileOpen(true) : setAuthOpen('signin');
        }}
      />

      <main className="max-w-lg w-full mx-auto flex-1 pb-nav">
        {viewingUserId ? (
          <UserProfile
            targetId={viewingUserId}
            myId={auth.userId}
            onBack={() => setViewingUserId(null)}
            workouts={workout.workouts}
            exercises={workout.exercises}
            onChanged={onSocialChanged}
            onChallenge={(p) => {
              setPresetOpponent(p);
              setViewingUserId(null);
              setSocialSection('challenges');
              setTab('social');
            }}
          />
        ) : profileOpen ? (
          <ProfileScreen
            profileState={profileState}
            workouts={workout.workouts}
            exercises={workout.exercises}
            auth={auth}
          />
        ) : (
        <>
        {inSession && workout.active ? (
          <WorkoutScreen
            workout={workout}
            settings={settings}
            restTimer={restTimer}
            onFinishToast={onFinishToast}
            onExit={() => setInSession(false)}
          />
        ) : (
        <>
        {tab === 'today' && (
          <TodayScreen
            workout={workout}
            settings={settings}
            auth={auth}
            profile={profileState.profile}
            feed={feed}
            onResume={() => setInSession(true)}
            onOpenCommunity={() => { setSocialSection('feed'); setTab('social'); }}
            onOpenProfile={(id) => setViewingUserId(id)}
          />
        )}
        {tab === 'history' && <HistoryScreen workout={workout} />}
        {tab === 'progress' && <ProgressScreen workout={workout} />}
        {tab === 'social' && (
          <SocialScreen
            auth={auth}
            onSignUp={() => setAuthOpen('signup')}
            onSignIn={() => setAuthOpen('signin')}
            section={socialSection}
            onSectionChange={setSocialSection}
            onOpenProfile={(id) => setViewingUserId(id)}
            exercises={workout.exercises}
            workouts={workout.workouts}
            presetOpponent={presetOpponent}
            onPresetUsed={() => setPresetOpponent(null)}
            unread={unread}
            onUnreadChange={onSocialChanged}
            refreshToken={socialRefresh}
            profile={profileState.profile}
            feed={feed}
            onOpenSettings={() => { setViewingUserId(null); setProfileOpen(true); }}
          />
        )}
        {tab === 'settings' && <SettingsScreen settings={settings} updateSettings={updateSettings} workout={workout} auth={auth} onSignIn={() => setAuthOpen('signin')} />}
        </>
        )}
        </>
        )}
      </main>

      {/* Above the tab bar on EVERY tab while a session is live, so wandering
          off to check the leaderboard mid-workout is never a one-way trip. */}
      {workout.active && !inSession && (
        <ResumePill
          splitName={workout.active.split ? splitLabel(workout.active.split) : null}
          currentExercise={currentExerciseName}
          startedAt={workout.active.startTime}
          onResume={() => { setProfileOpen(false); setViewingUserId(null); setInSession(true); }}
        />
      )}

      <TabBar
        current={inSession || profileOpen ? null : tab}
        onChange={(t) => { setProfileOpen(false); setViewingUserId(null); setInSession(false); setTab(t); }}
        workoutActive={!!workout.active}
        badges={{ social: unread }}
      />
    </div>
  );
}

// Minimal beep via WebAudio. iOS Safari needs a prior user gesture — starting/completing sets counts.
let audioCtx = null;
function playBeep() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') { audioCtx.resume().catch(() => {}); }
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = 880;
  o.type = 'sine';
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.36);
}
