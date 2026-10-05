import { useMemo, useState } from 'react';
import { Search, Plus, Sparkles, X } from 'lucide-react';
import { BottomSheet, SecondaryButton } from '../ui/index.js';
import CreateExerciseSheet from './CreateExerciseSheet.jsx';
import { isInSplit } from '../services/splits.js';
import { searchExercises } from '../services/exerciseSearch.js';
import { visibleExercises } from '../services/exerciseIdentity.js';

// Picking an exercise, in a sheet.
//
// `suggestions` are the ranked alternatives Replace offers — the three lifts
// this person actually trains for that muscle, shown BEFORE the full library so
// the common case is one tap and the rare case is still one search away.
//
// SEARCH matches normalized text across name, aliases, equipment and muscle
// group (services/exerciseSearch.js), so "cable-curls" and "CABLE CURL" both
// find Cable Curl. The old matcher was a raw substring test on the name and the
// joined muscle groups, which meant punctuation, plurals and equipment all
// failed. The field also kept losing focus once a second — that half of the bug
// was in BottomSheet, and is fixed there.
export default function ExercisePickerSheet({
  open, onClose, exercises, exclude = [], splitId = null,
  title = 'Add exercise', suggestions = [], onPick, onManage, onCreateExercise
}) {
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Merged custom exercises are deliberately absent: a custom lift merged into
  // a library lift behaves AS that library lift everywhere, so offering both
  // would be offering the same exercise twice.
  const pickable = useMemo(() => visibleExercises(exercises), [exercises]);

  const options = useMemo(() => {
    const suggestedIds = new Set(suggestions.map((s) => s.id));
    const pool = pickable.filter((e) => !exclude.includes(e.id) && !suggestedIds.has(e.id));
    // Within the current split first when nothing is typed — a Pull day's
    // picker should not open on Calf Raise. Once there is a query, relevance to
    // the query is the only ordering that makes sense.
    const extraRank = splitId && !q.trim()
      ? (e) => (isInSplit(e, splitId) ? 0 : 1)
      : null;
    return searchExercises(pool, q, { extraRank });
  }, [pickable, exclude, q, splitId, suggestions]);

  const handleCreate = async (fields) => {
    const created = await onCreateExercise?.(fields);
    if (created) {
      onPick?.(created);
      setQ('');
    }
    return created;
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={title}>
        {suggestions.length > 0 && !q && (
          <>
            <p className="flex items-center gap-xs text-micro font-semibold uppercase text-ink-tertiary mb-base">
              <Sparkles size={12} /> Suggested for you
            </p>
            <ul className="mb-xl flex flex-col gap-md">
              {suggestions.map((ex) => <Row key={ex.id} ex={ex} onPick={onPick} highlight />)}
            </ul>
          </>
        )}

        <div className="relative mb-base">
          <Search size={16} className="absolute left-base top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, equipment or muscle"
            aria-label="Search exercises"
            autoComplete="off"
            className="w-full h-tap pl-4xl pr-4xl rounded-full bg-glass-inset border border-glass-inset-border
                       text-body font-regular text-ink placeholder:text-ink-tertiary outline-none
                       focus:border-glass-border"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-xs top-1/2 -translate-y-1/2 w-tap h-tap flex items-center justify-center
                         rounded-full text-ink-tertiary active:text-ink"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-xs">
          {options.map((ex) => <Row key={ex.id} ex={ex} onPick={onPick} />)}
        </ul>

        {/* THE EMPTY STATE. Nothing matched, so the one thing that definitely
            helps is offered directly: make the exercise you were looking for.
            The typed query becomes its name. */}
        {!options.length && (
          <div className="py-xl text-center">
            <p className="text-body font-regular text-ink">
              {q.trim() ? `No exercise matches “${q.trim()}”` : 'Nothing left to add'}
            </p>
            <p className="text-label font-regular text-ink-tertiary mt-sm">
              {q.trim()
                ? 'Searches name, aliases, equipment and muscle group.'
                : 'Every exercise in your library is already in this session.'}
            </p>
            <div className="mt-base flex flex-col items-center gap-md">
              {onCreateExercise && (
                <SecondaryButton icon={Plus} onClick={() => setCreateOpen(true)}>
                  Create custom exercise
                </SecondaryButton>
              )}
              {onManage && (
                <SecondaryButton onClick={onManage}>Manage exercise library</SecondaryButton>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      <CreateExerciseSheet
        open={createOpen}
        initialName={q.trim()}
        exercises={exercises}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        onUseLibrary={(ex) => { onPick?.(ex); setQ(''); }}
      />
    </>
  );
}

function Row({ ex, onPick, highlight = false }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(ex)}
        className={`w-full min-h-tap px-base -mx-base rounded-row flex items-center justify-between gap-base text-left
                    transition-colors duration-fast ease-out active:bg-glass-pressed
                    ${highlight ? 'bg-glass-inset py-base' : 'py-md'}`}
      >
        <span className="min-w-0">
          <span className="block text-body font-regular text-ink truncate">{ex.name}</span>
          <span className="block text-label font-regular text-ink-tertiary truncate">
            {[ex.equipment, (ex.muscleGroups || []).join(' · ')].filter(Boolean).join(' — ')}
          </span>
        </span>
        <Plus size={17} strokeWidth={2.2} className="text-ink-tertiary shrink-0" />
      </button>
    </li>
  );
}
