import { useMemo, useState } from 'react';
import { Search, Trash2, SlidersHorizontal, ChevronRight, Share2, Check, X, MoreHorizontal } from 'lucide-react';
import {
  GlassCard, SegmentedTrack, BottomSheet, SheetAction, SetRow, SetRowHeader,
  PrimaryButton, SecondaryButton, TextLink, StatBlock, EmptyState, useUndoToast, Pill
} from '../ui/index.js';
import ShareCard from '../components/ShareCard.jsx';
import WheelPicker from '../components/WheelPicker.jsx';
import { orderedSets, setLabels } from '../db/normalize.js';
import { workoutTitle } from '../services/splits.js';
import { workingVolume, isWorking } from '../services/calculations.js';
import { formatDate, formatDuration, formatDateTime } from '../utils/date.js';
import { formatWeight, formatVolume, roundDisplay } from '../utils/units.js';

// HISTORY.
//
// Cards are titled by what was trained — "Pull", or "Chest · Shoulders" for a
// session that predates splits — with the time of day as the quiet second line.
// The old list led with "Afternoon Workout", which is the one thing about a
// session nobody is ever looking for.
export default function HistoryScreen({ workout }) {
  const { workouts, exercises, updateHistoricalWorkout, deleteHistoricalWorkout, restoreHistoricalWorkout, updateExercise } = workout;
  const [q, setQ] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [shareFor, setShareFor] = useState(null);
  const undo = useUndoToast();

  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const titled = useMemo(
    () => workouts.map((w) => ({ w, title: workoutTitle(w, exMap) })),
    [workouts, exMap]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return titled.filter(({ w, title }) => {
      if (needle) {
        const hay = `${title} ${w.name || ''} ${(w.exercises || []).map((id) => exMap.get(id)?.name || '').join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (exerciseFilter && !w.exercises.includes(exerciseFilter)) return false;
      return true;
    });
  }, [titled, q, exerciseFilter, exMap]);

  const opened = openId ? workouts.find((w) => w.id === openId) : null;

  const removeWorkout = async (w, title) => {
    setOpenId(null);
    const snapshot = await deleteHistoricalWorkout(w.id);
    // Deleting history is undoable, like everything else destructive in this
    // app. The old detail screen had a one-tap Delete behind a "this can't be
    // undone" panel; it can be, and now it is.
    undo(`${title} · ${formatDate(w.date)} deleted`, {
      tone: 'danger',
      onUndo: () => restoreHistoricalWorkout(snapshot)
    });
  };

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center gap-md pt-base">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-base top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search workouts"
            aria-label="Search workouts"
            className="w-full h-tap pl-4xl pr-base rounded-full bg-glass border border-glass-border
                       text-body font-regular text-ink placeholder:text-ink-tertiary outline-none
                       focus:border-focus"
          />
        </div>
        <Pill
          selected={!!exerciseFilter}
          onClick={() => setFilterOpen(true)}
          aria-label="Filter workouts"
        >
          <SlidersHorizontal size={16} strokeWidth={2.2} />
          Filter
        </Pill>
      </div>

      {!filtered.length && (
        <EmptyState
          icon={Search}
          title={workouts.length ? 'Nothing matches' : 'No workouts yet'}
          body={workouts.length
            ? 'Try a different search, or clear the filter.'
            : 'Finish a session and it shows up here, titled by what you trained.'}
          action={workouts.length
            ? <SecondaryButton onClick={() => { setQ(''); setExerciseFilter(''); }}>Clear</SecondaryButton>
            : null}
        />
      )}

      <ul className="mt-base flex flex-col gap-sm">
        {filtered.map(({ w, title }) => {
          const vol = workingVolume(w.sets);
          const dur = w.endTime ? w.endTime - w.startTime : 0;
          return (
            <li key={w.id}>
              <GlassCard
                as="button"
                interactive
                onClick={() => setOpenId(w.id)}
                className="w-full text-left p-base"
              >
                <div className="flex items-center gap-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-semibold text-ink truncate">{title}</p>
                    <p className="text-label font-regular text-ink-tertiary mt-xxs truncate tabular">
                      {formatDateTime(w.startTime || w.date)}
                      {dur ? ` · ${formatDuration(dur)}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-ink-tertiary shrink-0" />
                </div>
                <div className="mt-md flex items-center justify-between">
                  <StatBlock value={w.exercises.length} label="Exercises" />
                  <StatBlock value={w.sets.filter(isWorking).length} label="Sets" align="center" />
                  <StatBlock value={formatVolume(vol)} label="Volume" align="center" />
                </div>
              </GlassCard>
            </li>
          );
        })}
      </ul>

      <BottomSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter"
        footer={
          <SecondaryButton full onClick={() => { setExerciseFilter(''); setFilterOpen(false); }}>
            Clear filter
          </SecondaryButton>
        }
      >
        <ul>
          {[...exercises]
            .filter((e) => workouts.some((w) => w.exercises.includes(e.id)))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => { setExerciseFilter(e.id); setFilterOpen(false); }}
                  className="w-full min-h-tap px-md -mx-md rounded-row flex items-center justify-between gap-md
                             text-body font-regular text-ink text-left
                             transition-colors duration-fast ease-out active:bg-glass-pressed"
                >
                  {e.name}
                  {exerciseFilter === e.id && <Check size={17} className="text-done shrink-0" />}
                </button>
              </li>
            ))}
        </ul>
      </BottomSheet>

      {opened && (
        <WorkoutDetail
          key={opened.id}
          workout={opened}
          title={workoutTitle(opened, exMap)}
          exMap={exMap}
          onUpdateExercise={updateExercise}
          onClose={() => setOpenId(null)}
          onSave={async (w) => { await updateHistoricalWorkout(w); }}
          onDelete={(w, title) => removeWorkout(w, title)}
          onShare={() => setShareFor(opened)}
        />
      )}

      <ShareCard
        open={!!shareFor}
        workout={shareFor}
        workouts={workouts}
        exercises={exercises}
        onClose={() => setShareFor(null)}
      />
    </div>
  );
}

