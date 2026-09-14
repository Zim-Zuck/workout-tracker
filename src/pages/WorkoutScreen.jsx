import { useEffect, useMemo, useState } from 'react';
import { Play, Square, Plus, Search, Undo2, Timer } from 'lucide-react';
import ExerciseCard from '../components/ExerciseCard.jsx';
import Modal from '../components/Modal.jsx';
import ShareCard from '../components/ShareCard.jsx';
import { useToast, useHaptic } from '../components/Toast.jsx';
import { formatDuration } from '../utils/date.js';

export default function WorkoutScreen({ workout, settings, restTimer, onFinishToast }) {
  const {
    exercises, active, workouts,
    startWorkout, finishWorkout, cancelWorkout,
    addExerciseToActive, removeExerciseFromActive, reorderExercises, replaceExercise,
    addSet, updateSet, deleteSet, undo, canUndo, renameWorkout, setNotes
  } = workout;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceFor, setReplaceFor] = useState(null); // exerciseId being replaced
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [shareFor, setShareFor] = useState(null); // finished workout to share
  const [now, setNow] = useState(Date.now());
  const toast = useToast();
  const haptic = useHaptic();

  // Tick for the elapsed-time badge (1s).
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const shareCardEl = (
    <ShareCard
      open={!!shareFor}
      workout={shareFor}
      workouts={workouts}
      exercises={exercises}
      unit={settings.unit}
      onClose={() => setShareFor(null)}
    />
  );

  if (!active) {
    return (
      <>
        <div className="p-4 flex flex-col items-center justify-center min-h-[70vh] text-center">
          <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
            <Play size={28} className="text-accent" />
          </div>
          <div className="text-[11px] tracking-[0.2em] font-semibold text-muted mb-1">KUN WORKOUTS</div>
          <h1 className="text-xl font-bold">Ready to lift?</h1>
          <p className="text-muted text-sm mt-2 max-w-xs">
            Start a workout to log sets, track PRs, and get progression targets for next time.
          </p>
          <button
            onClick={async () => { await startWorkout(defaultName()); haptic(); }}
            className="mt-6 h-12 px-6 rounded-xl bg-accent text-white font-semibold flex items-center gap-2 active:opacity-80"
          >
            <Play size={18} /> Start Workout
          </button>
        </div>
        {shareCardEl}
      </>
    );
  }

  const elapsed = now - active.startTime;

  return (
    <div className="p-3 space-y-3">
      <div className="bg-surface border border-border rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <input
            aria-label="Workout name"
            value={active.name}
            onChange={(e) => renameWorkout(e.target.value)}
            className="flex-1 bg-transparent text-lg font-semibold outline-none"
          />
          <div className="flex items-center gap-1 text-xs text-muted">
            <Timer size={14} /> {formatDuration(elapsed)}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted">
          <span>{active.exercises.length} exercises</span>
          <span>·</span>
          <span>{active.sets.filter((s) => s.completed).length} sets done</span>
        </div>
      </div>

      {active.exercises.map((exId, idx) => {
        const ex = exercises.find((e) => e.id === exId);
        if (!ex) {
          return (
            <div key={exId} className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
              Missing exercise (id: {exId}).
              <button className="ml-2 underline" onClick={() => removeExerciseFromActive(exId)}>Remove</button>
            </div>
          );
        }
        const sets = active.sets.filter((s) => s.exerciseId === exId).sort((a, b) => a.timestamp - b.timestamp);
        return (
          <ExerciseCard
            key={exId}
            exercise={ex}
            activeSets={sets}
            history={workouts}
            unit={settings.unit}
            index={idx}
            totalCount={active.exercises.length}
            onAddSet={(seed) => addSet(exId, seed)}
            onUpdateSet={updateSet}
            onCompleteSet={async (s) => {
              const nowCompleted = !s.completed;
              await updateSet(s.id, { completed: nowCompleted, timestamp: Date.now() });
              haptic();
              // Start rest timer when marking a working (non-warmup) set complete.
              if (nowCompleted && s.type !== 'warmup') {
                const restSec = ex.defaultRestSec || settings.defaultRestSec || 120;
                restTimer.start(restSec);
              }
            }}
            onDeleteSet={(id) => { deleteSet(id); toast('Set deleted. Tap Undo to restore.'); }}
            onRemoveExercise={() => { removeExerciseFromActive(exId); toast('Exercise removed. Tap Undo to restore.'); }}
            onMoveUp={() => reorderExercises(idx, idx - 1)}
            onMoveDown={() => reorderExercises(idx, idx + 1)}
            onReplace={() => setReplaceFor(exId)}
          />
        );
      })}

      <button
        onClick={() => setPickerOpen(true)}
        className="w-full h-12 rounded-2xl border border-dashed border-border text-muted flex items-center justify-center gap-2 active:bg-card"
      >
        <Plus size={18} /> Add exercise
      </button>

      <textarea
        aria-label="Workout notes"
        value={active.notes || ''}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full bg-surface border border-border rounded-2xl p-3 text-sm outline-none focus:border-accent min-h-[80px]"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="flex-1 h-12 rounded-xl border border-border text-text disabled:opacity-40 active:bg-card flex items-center justify-center gap-2"
        >
          <Undo2 size={16} /> Undo
        </button>
        <button
          onClick={() => setConfirmFinish(true)}
          className="flex-1 h-12 rounded-xl bg-success text-white font-semibold active:opacity-80 flex items-center justify-center gap-2"
        >
          <Square size={16} /> Finish
        </button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        exercises={exercises}
        exclude={active.exercises}
        onPick={(id) => { addExerciseToActive(id); setPickerOpen(false); }}
      />

      <ExercisePicker
        open={!!replaceFor}
        onClose={() => setReplaceFor(null)}
        exercises={exercises}
        exclude={active.exercises.filter((e) => e !== replaceFor)}
        title="Replace with…"
        onPick={(id) => { replaceExercise(replaceFor, id); setReplaceFor(null); }}
      />

      <Modal
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title="Finish workout?"
        footer={
          <div className="flex gap-2">
            <button
              onClick={async () => { await cancelWorkout(); setConfirmFinish(false); toast('Workout cancelled', { tone: 'error' }); }}
              className="flex-1 h-11 rounded-xl border border-danger/60 text-danger active:bg-danger/10"
            >
              Cancel workout
            </button>
            <button
              onClick={async () => {
                const w = await finishWorkout();
                setConfirmFinish(false);
                restTimer.stop();
                onFinishToast?.(w);
                if (w) setShareFor(w);
              }}
              className="flex-1 h-11 rounded-xl bg-success text-white font-semibold active:opacity-80"
            >
              Finish
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          {active.sets.filter((s) => s.completed).length} completed sets across {active.exercises.length} exercises
          over {formatDuration(elapsed)}.
        </p>
      </Modal>

      {shareCardEl}
    </div>
  );
}

function defaultName() {
  const d = new Date();
  const h = d.getHours();
  const period = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  return `${period} Workout`;
}

function ExercisePicker({ open, onClose, exercises, exclude = [], onPick, title = 'Add exercise' }) {
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    const list = exercises
      .filter((e) => !exclude.includes(e.id))
      .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()) || (e.muscleGroups || []).join(' ').toLowerCase().includes(q.toLowerCase()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, exclude, q]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises"
          className="w-full h-11 pl-9 pr-3 rounded-xl bg-card border border-border outline-none focus:border-accent text-sm"
        />
      </div>
      <ul className="divide-y divide-border">
        {options.map((ex) => (
          <li key={ex.id}>
            <button
              onClick={() => onPick(ex.id)}
              className="w-full text-left py-3 flex items-center justify-between active:bg-card px-2 rounded-lg"
            >
              <div>
                <div className="text-sm font-medium">{ex.name}</div>
                <div className="text-xs text-muted">{(ex.muscleGroups || []).join(' · ')}</div>
              </div>
              <Plus size={16} className="text-muted" />
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="text-center text-muted text-sm py-8">No matches</li>}
      </ul>
    </Modal>
  );
}
