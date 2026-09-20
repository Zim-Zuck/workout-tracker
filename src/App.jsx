import { useCallback, useEffect, useState } from 'react';
import Navigation from './components/Navigation.jsx';
import RestTimer from './components/RestTimer.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import WorkoutScreen from './pages/WorkoutScreen.jsx';
import HistoryScreen from './pages/History.jsx';
import ProgressScreen from './pages/Progress.jsx';
import SocialScreen from './pages/Social.jsx';
import AuthScreen from './pages/Auth.jsx';
import ProfileScreen from './pages/Profile.jsx';
import ProfileSetup from './pages/ProfileSetup.jsx';
import FriendProfile from './pages/FriendProfile.jsx';
import SettingsScreen from './pages/Settings.jsx';
import AppHeader from './components/AppHeader.jsx';
import { useSettings } from './hooks/useSettings.js';
import { useAuth } from './hooks/useAuth.js';
import { useProfile } from './hooks/useProfile.js';
import { unreadCount } from './services/friendsApi.js';
import { maybeAutoBackup } from './services/backupApi.js';
import { useWorkout } from './hooks/useWorkout.js';
import { useRestTimer } from './hooks/useRestTimer.js';
import { ensureInitialized } from './db/database.js';
import { maybeSeed } from './db/seedData.js';

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const [tab, setTab] = useState('workout');
  // Auth is shown as an overlay rather than a tab: it is a detour, and you should
  // land back exactly where you were when you finish or back out.
  const [authOpen, setAuthOpen] = useState(null); // null | 'signin' | 'signup'
  const [socialSection, setSocialSection] = useState('friends');
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewingFriendId, setViewingFriendId] = useState(null);
  // Set when 'Challenge' is tapped on a friend's profile, so the create sheet
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
  useEffect(() => {
    (async () => {
      try {
        await ensureInitialized();
        if (import.meta.env.DEV) await maybeSeed();
        setDbReady(true);
      } catch (err) {
        console.error(err);
        setDbError(err.message || String(err));
      }
    })();
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
          setViewingFriendId(null);
          auth.signedIn ? setProfileOpen(true) : setAuthOpen('signin');
        }}
      />

      <main className="max-w-lg w-full mx-auto flex-1 pb-nav">
        {viewingFriendId ? (
          <FriendProfile
            targetId={viewingFriendId}
            myId={auth.userId}
            onBack={() => setViewingFriendId(null)}
            workouts={workout.workouts}
            exercises={workout.exercises}
            settings={settings}
            onChanged={onSocialChanged}
            onChallenge={(p) => {
              setPresetOpponent(p);
              setViewingFriendId(null);
              setSocialSection('challenges');
              setTab('social');
            }}
          />
        ) : profileOpen ? (
          <ProfileScreen
            profileState={profileState}
            workouts={workout.workouts}
            exercises={workout.exercises}
            settings={settings}
            auth={auth}
          />
        ) : (
        <>
        {tab === 'workout' && (
          <WorkoutScreen
            workout={workout}
            settings={settings}
            restTimer={restTimer}
            onFinishToast={onFinishToast}
          />
        )}
        {tab === 'history' && <HistoryScreen workout={workout} settings={settings} />}
        {tab === 'progress' && <ProgressScreen workout={workout} settings={settings} />}
        {tab === 'social' && (
          <SocialScreen
            auth={auth}
            onSignUp={() => setAuthOpen('signup')}
            onSignIn={() => setAuthOpen('signin')}
            section={socialSection}
            onSectionChange={setSocialSection}
            onOpenProfile={(id) => setViewingFriendId(id)}
            exercises={workout.exercises}
            workouts={workout.workouts}
            settings={settings}
            presetOpponent={presetOpponent}
            onPresetUsed={() => setPresetOpponent(null)}
            unread={unread}
            onUnreadChange={onSocialChanged}
            refreshToken={socialRefresh}
          />
        )}
        {tab === 'settings' && <SettingsScreen settings={settings} updateSettings={updateSettings} workout={workout} auth={auth} onSignIn={() => setAuthOpen('signin')} />}
        </>
        )}
      </main>

      <RestTimer
        remainingSec={restTimer.remainingSec}
        running={restTimer.running}
        onAdd={restTimer.add}
        onSub={restTimer.sub}
        onSkip={restTimer.stop}
      />

      <Navigation
        current={profileOpen ? null : tab}
        onChange={(t) => { setProfileOpen(false); setViewingFriendId(null); setTab(t); }}
        workoutActive={!!workout.active}
        socialBadge={unread}
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