// The detail view.
//
// The title appears ONCE, at the top, as the sheet's own heading — it used to be
// both the sheet title and an editable field directly underneath, which read as
// a mistake. Share is a secondary action, and Delete has moved into the "···"
// menu with the same undo-toast semantics as everywhere else.
function WorkoutDetail({ workout, title, exMap, onUpdateExercise, onClose, onSave, onDelete, onShare }) {
  const [w, setW] = useState(workout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [picker, setPicker] = useState(null);

  const dur = w.endTime ? w.endTime - w.startTime : 0;
  const groupedIds = w.exercises.length ? w.exercises : [...new Set(w.sets.map((s) => s.exerciseId))];
  const updateSet = (id, patch) => setW({ ...w, sets: w.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={title}
        description={`${formatDateTime(w.startTime || w.date)}${dur ? ` · ${formatDuration(dur)}` : ''}`}
        footer={
          <div className="flex items-center gap-sm">
            <SecondaryButton icon={Share2} className="flex-1" onClick={onShare}>Share</SecondaryButton>
            <PrimaryButton className="flex-1" onClick={async () => { await onSave(w); onClose(); }}>Save</PrimaryButton>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="More options"
              className="w-tap h-tap shrink-0 rounded-full flex items-center justify-center
                         text-ink-tertiary transition-colors duration-fast ease-out
                         active:text-ink active:bg-glass-pressed"
            >
              <MoreHorizontal size={20} strokeWidth={2} />
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-md">
          {groupedIds.map((exId) => {
            const ex = exMap.get(exId);
            const rows = orderedSets(w.sets, exId);
            const labelled = setLabels(rows);
            return (
              <GlassCard key={exId} variant="inset" className="p-md">
                <p className="text-body font-semibold text-ink mb-sm">
                  {ex ? ex.name : `Deleted exercise (${exId.slice(0, 8)}…)`}
                </p>
                <SetRowHeader />
                {rows.map((s) => {
                  const l = labelled.find((x) => x.set.id === s.id);
                  return (
                    <SetRow
                      key={s.id}
                      number={l?.number ?? null}
                      set={s}
                      weightLabel={fmtNum(roundDisplay(s.weightKg))}
                      repsLabel={String(s.reps)}
                      onEditWeight={() => setPicker({ id: s.id, field: 'weight', set: s, ex })}
                      onEditReps={() => setPicker({ id: s.id, field: 'reps', set: s, ex })}
                      onToggleComplete={() => updateSet(s.id, { completed: !s.completed })}
                    />
                  );
                })}
                {!rows.length && <p className="py-sm text-label font-regular text-ink-tertiary">No sets</p>}
              </GlassCard>
            );
          })}
          {w.notes && (
            <p className="text-label font-regular text-ink-secondary whitespace-pre-wrap">{w.notes}</p>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={title}>
        <SheetAction
          label="Rename session"
          hint={w.name ? `Currently "${w.name}"` : 'Sessions are titled by what you trained.'}
          onClick={() => { setMenuOpen(false); setRenaming(true); }}
        />
        <div className="border-t border-hairline mt-sm pt-sm">
          <SheetAction
            icon={Trash2}
            tone="danger"
            label="Delete workout"
            hint="You get five seconds to undo it."
            onClick={() => { setMenuOpen(false); onDelete(w, title); }}
          />
        </div>
      </BottomSheet>

      <BottomSheet open={renaming} onClose={() => setRenaming(false)} title="Rename session">
        <input
          autoFocus
          value={w.name || ''}
          onChange={(e) => setW({ ...w, name: e.target.value })}
          placeholder={title}
          aria-label="Session name"
          className="w-full h-tap px-base rounded-full bg-glass-inset border border-glass-inset-border
                     text-body font-regular text-ink placeholder:text-ink-tertiary outline-none
                     focus:border-glass-border"
        />
        <div className="mt-md flex justify-end">
          <PrimaryButton onClick={() => setRenaming(false)}>Done</PrimaryButton>
        </div>
      </BottomSheet>

      {picker && (
        <WheelPicker
          open
          title={picker.field === 'weight' ? 'Weight' : 'Reps'}
          value={picker.field === 'weight' ? roundDisplay(picker.set.weightKg) : picker.set.reps}
          min={0}
          max={picker.field === 'weight' ? 500 : 50}
          step={picker.field === 'weight' ? (picker.ex?.weightIncrement || 2.5) : 1}
          unit={picker.field === 'weight' ? 'kg' : ''}
          stepOptions={picker.field === 'weight' ? [1, 2.5, 5] : undefined}
          onStepChange={picker.ex ? (inc) => onUpdateExercise(picker.ex.id, { weightIncrement: inc }) : undefined}
          onCancel={() => setPicker(null)}
          onConfirm={(v) => {
            updateSet(picker.id, picker.field === 'weight' ? { weightKg: v } : { reps: Math.max(0, Math.round(v)) });
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

function fmtNum(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
