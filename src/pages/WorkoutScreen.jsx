import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUp, ArrowDown, Repeat, SkipForward, Trash2, Plus, X, Timer, StickyNote
} from 'lucide-react';
import {
  GlassCard, ExerciseCard, SetRow, PrimaryButton, SecondaryButton, TextLink,
  BottomSheet, SheetAction, useUndoToast, EmptyState
} from '../ui/index.js';
import WheelPicker from '../components/WheelPicker.jsx';
import ExercisePickerSheet from '../components/ExercisePickerSheet.jsx';
import ShareCard from '../components/ShareCard.jsx';
import ExerciseLibrarySheet from '../components/ExerciseLibrarySheet.jsx';
import { useHaptic } from '../components/Toast.jsx';
import { setLabels } from '../db/normalize.js';
import { previousPerformance, summarizeSets, isWorking } from '../services/calculations.js';
import { sessionPRForExercise } from '../services/prs.js';
import { recommend } from '../services/progression.js';
import { alternativesFor } from '../services/sessionBuilder.js';
import { splitLabel } from '../services/splits.js';
import { formatWeight, roundDisplay } from '../utils/units.js';
import { formatDuration } from '../utils/date.js';

const SET_TYPES = [
  { type: 'working', label: 'Working set', hint: 'Counts toward volume and PRs.' },
  { type: 'warmup', label: 'Warm-up', hint: 'Excluded from volume and PR calculations.' },
  { type: 'drop', label: 'Drop set', hint: 'Counts toward volume.' },
  { type: 'failure', label: 'To failure', hint: 'Counts, and tells the next session to hold the weight.' }
];

