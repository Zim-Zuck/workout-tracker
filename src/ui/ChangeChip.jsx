import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

// A SIGNED CHANGE, READ WITHOUT COLOUR ALONE.
//
// Takes the `kind`/`pct` pair straight off a change() result (see
// trainingEvolution.js) and renders it — it never recomputes a percentage, it
// only decides how one is shown. A gain takes the warm accent and an up
// arrow; a decline stays in plain ink with a down arrow rather than turning
// red, because a drop in volume after a deload is information, not something
// to alarm anyone about (the same call this screen's deltaPct already made
// before this redesign, kept on purpose).
export default function ChangeChip({ kind, pct, size = 'sm', className = '' }) {
  const textSize = size === 'sm' ? 'text-label' : 'text-body';
  const iconSize = size === 'sm' ? 12 : 14;
  const base = `inline-flex items-center gap-xxs font-semibold tabular whitespace-nowrap ${textSize} ${className}`;

  if (kind === 'new') {
    return <span className={`${base} text-ink-secondary`}>New</span>;
  }
  if (kind === 'gone') {
    return (
      <span className={`${base} text-ink-tertiary`}>
        <ArrowDown size={iconSize} strokeWidth={2.4} />
        Gone
      </span>
    );
  }

  const rounded = Math.round(Math.abs(pct ?? 0));
  if (kind === 'none' || rounded === 0) {
    return (
      <span className={`${base} text-ink-secondary`}>
        <Minus size={iconSize} strokeWidth={2.4} />
        No change
      </span>
    );
  }

  const up = pct > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`${base} ${up ? 'text-pr' : 'text-ink-secondary'}`}>
      <Icon size={iconSize} strokeWidth={2.4} />
      {rounded}%
    </span>
  );
}
