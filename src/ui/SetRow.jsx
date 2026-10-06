import { Check, MoreHorizontal } from 'lucide-react';

// One logged set: SET · WEIGHT · REPS · ✓.
//
// THE SET NUMBER IS A PROP, NOT AN ARRAY INDEX.
// The old row numbered itself from its position in a list that was sorted by
// `timestamp` — a field that was rewritten every time a set was checked. Ticking
// a set therefore moved it, renumbered its neighbours, and (on a millisecond
// tie) rendered two rows both labelled "2", one checked and one not. The number
// now comes from the caller's stable per-exercise order and this component has
// no opinion about ordering at all.
//
// Warm-ups are lettered, not numbered: they do not count toward volume or PRs,
// so they should not consume a working-set number either.
const TYPE_TAG = { warmup: 'W', drop: 'D', failure: 'F' };

export default function SetRow({
  number,                  // stable working-set number, or null for a warm-up
  set,                     // { type, weightKg, reps, completed }
  weightLabel,             // pre-formatted by the caller (units live in settings)
  repsLabel,
  placeholderWeight = null,  // greyed hint from the previous session
  placeholderReps = null,
  onEditWeight, onEditReps, onToggleComplete, onOpenMenu,
  disabled = false, loading = false
}) {
  if (loading) {
    return (
      <div className="grid items-center gap-md px-sm py-sm" style={{ gridTemplateColumns: 'var(--set-grid)' }}>
        <span className="skeleton h-4 rounded-control" />
        <span className="skeleton h-6 rounded-control" />
        <span className="skeleton h-6 rounded-control" />
        <span className="skeleton h-8 w-8 rounded-full justify-self-center" />
        <span />
      </div>
    );
  }

  const tag = TYPE_TAG[set.type];
  const done = !!set.completed;
  const hasW = set.weightKg > 0;
  const hasR = (set.reps || 0) > 0;

  return (
    // 8px of padding inside the row, 12px between rows (the parent's gap-md).
    //
    // INSIDE MUST BE SMALLER THAN BETWEEN, or the rows read as further apart
    // from themselves than from each other. The previous py-base put 16px
    // inside and 12px between, on top of the 44pt tap targets the row already
    // contains — a 76px tall row around a 32px number, with the stack reading
    // as loose and unevenly spaced.
    <div
      className={`grid items-center gap-md rounded-row px-sm py-sm transition-colors duration-fast ease-out
                  ${done ? 'bg-done-soft' : ''} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      style={{ gridTemplateColumns: 'var(--set-grid)' }}
    >
      <span
        className={`text-label font-semibold tabular text-center
                    ${tag ? 'text-ink-tertiary' : done ? 'text-done' : 'text-ink-secondary'}`}
      >
        {tag || number}
      </span>

      <ValueButton
        onClick={onEditWeight}
        label={`Weight ${hasW ? weightLabel : 'not set'}. Tap to change.`}
        value={hasW ? weightLabel : placeholderWeight}
        muted={!hasW}
        unit="kg"
      />

      <ValueButton
        onClick={onEditReps}
        label={`Reps ${hasR ? set.reps : 'not set'}. Tap to change.`}
        value={hasR ? repsLabel : placeholderReps}
        muted={!hasR}
        unit="reps"
      />

      {/* 44pt target, 32pt ring. The check is the most-tapped control in the app
          and it sits under the thumb, right of the numbers, never beside them. */}
      <button
        type="button"
        onClick={onToggleComplete}
        aria-pressed={done}
        aria-label={done ? 'Mark set incomplete' : 'Complete set'}
        className="w-tap h-tap flex items-center justify-center justify-self-center rounded-full
                   transition-transform duration-fast ease-out active:scale-95"
      >
        <span className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors duration-fast ease-out
                          ${done ? 'bg-done border-done text-on-primary' : 'border-glass-border text-ink-tertiary'}`}>
          <Check size={15} strokeWidth={3} />
        </span>
      </button>

      {onOpenMenu ? (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={`Set options${number ? ` for set ${number}` : ''}`}
          className="w-tap h-tap -mr-sm flex items-center justify-center text-ink-tertiary
                     transition-colors duration-fast ease-out active:text-ink"
        >
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      ) : <span />}
    </div>
  );
}

function ValueButton({ onClick, label, value, muted, unit }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-tap rounded-row flex items-baseline justify-center gap-xs
                 transition-colors duration-fast ease-out active:bg-glass-pressed"
    >
      <span className={`text-title tabular font-semibold ${muted ? 'text-ink-tertiary opacity-60' : 'text-ink'}`}>
        {value ?? '—'}
      </span>
      <span className="text-label font-regular text-ink-tertiary">{unit}</span>
    </button>
  );
}

// The column header above a stack of SetRows. Uppercase micro, so it reads as a
// label for a table rather than as content.
export function SetRowHeader() {
  return (
    // Same grid, same gap and same horizontal padding as the rows below it, so
    // the labels sit exactly over the columns they name.
    <div
      className="grid items-center gap-md px-sm pb-md text-micro font-semibold uppercase text-ink-tertiary"
      style={{ gridTemplateColumns: 'var(--set-grid)' }}
      aria-hidden="true"
    >
      <span className="text-center">Set</span>
      <span className="text-center">Weight</span>
      <span className="text-center">Reps</span>
      <span /><span />
    </div>
  );
}
