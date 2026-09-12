import { useCallback, useEffect, useState } from 'react';
import Navigation from './components/Navigation.jsx';
import RestTimer from './components/RestTimer.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import WorkoutScreen from './pages/WorkoutScreen.jsx';
import HistoryScreen from './pages/History.jsx';
import ProgressScreen from './pages/Progress.jsx';
import ExerciseLibrary from './pages/ExerciseLibrary.jsx';
import SettingsScreen from './pages/Settings.jsx';
import { useSettings } from './hooks/useSettings.js';
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
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const { settings, updateSettings, settingsLoaded } = useSettings();
  const workout = useWorkout();
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

  const onFinishToast = useCallback((w) => {
    if (!w) return;
    const sets = w.sets.filter((s) => s.completed).length;
    toast(`Workout saved · ${sets} sets`, { tone: 'success' });
  }, [toast]);

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

  if (!dbReady || !settingsLoaded || !workout.loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-muted border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col safe-top">
      <main className="max-w-lg w-full mx-auto flex-1 pb-nav">
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
        {tab === 'exercises' && <ExerciseLibrary workout={workout} />}
        {tab === 'settings' && <SettingsScreen settings={settings} updateSettings={updateSettings} workout={workout} />}
      </main>

      <RestTimer
        remainingSec={restTimer.remainingSec}
        running={restTimer.running}
        onAdd={restTimer.add}
        onSub={restTimer.sub}
        onSkip={restTimer.stop}
      />

      <Navigation current={tab} onChange={setTab} workoutActive={!!workout.active} />
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
