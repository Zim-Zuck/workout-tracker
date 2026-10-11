import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Plus } from 'lucide-react';
import { IconButton, SegmentedPills, PrimaryButton, StaticPill } from '../ui/index.js';
import { visibleExercises } from '../services/exerciseIdentity.js';
import { isInSplit, primaryMuscleIn, splitLabel, SPLIT_MUSCLES } from '../services/splits.js';
import { recommend } from '../services/progression.js';

// "Make plan", the other half of the choice on the previous screen. The
// suggestions already built for the hero come in pre-checked — this is "use
// them, swap them, or ignore them" made literal: every lift in the split's
// library is one tap away, and nothing here is final until Start workout.
export default function PickExercises({
  splitId, suggested = [], exercises, workouts, onBack, onStart, starting = false
}) {
  const label = splitLabel(splitId) || 'Workout';

  const suggestedIds = useMemo(() => new Set(suggested.map((s) => s.exercise.id)), [suggested]);
  const suggestedById = useMemo(() => new Map(suggested.map((s) => [s.exercise.id, s])), [suggested]);

  // Suggested lifts first, in the order the builder picked them, then the rest
  // of the split's library alphabetically. The suggested badge marks where a
  // lift came from — selection is a separate, independent toggle.
  const pool = useMemo(() => {
    const visible = visibleExercises(exercises).filter((e) => isInSplit(e, splitId));
    const rest = visible
      .filter((e) => !suggestedIds.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...suggested.map((s) => s.exercise), ...rest];
  }, [exercises, splitId, suggested, suggestedIds]);

  const [selected, setSelected] = useState(() => new Set(suggestedIds));
  const [filter, setFilter] = useState('all');

  const filterOptions = useMemo(() => [
    { value: 'all', label: 'All' },
    ...(SPLIT_MUSCLES[splitId] || []).map((m) => ({ value: m, label: m }))
  ], [splitId]);

  const visible = filter === 'all'
    ? pool
    : pool.filter((e) => primaryMuscleIn(e, splitId) === filter);

  const toggle = (id) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    if (starting || !selected.size) return;
    const items = pool
      .filter((e) => selected.has(e.id))
      .map((e) => suggestedById.get(e.id) || {
        exercise: e,
        muscle: primaryMuscleIn(e, splitId) || (e.muscleGroups || [])[0] || null,
        reason: 'manual',
        sets: 3,
        target: recommend({ exercise: e, workoutHistory: workouts })
      });
    onStart(items);
  };

  return (
    <div
      className="px-base"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + var(--layout-tab-bar) + 92px)' }}
    >
      <div className="flex items-center gap-sm pt-sm -ml-sm">
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} disabled={starting} />
        <span className="text-micro font-semibold uppercase text-ink-tertiary">{label} · Make plan</span>
      </div>

      <h1 className="mt-base text-title font-semibold text-ink">Pick your exercises</h1>
      <p className="mt-xs text-label font-regular text-ink-secondary">
        Tap to add or remove. You'll set reps and weight once the workout starts.
      </p>

      <SegmentedPills
        className="mt-base"
        ariaLabel="Muscle group"
        value={filter}
        onChange={setFilter}
        options={filterOptions}
      />

      <ul className="mt-base flex flex-col gap-sm">
        {visible.map((ex) => {
          const isSelected = selected.has(ex.id);
          const isSuggested = suggestedIds.has(ex.id);
          const muscle = primaryMuscleIn(ex, splitId) || (ex.muscleGroups || [])[0];
          return (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => toggle(ex.id)}
                aria-pressed={isSelected}
                className="w-full flex items-center gap-sm px-base py-sm rounded-card border
                           bg-glass border-glass-border text-left
                           transition-colors duration-fast ease-out active:bg-glass-pressed"
              >
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-sm min-w-0">
                    <span className="text-body font-regular text-ink truncate">{ex.name}</span>
                    {isSuggested && <StaticPill className="shrink-0">Suggested</StaticPill>}
                  </span>
                  <span className="block text-label font-regular text-ink-tertiary truncate mt-xxs">
                    {[muscle, ex.equipment].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    'shrink-0 w-tap h-tap flex items-center justify-center rounded-full border',
                    isSelected
                      ? 'bg-primary text-on-primary border-transparent'
                      : 'bg-transparent text-ink-tertiary border-glass-border'
                  ].join(' ')}
                >
                  {isSelected ? <Check size={16} strokeWidth={2.6} /> : <Plus size={16} strokeWidth={2.2} />}
                </span>
              </button>
            </li>
          );
        })}
        {!visible.length && (
          <li className="py-xl text-center text-label font-regular text-ink-tertiary">
            No matching exercises in your library yet.
          </li>
        )}
      </ul>

      <div
        className="fixed inset-x-0 z-40 flex justify-center px-base pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + var(--layout-tab-bar) + var(--space-sm))' }}
      >
        <div className="pointer-events-auto w-full max-w-app">
          <PrimaryButton full size="lg" loading={starting} disabled={!selected.size} onClick={handleStart}>
            Start workout · {selected.size} {selected.size === 1 ? 'exercise' : 'exercises'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
