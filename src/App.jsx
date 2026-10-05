import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { TabBar, ResumePill, UndoToastProvider } from './ui/index.js';
import TodayScreen from './pages/Today.jsx';
import WorkoutScreen from './pages/WorkoutScreen.jsx';
import WorkoutSummary from './pages/WorkoutSummary.jsx';
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
import { startSyncEngine, stopSyncEngine } from './services/workoutSync.js';
import { useWorkout } from './hooks/useWorkout.js';
import { useRestTimer } from './hooks/useRestTimer.js';
import { useFeed } from './hooks/useFeed.js';
import { splitLabel } from './services/splits.js';
import { ensureInitialized, requestPersistentStorage, noteLaunchAndMaybeCleanBackup } from './db/database.js';
import { maybeSeed } from './db/seedData.js';
import RecoveryScreen from './pages/Recovery.jsx';

export default function App() {
  return (
    <BootErrorBoundary>
      <ToastProvider>
        <UndoToastProvider>
          <Root />
        </UndoToastProvider>
      </ToastProvider>
    </BootErrorBoundary>
  );
}

// A render that throws used to unmount the whole tree and leave a white screen,
// which is the worst possible outcome for somebody whose only copy of four years
// of training lives in this origin's IndexedDB. The boundary turns that into the
// recovery screen, which can still read and export the raw stores.
//
// It wraps OUTSIDE the providers on purpose: a provider is as capable of throwing
// as a screen is.
class BootErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('App crashed:', error, info); }
  render() {
    if (this.state.error) {
      return <RecoveryScreen error={this.state.error.message || String(this.state.error)} />;
    }
    return this.props.children;
  }
}

function Root() {
  // Today is the default home. 'workout' is no longer a tab — the active session
  // is a place you are sent to, from the hero or the resume pill, not a
  // destination you browse to while nothing is running.
  const [tab, setTab] = useState('today');
  const [inSession, setInSession] = useState(false);
  // The session that was just finished, held here rather than in WorkoutScreen
  // so that leaving the session does not unmount its own summary. This is the
  // state the old Finish handler was missing: it set a share sheet inside the
  // component it then unmounted, so nothing appeared.
  const [finished, setFinished] = useState(null);
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
        // Asked before the first write, so the browser's answer is in place
        // before there is anything to evict. Never awaited for correctness and
        // never allowed to fail boot — a denial is the normal answer on a first
        // visit, not an error. See DESIGN.md §12.
        requestPersistentStorage().then((r) => {
          if (!r.persisted) console.info('Storage is best-effort on this device, not persisted.');
        });
        await ensureInitialized();
        if (import.meta.env.DEV) await maybeSeed();
        await workout.refresh();
        setDbReady(true);
        // Housekeeping AFTER the app is up, so a clean launch is what counts as
        // a clean launch, and so nothing here can delay first paint. The
        // pre-upgrade snapshot is retired inside here once it has aged out and
        // the new build has proven itself on this device.
        noteLaunchAndMaybeCleanBackup().catch(() => {});
      } catch (err) {
        console.error(err);
        setDbError(err.message || String(err));
      }
    })();
    // Intentionally once: this is app boot, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE BACKGROUND SYNC ENGINE.
  //
  // Started once the database is up and left running for the life of the tab.
  // It sweeps IndexedDB for finished workouts the server does not have, drains
  // the outbox with persisted exponential backoff, and re-runs itself on
  // reconnect and on the app becoming visible again. The user id is passed as a
  // getter because it changes (sign-in, sign-out) and the engine outlives any
  // one value of it.
  //
  // Nothing here is on the Finish path. It is a sweeper, not a dependency.
  const userIdRef = useRef(auth.userId);
  userIdRef.current = auth.userId;
  useEffect(() => {
    if (!dbReady) return;
    startSyncEngine(() => userIdRef.current);
    return () => stopSyncEngine();
  }, [dbReady]);

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

  // Called once the workout is CONFIRMED saved on this device. Everything in
  // here is after-the-fact: a toast, the summary screen, and cloud work that is
  // explicitly fire-and-forget. None of it can fail in a way that affects
  // whether the session was saved.
  const onFinished = useCallback((w) => {
    if (!w) return;
    const sets = w.sets.filter((s) => s.completed).length;
    toast(`Workout saved · ${sets} sets`, { tone: 'success' });
    setFinished(w);
    setInSession(false);
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

  // A boot failure is a recovery screen, not a dead end: it names what happened,
  // says the data is untouched, and hands over an export that reads the raw
  // stores without going through anything that might be what failed.
  if (dbError) {
    return <RecoveryScreen error={dbError} blocked={/another tab|another window/i.test(dbError)} />;
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
        <main className="max-w-app w-full mx-auto flex-1">
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
        <main className="max-w-app w-full mx-auto flex-1">
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

      <main className="max-w-app w-full mx-auto flex-1 pb-nav">
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
            onFinished={onFinished}
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

      {/* The post-session summary. Rendered at the Root level, over whatever
          tab the user is now on, so finishing cannot unmount it. */}
      {finished && (
        <WorkoutSummary
          workout={finished}
          workouts={workout.workouts}
          exercises={workout.exercises}
          onDone={() => setFinished(null)}
        />
      )}

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
