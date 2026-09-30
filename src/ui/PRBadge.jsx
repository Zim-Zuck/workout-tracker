import { Trophy } from 'lucide-react';

// The ONLY component allowed to use the PR colour.
//
// Three typed records, matching the PR logic: a heavier bar, more reps at a
// weight you already owned, or more total work in one session. Estimated 1RM is
// the tiebreaker behind them, never a fourth badge — "est. 1RM" and "top set"
// side by side was the inconsistency this component replaces.
const KINDS = {
  weight: { label: 'Weight PR', hint: 'Heaviest bar yet' },
  reps:   { label: 'Reps PR',   hint: 'Most reps at this weight' },
  volume: { label: 'Volume PR', hint: 'Most work in one session' }
};

export default function PRBadge({ kind = 'weight', value, delta, size = 'base', className = '' }) {
  const k = KINDS[kind] || KINDS.weight;
  const sm = size === 'sm';
  return (
    <span
      title={k.hint}
      className={[
        'inline-flex items-center gap-xs rounded-full border bg-pr-soft border-pr-border text-pr font-semibold',
        sm ? 'h-7 px-sm text-micro tracking-normal' : 'h-8 px-md text-label',
        className
      ].join(' ')}
    >
      <Trophy size={sm ? 12 : 14} strokeWidth={2.4} />
      {k.label}
      {value != null && <span className="tabular">· {value}</span>}
      {delta != null && <span className="tabular">· +{delta}</span>}
    </span>
  );
}

// The one-line PR highlight on Today. Text only — a full-width gold card would
// shout, and this is a congratulation, not an alert.
export function PRHighlight({ children, onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'flex items-center gap-sm w-full text-left rounded-tile border',
        'bg-pr-soft border-pr-border text-pr px-base py-md text-label font-semibold',
        onClick ? 'min-h-tap transition-colors duration-fast ease-out active:bg-pr-soft/60' : '',
        className
      ].filter(Boolean).join(' ')}
    >
      <Trophy size={15} strokeWidth={2.4} className="shrink-0" />
      <span className="truncate">{children}</span>
    </Tag>
  );
}

export { KINDS as PR_KINDS };