// THE ACTIVE SESSION.
//
// Everything destructive here is one tap and an undo toast. There is not a
// single confirmation dialog on this screen, including cancelling the whole
// workout — a dialog asks you to predict whether you will regret something,
// which is a worse deal than letting you find out and take it back.
export default function WorkoutScreen({ workout, settings, restTimer, onFinishToast, onExit }) {
  const {
    exercises, active, workouts, setsFor,
    finishWorkout, cancelWorkout, restoreCancelled,
    addExerciseToActive, removeExerciseFromActive, restoreRemovedExercise,
    skipExercise, unskipExercise, reorderExercises, replaceExercise, updateExercise,
    addSet, updateSet, toggleSetComplete, deleteSet, restoreSet, setNotes
  } = workout;

  const [menuFor, setMenuFor] = useState(null);      // exerciseId -> ⋮ sheet
  const [setSheet, setSetSheet] = useState(null);     // one set -> ⋯ sheet
  const [replaceFor, setReplaceFor] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [picker, setPicker] = useState(null);         // { setId, field, ... }
  const [finishing, setFinishing] = useState(false);
  const [shareFor, setShareFor] = useState(null);
  const [now, setNow] = useState(Date.now());
  const undo = useUndoToast();
  const haptic = useHaptic();

  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

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
      onClose={() => setShareFor(null)}
    />
  );

  if (!active) {
    return (
      <>
        <EmptyState
          icon={Timer}
          title="No session in progress"
          body="Head back to Today to start one — your split is already picked and the weights are already loaded."
          action={<SecondaryButton onClick={onExit}>Go to Today</SecondaryButton>}
        />
        {shareCardEl}
      </>
    );
  }

  const elapsed = now - active.startTime;
  const title = active.split ? splitLabel(active.split) : (active.name || 'Workout');
  const completedSets = active.sets.filter((s) => s.completed && s.type !== 'warmup').length;
  const totalSets = active.sets.filter((s) => s.type !== 'warmup').length;
  const skipped = active.skipped || [];

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const w = await finishWorkout();
      restTimer.stop();
      onFinishToast?.(w);
      if (w) setShareFor(w);
      onExit?.();
    } finally { setFinishing(false); }
  };

  return (
    <div className="px-base pb-nav">
      {/* Header.
          Sticky, because it carries the rest countdown and the Finish button —
          the two things you need while your thumb is somewhere down the list of
          exercises. This replaced a separate floating rest bar that overlapped
          the set rows it was timing. */}
      <GlassCard className="sticky top-sm z-20 mt-md p-base glass-blur">
        <div className="flex items-center gap-md">
          <div className="flex-1 min-w-0">
            <h1 className="text-title font-semibold text-ink truncate">{title}</h1>
            <p className="text-label font-regular text-ink-secondary mt-xxs tabular">
              {active.exercises.length - skipped.length} exercises ·{' '}
              {completedSets} of {totalSets} sets · {formatDuration(elapsed)}
            </p>
          </div>
          <PrimaryButton onClick={handleFinish} loading={finishing} className="shrink-0">
            Finish
          </PrimaryButton>
        </div>

        {restTimer.running && (
          <div className="mt-md flex items-center gap-sm">
            <span className="flex-1 flex items-center gap-sm text-label font-semibold text-done tabular">
              <Timer size={15} strokeWidth={2.2} />
              Rest {mmss(restTimer.remainingSec)}
            </span>
            <button type="button" onClick={restTimer.sub}
              className="w-tap h-9 rounded-full text-label font-semibold text-ink-secondary active:bg-glass-pressed">−15</button>
            <button type="button" onClick={restTimer.add}
              className="w-tap h-9 rounded-full text-label font-semibold text-ink-secondary active:bg-glass-pressed">+15</button>
            <button type="button" onClick={restTimer.stop}
              className="px-md h-9 rounded-full text-label font-semibold text-ink active:bg-glass-pressed">Skip</button>
          </div>
        )}
      </GlassCard>

      {/* Exercises --------------------------------------------------------- */}
      <div className="mt-base flex flex-col gap-sm">
        {active.exercises.map((exId, idx) => {
          const ex = exerciseMap.get(exId);
          if (!ex) {
            return (
              <GlassCard key={exId} className="p-base border-danger-border bg-danger-soft">
                <p className="text-label font-regular text-danger">
                  Missing exercise ({exId}).{' '}
                  <TextLink tone="danger" onClick={() => removeExerciseFromActive(exId)}>Remove</TextLink>
                </p>
              </GlassCard>
            );
          }

          const sets = setsFor(exId);
          const labelled = setLabels(sets);
          const prev = previousPerformance(exId, workouts);
          const rec = recommend({ exercise: ex, workoutHistory: workouts });
          const pr = sessionPRForExercise(exId, active.sets, workouts);

          return (
            <ExerciseCard
              key={exId}
              exercise={ex}
              skipped={skipped.includes(exId)}
              sets={sets}
              prevLine={prev ? summarizeSets(prev.sets, formatWeight) : 'No previous data'}
              targetLine={rec.targetWeightKg > 0
                ? `${formatWeight(rec.targetWeightKg)} × ${rec.targetRepsLow}–${rec.targetRepsHigh}`
                : `${rec.targetRepsLow}–${rec.targetRepsHigh} reps`}
              prs={pr ? [{ kind: pr.kind, value: pr.unit === 'kg' ? formatWeight(pr.value) : `${pr.value}` }] : []}
              renderSet={(s) => {
                const l = labelled.find((x) => x.set.id === s.id);
                const prevSet = prev?.sets?.[(l?.number || 1) - 1] || null;
                return {
                  number: l?.number ?? null,
                  set: s,
                  weightLabel: formatNum(roundDisplay(s.weightKg)),
                  repsLabel: String(s.reps),
                  placeholderWeight: prevSet ? formatNum(roundDisplay(prevSet.weightKg)) : null,
                  placeholderReps: prevSet ? String(prevSet.reps) : null,
                  onEditWeight: () => setPicker({ setId: s.id, field: 'weight', set: s, exercise: ex, number: l?.number }),
                  onEditReps: () => setPicker({ setId: s.id, field: 'reps', set: s, exercise: ex, number: l?.number }),
                  onToggleComplete: async () => {
                    const next = await toggleSetComplete(s.id);
                    haptic();
                    if (next?.completed && next.type !== 'warmup') {
                      restTimer.start(ex.defaultRestSec || settings.defaultRestSec || 120);
                    }
                  },
                  onOpenMenu: () => setSetSheet({ set: s, exercise: ex, number: l?.number, tag: l?.tag })
                };
              }}
              onAddSet={() => {
                const last = sets[sets.length - 1];
                addSet(exId, last
                  ? { weightKg: last.weightKg, reps: last.reps, type: last.type === 'warmup' ? 'working' : last.type }
                  : { weightKg: rec.targetWeightKg, reps: rec.targetRepsLow, type: 'working' });
              }}
              onOpenMenu={() => setMenuFor(exId)}
              onSkip={async () => {
                await skipExercise(exId);
                haptic();
                undo(`${ex.name} skipped`, { onUndo: () => unskipExercise(exId) });
              }}
              onRestore={() => unskipExercise(exId)}
            />
          );
        })}
      </div>

      <SecondaryButton full icon={Plus} className="mt-md" onClick={() => setPickerOpen(true)}>
        Add exercise
      </SecondaryButton>

      <div className="mt-md flex items-center justify-between gap-sm">
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="inline-flex items-center gap-xs min-h-tap px-sm -ml-sm rounded-full
                     text-label font-semibold text-ink-secondary active:text-ink"
        >
          <StickyNote size={15} strokeWidth={2.2} />
          {active.notes ? 'Notes added' : 'Add notes'}
        </button>

        {/* Cancel is undoable, so it needs no dialog and no red button shouting
            at somebody who is just tidying up. */}
        <TextLink
          tone="danger"
          onClick={async () => {
            const w = await cancelWorkout();
            onExit?.();
            undo(`${title} cancelled · ${completedSets} sets`, {
              tone: 'danger',
              onUndo: () => restoreCancelled()
            });
          }}
        >
          Cancel workout
        </TextLink>
      </div>

      {/* ⋮ exercise sheet --------------------------------------------------- */}
      <ExerciseMenuSheet
        exerciseId={menuFor}
        exercise={menuFor ? exerciseMap.get(menuFor) : null}
        index={menuFor ? active.exercises.indexOf(menuFor) : -1}
        total={active.exercises.length}
        skipped={menuFor ? skipped.includes(menuFor) : false}
        onClose={() => setMenuFor(null)}
        onMoveUp={(id) => { reorderExercises(active.exercises.indexOf(id), active.exercises.indexOf(id) - 1); setMenuFor(null); }}
        onMoveDown={(id) => { reorderExercises(active.exercises.indexOf(id), active.exercises.indexOf(id) + 1); setMenuFor(null); }}
        onReplace={(id) => { setMenuFor(null); setReplaceFor(id); }}
        onSkip={async (id) => {
          const name = exerciseMap.get(id)?.name || 'Exercise';
          setMenuFor(null);
          await skipExercise(id);
          undo(`${name} skipped`, { onUndo: () => unskipExercise(id) });
        }}
        onUnskip={(id) => { unskipExercise(id); setMenuFor(null); }}
        onRemove={async (id) => {
          const name = exerciseMap.get(id)?.name || 'Exercise';
          setMenuFor(null);
          const snapshot = await removeExerciseFromActive(id);
          undo(`${name} removed${snapshot?.sets.length ? ` · ${snapshot.sets.length} sets` : ''}`, {
            tone: 'danger',
            onUndo: () => restoreRemovedExercise(snapshot)
          });
        }}
      />

      {/* ⋯ set sheet -------------------------------------------------------- */}
      <BottomSheet
        open={!!setSheet}
        onClose={() => setSetSheet(null)}
        title={setSheet ? `${setSheet.exercise.name} · set ${setSheet.number || setSheet.tag}` : ''}
        description="Warm-ups are excluded from volume and PR calculations."
      >
        {SET_TYPES.map((t) => (
          <SheetAction
            key={t.type}
            label={t.label}
            hint={t.hint}
            tone={setSheet?.set.type === t.type ? 'neutral' : 'neutral'}
            onClick={() => { updateSet(setSheet.set.id, { type: t.type }); setSetSheet(null); }}
          />
        ))}
        <div className="border-t border-hairline mt-sm pt-sm">
          <SheetAction
            icon={Trash2}
            tone="danger"
            label="Delete set"
            onClick={async () => {
              const s = setSheet.set;
              setSetSheet(null);
              const removed = await deleteSet(s.id);
              undo('Set deleted', { tone: 'danger', onUndo: () => restoreSet(removed) });
            }}
          />
        </div>
      </BottomSheet>

      {/* Replace — 3 suggestions, then the library ------------------------ */}
      <ExercisePickerSheet
        open={!!replaceFor}
        onClose={() => setReplaceFor(null)}
        exercises={exercises}
        exclude={active.exercises}
        splitId={active.split}
        title="Replace with"
        suggestions={replaceFor
          ? alternativesFor(exerciseMap.get(replaceFor), active.split,
              { exercises, workouts, exclude: active.exercises })
          : []}
        onPick={async (ex) => {
          const oldName = exerciseMap.get(replaceFor)?.name || 'Exercise';
          const target = recommend({ exercise: ex, workoutHistory: workouts });
          const res = await replaceExercise(replaceFor, ex.id, target);
          setReplaceFor(null);
          // Logged sets are never reassigned to a different lift — they stay
          // attributed to what was actually performed, and the user is told.
          undo(res.kept
            ? `${ex.name} added · your ${res.keptCount} logged ${oldName} sets were kept`
            : `Replaced with ${ex.name}`);
        }}
        onManage={() => { setReplaceFor(null); setLibraryOpen(true); }}
      />

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        exercises={exercises}
        exclude={active.exercises}
        splitId={active.split}
        title="Add exercise"
        onPick={(ex) => {
          addExerciseToActive(ex.id, 3, recommend({ exercise: ex, workoutHistory: workouts }));
          setPickerOpen(false);
        }}
        onManage={() => { setPickerOpen(false); setLibraryOpen(true); }}
      />

      <BottomSheet open={notesOpen} onClose={() => setNotesOpen(false)} title="Session notes">
        <textarea
          autoFocus
          value={active.notes || ''}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did it feel?"
          className="w-full min-h-[120px] p-base rounded-card bg-glass-inset border border-glass-inset-border
                     text-body font-regular text-ink placeholder:text-ink-tertiary outline-none
                     focus:border-glass-border resize-none"
        />
      </BottomSheet>

      {picker && (
        <WheelPicker
          open
          title={`Set ${picker.number || ''} · ${picker.field === 'weight' ? 'Weight' : 'Reps'}`}
          value={picker.field === 'weight' ? roundDisplay(picker.set.weightKg) : picker.set.reps}
          min={0}
          max={picker.field === 'weight' ? 500 : 50}
          step={picker.field === 'weight' ? (picker.exercise.weightIncrement || 2.5) : 1}
          unit={picker.field === 'weight' ? 'kg' : ''}
          stepOptions={picker.field === 'weight' ? [1, 2.5, 5] : undefined}
          onStepChange={picker.field === 'weight'
            ? (inc) => updateExercise(picker.exercise.id, { weightIncrement: inc })
            : undefined}
          onCancel={() => setPicker(null)}
          onConfirm={(v) => {
            updateSet(picker.setId, picker.field === 'weight'
              ? { weightKg: v }
              : { reps: Math.max(0, Math.round(v)) });
            setPicker(null);
          }}
        />
      )}

      {shareCardEl}
      <ExerciseLibrarySheet open={libraryOpen} onClose={() => setLibraryOpen(false)} workout={workout} />
    </div>
  );
}

