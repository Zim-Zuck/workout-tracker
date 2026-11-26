import { useLayoutEffect, useRef, useState } from 'react';
import { MoreVertical, Plus, RotateCcw, Star } from 'lucide-react';
import GlassCard from './GlassCard.jsx';
import SetRow, { SetRowHeader } from './SetRow.jsx';
import PRBadge from './PRBadge.jsx';
import Porthole from './Porthole.jsx';
import { anatomyForExercise, tiersFor } from '../services/anatomy.js';
import { formatWeight } from '../utils/units.js';

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
  exercise, sets = [], lastSets = null, deload = false, bestSet = null, targetLine, prs = [],
  skipped = false, loading = false,
  renderSet,                     // (set, i) => props for SetRow
  onAddSet, onOpenMenu, onSkip, onRestore
}) {
  const [dx, setDx] = useState(0);
  const [lastExpanded, setLastExpanded] = useState(false);
  // Whether the full "Last" line actually overflows its available width. A
  // fixed character count can't answer this: "100 kg × 10" and "65 kg × 10"
  // are the same length but not the same pixel width, and the available width
  // itself depends on whether the Deload tag is also competing for the row. So
  // instead an invisible copy of the full text (measureRef) is laid out
  // unconstrained to get its true width, and compared against the actual
  // available width of the content column (contentRef) once both have mounted.
  const [lastOverflows, setLastOverflows] = useState(false);
  const measureRef = useRef(null);
  const contentRef = useRef(null);
  const start = useRef({ x: 0, y: 0 });
  const swiping = useRef(false);
  const REVEAL = 96;

  // "Last" never ends in an ellipsis — it either fits whole, or collapses to
  // its top set (heaviest, then most reps) plus a tappable "+N more" that
  // expands it in place. hasLast stays separate from the array itself so an
  // explicit empty array (vs. null for "no history yet") still hides the row.
  const hasLast = !!lastSets?.length;
  const lastParts = hasLast ? lastSets.map((s) => `${formatWeight(s.weightKg)} × ${s.reps}`) : [];
  const lastFull = lastParts.join(', ');
  const lastTop = hasLast
    ? lastSets.reduce((top, s) => (
        !top || s.weightKg > top.weightKg || (s.weightKg === top.weightKg && s.reps > top.reps) ? s : top
      ), null)
    : null;
  const lastCollapsible = lastParts.length > 1 && lastOverflows;

  useLayoutEffect(() => {
    if (!hasLast || lastParts.length < 2) return;
    const full = measureRef.current;
    const avail = contentRef.current;
    if (!full || !avail) return;
    setLastOverflows(full.scrollWidth > avail.clientWidth);
  }, [hasLast, lastFull, lastParts.length, deload]);

  if (loading) {
    return (
      <GlassCard className="p-base">
        <span className="skeleton block h-5 w-1/2 rounded-control" />
        <span className="skeleton block h-3 w-2/3 rounded-control mt-sm" />
        <div className="mt-base flex flex-col gap-md">
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

  // Warm-ups are excluded from the ring for the same reason they are excluded
  // from volume and PRs: they are not the work. A card of three working sets
  // reads as three segments whether or not you warmed up into it.
  const working = sets.filter((s) => s.type !== 'warmup');
  const ringTotal = working.length;
  const ringDone = working.filter((s) => s.completed).length;
  const anatomy = anatomyForExercise(exercise);
  const portholeLabel = `${tiersFor(exercise).primary.join(', ') || 'Exercise'} · ${ringDone} of ${ringTotal} sets logged`;

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
              {hasLast && (
                <p className="text-label font-regular text-ink-secondary mt-sm flex items-center gap-xs min-w-0">
                  <span className="text-ink-tertiary shrink-0">Last</span>
                  <span
                    ref={contentRef}
                    className={lastCollapsible && !lastExpanded
                      ? 'min-w-0 flex-1 overflow-hidden whitespace-nowrap'
                      : 'min-w-0 flex-1'}
                  >
                    {/* Invisible, unconstrained copy of the full text — its
                        scrollWidth is the only way to know whether the real
                        line (constrained by the flex box above) would
                        overflow, since a fixed character count can't account
                        for proportional-font width or the Deload tag eating
                        into the same row. */}
                    <span ref={measureRef} aria-hidden="true" className="invisible absolute whitespace-nowrap">
                      {lastFull}
                    </span>
                    {lastCollapsible && !lastExpanded ? (
                      <>
                        {`${formatWeight(lastTop.weightKg)} × ${lastTop.reps}`}{' '}
                        <button
                          type="button"
                          onClick={() => setLastExpanded(true)}
                          className="text-ink-secondary underline underline-offset-2 decoration-glass-border"
                        >
                          +{lastParts.length - 1} more
                        </button>
                      </>
                    ) : lastFull}
                  </span>
                  {deload && (
                    <span className="shrink-0 inline-flex items-center h-5 px-xs rounded-full bg-glass-inset
                                      border border-glass-inset-border text-micro font-semibold uppercase
                                      text-ink-tertiary">
                      Deload
                    </span>
                  )}
                </p>
              )}
              {bestSet && (
                <p className="text-label font-regular text-ink-secondary mt-xxs flex items-center gap-xs">
                  <span className="text-ink-tertiary">Best</span>
                  <Star size={12} strokeWidth={2.2} className="text-ink-tertiary shrink-0" />
                  {formatWeight(bestSet.weightKg)} × {bestSet.reps}
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

            {/* THE PORTHOLE. A window onto the muscle this lift is for, with the
                set tracker as the ring around it. It sits here, against the
                prev/target lines, because those three things answer the same
                question — what am I doing, and how much of it is left — and it
                centres on the text block rather than topping out with the ⋮ so
                the ring reads as belonging to the sets below it. */}
            <Porthole
              className="self-center"
              view={anatomy.view}
              box={anatomy.box}
              primary={anatomy.primary}
              secondary={anatomy.secondary}
              intensity={ringTotal > 0 ? ringDone / ringTotal : 0}
              done={ringDone}
              total={ringTotal}
              label={portholeLabel}
            />

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
            {/* 12px between rows — more than the 8px each row keeps inside
                itself, so a row reads as one thing and the stack reads as a
                list of them. */}
            <div className="flex flex-col gap-md">
              {sets.map((s, i) => <SetRow key={s.id} {...renderSet(s, i)} />)}
            </div>
          </div>

          {/* Part of the same stack as the rows above it, so it keeps their
              12px rhythm rather than starting a new group. */}
          <button
            type="button"
            onClick={onAddSet}
            className="mt-md w-full h-tap rounded-row flex items-center justify-center gap-xs
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
