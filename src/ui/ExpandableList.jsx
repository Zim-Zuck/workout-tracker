import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// SHOW THE IMPORTANT FEW, THE REST ONE TAP AWAY.
//
// Every list on the redesigned Evolution screen follows the same rule: the
// 3-5 rows that matter by default, everything else behind "Show all (N)".
// One component owns that so the toggle, the row-reveal animation and the
// empty state cannot drift between the four lists that need it.
//
// `revealKey`, optional: when it changes to a non-null value, the list opens
// itself once — for the muscle-split card, where tapping a region on the body
// map can select a muscle sitting below the fold. It is a nudge, not a lock:
// the viewer can still collapse the list afterward.
export default function ExpandableList({
  items,
  visibleCount = 4,
  renderItem,
  keyFor = (item, i) => i,
  showAllLabel = (n) => `Show all (${n})`,
  showLessLabel = 'Show less',
  emptyMessage,
  listClassName = 'flex flex-col',
  revealKey = null,
  className = ''
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (revealKey != null) setExpanded(true);
  }, [revealKey]);

  if (!items.length) {
    return emptyMessage
      ? <p className="text-label font-regular text-ink-secondary">{emptyMessage}</p>
      : null;
  }

  const hasMore = items.length > visibleCount;
  const shown = expanded ? items : items.slice(0, visibleCount);

  return (
    <div className={className}>
      <ul className={listClassName}>
        {shown.map((item, i) => (
          // Only the rows revealed by "Show all" animate in — the ones
          // visible from the start should never flash on first paint.
          <li key={keyFor(item, i)} className={i >= visibleCount ? 'anim-rise' : undefined}>
            {renderItem(item, i)}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-sm inline-flex items-center gap-xs h-tap px-sm -mx-sm rounded-control
                     text-label font-semibold text-ink-secondary active:bg-glass-pressed
                     transition-colors duration-fast ease-out"
        >
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--motion-base) var(--motion-ease)'
            }}
          />
          {expanded ? showLessLabel : showAllLabel(items.length)}
        </button>
      )}
    </div>
  );
}