// The ⋮ menu. A SHEET, not a dropdown: the old menu rendered directly over the
// weight and reps columns it was asking you to make a decision about.
//
// Skip and Remove sit next to each other and look equally final, so each one
// says in a line what it actually does. Two destructive-looking options without
// that line is a trap.
function ExerciseMenuSheet({
  exerciseId, exercise, index, total, skipped,
  onClose, onMoveUp, onMoveDown, onReplace, onSkip, onUnskip, onRemove
}) {
  if (!exerciseId || !exercise) return null;
  return (
    <BottomSheet open onClose={onClose} title={exercise.name}>
      <SheetAction icon={ArrowUp} label="Move up" disabled={index <= 0} onClick={() => onMoveUp(exerciseId)} />
      <SheetAction icon={ArrowDown} label="Move down" disabled={index >= total - 1} onClick={() => onMoveDown(exerciseId)} />
      <SheetAction icon={Repeat} label="Replace exercise" hint="Anything already logged stays with the lift you actually did." onClick={() => onReplace(exerciseId)} />
      {skipped ? (
        <SheetAction icon={SkipForward} label="Un-skip" hint="Put this exercise back in the session." onClick={() => onUnskip(exerciseId)} />
      ) : (
        <SheetAction icon={SkipForward} label="Skip" hint="Costs you nothing — no effect on your streak, volume or completion." onClick={() => onSkip(exerciseId)} />
      )}
      <div className="border-t border-hairline mt-sm pt-sm">
        <SheetAction icon={Trash2} tone="danger" label="Remove from workout" hint="Deletes this exercise and every set logged for it." onClick={() => onRemove(exerciseId)} />
      </div>
    </BottomSheet>
  );
}

// A rest countdown is read in seconds, not rounded to minutes: "2:59" is
// information, "3m" is the same string for sixty seconds running.
function mmss(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatNum(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
