import { useMemo, useState } from 'react';
import { Search, Plus, Sparkles } from 'lucide-react';
import { BottomSheet, SecondaryButton } from '../ui/index.js';
import { isInSplit } from '../services/splits.js';

// Picking an exercise, in a sheet.
//
// `suggestions` are the ranked alternatives Replace offers — the three lifts
// this person actually trains for that muscle, shown BEFORE the full library so
// the common case is one tap and the rare case is still one search away.
export default function ExercisePickerSheet({
  open, onClose, exercises, exclude = [], splitId = null,
  title = 'Add exercise', suggestions = [], onPick, onManage
}) {
  const [q, setQ] = useState('');

  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const suggestedIds = new Set(suggestions.map((s) => s.id));
    return exercises
      .filter((e) => !exclude.includes(e.id) && !suggestedIds.has(e.id))
      .filter((e) => !needle
        || e.name.toLowerCase().includes(needle)
        || (e.muscleGroups || []).join(' ').toLowerCase().includes(needle))
      // Within the current split first when there is one — a Pull day's picker
      // should not open on Calf Raise.
      .sort((a, b) => {
        if (splitId && !needle) {
          const ai = isInSplit(a, splitId) ? 0 : 1;
          const bi = isInSplit(b, splitId) ? 0 : 1;
          if (ai !== bi) return ai - bi;
        }
        return a.name.localeCompare(b.name);
      });
  }, [exercises, exclude, q, splitId, suggestions]);

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {suggestions.length > 0 && !q && (
        <>
          <p className="flex items-center gap-xs text-micro font-semibold uppercase text-ink-tertiary mb-sm">
            <Sparkles size={12} /> Suggested for you
          </p>
          <ul className="mb-lg">
            {suggestions.map((ex) => <Row key={ex.id} ex={ex} onPick={onPick} highlight />)}
          </ul>
        </>
      )}

      <div className="relative mb-md">
        <Search size={16} className="absolute left-base top-1/2 -translate-y-1/2 text-ink-tertiary" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="w-full h-tap pl-4xl pr-base rounded-full bg-glass-inset border border-glass-inset-border
                     text-body font-regular text-ink placeholder:text-ink-tertiary outline-none
                     focus:border-glass-border"
        />
      </div>

      <ul>
        {options.map((ex) => <Row key={ex.id} ex={ex} onPick={onPick} />)}
        {!options.length && (
          <li className="py-xxl text-center text-label font-regular text-ink-tertiary">
            No matches
            {onManage && (
              <span className="block mt-md">
                <SecondaryButton onClick={onManage}>Manage exercise library</SecondaryButton>
              </span>
            )}
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}

function Row({ ex, onPick, highlight = false }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(ex)}
        className={`w-full min-h-tap py-sm px-md -mx-md rounded-row flex items-center justify-between gap-md text-left
                    transition-colors duration-fast ease-out active:bg-glass-pressed
                    ${highlight ? 'bg-glass-inset' : ''}`}
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
