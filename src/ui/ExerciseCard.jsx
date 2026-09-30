import { useRef, useState } from 'react';
import { MoreVertical, Plus, RotateCcw } from 'lucide-react';
import GlassCard from './GlassCard.jsx';
import SetRow, { SetRowHeader } from './SetRow.jsx';
import PRBadge from './PRBadge.jsx';

// One exercise inside a live session.
//
// SWIPE LEFT REVEALS "SKIP", AND SKIP IS NOT DELETE.
// Skipping collapses the card to a slim row and costs the user nothing: no
// streak damage, no volume comparison, no effect on completion. It is recorded
// so the session builder learns to stop suggesting a lift you keep walking past.
// Removing is the other thing entirely — it deletes the exercise and any sets
// logged against it. Both are one tap with an undo toast and no dialog; the ⋮
// sheet spells out the difference in a line.
export default function ExerciseCard({
  exercise, sets = [], prevLine, targetLine, prs = [],
  skipped = false, loading = false,
  renderSet,                     // (set, i) => props for SetRow
  onAddSet, onOpenMenu, onSkip, onRestore
}) {
  const [dx, setDx] = useState(0);
  const start = useRef({ x: 0, y: 0 });
  const swiping = useRef(false);
  const REVEAL = 96;

  if (loading) {
    return (
      <GlassCard className="p-base">
        <span className="skeleton block h-5 w-1/2 rounded-control" />
        <span className="skeleton block h-3 w-2/3 rounded-control mt-sm" />
        <div className="mt-base flex flex-col gap-sm">
          <SetRow loading /><SetRow loading />
        </div>
      </GlassCard>
    );
  }

  if (skipped) {
    return (
      <GlassCard variant="inset" className="flex items-center gap-md px-base" style={{ minHeight: 56 }}>
        <span className="flex-1 min-w-0 text-body font-regular text-ink-tertiary truncate line-through">
          {exercise.name}
        </span>
        <span className="text-label font-semibold text-ink-tertiary shrink-0">Skipped</span>
        <button
          type="button"
          onClick={onRestore}
          className="shrink-0 inline-flex items-center gap-xs h-tap px-md rounded-full text-label font-semibold
                     text-ink transition-colors duration-fast ease-out active:bg-glass-pressed"
        >
          <RotateCcw size={15} strokeWidth={2.2} /> Restore
        </button>
      </GlassCard>
    );
  }

  const onTouchStart = (e) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    swiping.current = false;
  };
  const onTouchMove = (e) => {
    const t = e.touches[0];
    const mx = t.clientX - start.current.x;
    const my = t.clientY - start.current.y;
    // Only claim the gesture once it is clearly horizontal, or a vertical scroll
    // through a list of these cards turns into a row of half-open swipes.
    if (!swiping.current) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) swiping.current = true;
      else return;
    }
    setDx(Math.min(0, Math.max(-REVEAL - 24, mx)));
  };
  const onTouchEnd = () => {
    if (!swiping.current) return;
    setDx(dx < -REVEAL * 0.55 ? -REVEAL : 0);
  };

  return (
    <div className="relative overflow-hidden rounded-card">
      <button
        type="button"
        onClick={() => { setDx(0); onSkip?.(); }}
        tabIndex={dx < -20 ? 0 : -1}
        aria-hidden={dx >= -20}
        className="absolute inset-y-0 right-0 flex items-center justify-center rounded-r-card
                   bg-glass-inset text-ink text-label font-semibold
                   transition-opacity duration-fast ease-out"
        // The card above is translucent glass, so a Skip button sitting behind a
        // closed card shows THROUGH it. It only exists once the swipe starts.
        style={{ width: REVEAL, opacity: dx < -4 ? 1 : 0 }}
      >
        Skip
      </button>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translate3d(${dx}px, 0, 0)`,
          transition: swiping.current ? 'none' : `transform var(--motion-slow) var(--motion-ease)`
        }}
      >
        <GlassCard as="section" aria-label={exercise.name} className="p-base">
          <header className="flex items-start gap-sm">
            <div className="flex-1 min-w-0">
              <h3 className="text-body font-semibold text-ink truncate">{exercise.name}</h3>
              {exercise.equipment && (
                <p className="text-micro font-semibold uppercase text-ink-tertiary mt-xxs">{exercise.equipment}</p>
              )}
              {prevLine && (
                <p className="text-label font-regular text-ink-secondary mt-sm truncate">
                  <span className="text-ink-tertiary">Prev </span>{prevLine}
                </p>
              )}
              {targetLine && (
                <p className="text-label font-regular text-ink-secondary mt-xxs truncate">
                  <span className="text-ink-tertiary">Target </span>{targetLine}
                </p>
              )}
              {prs.length > 0 && (
                <div className="flex flex-wrap gap-xs mt-sm">
                  {prs.map((p) => <PRBadge key={p.kind} size="sm" {...p} />)}
                </div>
              )}
            </div>

            {/* Opens a bottom SHEET, never a dropdown: the old menu rendered
                directly over the weight and reps columns it was asking you to
                make a decision about. */}
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label={`Options for ${exercise.name}`}
              aria-haspopup="dialog"
              className="w-tap h-tap -mr-sm -mt-sm shrink-0 flex items-center justify-center rounded-full
                         text-ink-tertiary transition-colors duration-fast ease-out active:text-ink active:bg-glass-pressed"
            >
              <MoreVertical size={20} strokeWidth={2} />
            </button>
          </header>

          <div className="mt-base">
            <SetRowHeader />
            <div className="flex flex-col">
              {sets.map((s, i) => <SetRow key={s.id} {...renderSet(s, i)} />)}
            </div>
          </div>

          <button
            type="button"
            onClick={onAddSet}
            className="mt-sm w-full h-tap rounded-row flex items-center justify-center gap-xs
                       text-label font-semibold text-ink-secondary
                       transition-colors duration-fast ease-out active:bg-glass-pressed active:text-ink"
          >
            <Plus size={16} strokeWidth={2.4} /> Add set
          </button>
        </GlassCard>
      </div>
    </div>
  );
}
