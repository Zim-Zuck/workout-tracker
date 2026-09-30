import Skeleton from './Skeleton.jsx';

// A number and what it means. The workhorse of Progress and the Today stat row.
//
// The value is the loud part and the label is quiet — the reverse (a shouty
// uppercase label over a small number) is how dashboards end up unreadable.
export default function StatBlock({
  value, label, tone = 'default',   // 'default' | 'done' | 'pr'
  align = 'left', size = 'base',    // 'base' | 'lg'
  loading = false, className = ''
}) {
  const tones = { default: 'text-ink', done: 'text-done', pr: 'text-pr' };
  const sizes = { base: 'text-body', lg: 'text-title' };

  return (
    <div className={`flex flex-col gap-xxs ${align === 'center' ? 'items-center text-center' : ''} ${className}`}>
      {loading
        ? <Skeleton h={size === 'lg' ? 30 : 20} w={size === 'lg' ? 72 : 48} radius="control" />
        : <span className={`${sizes[size]} font-semibold tabular ${tones[tone]}`}>{value}</span>}
      <span className="text-micro font-semibold uppercase text-ink-tertiary">{label}</span>
    </div>
  );
}

// A row of stat blocks inside one card — the "1 this week · 8w streak · 26 total"
// line, and the four tiles at the top of Progress.
export function StatRow({ items, loading = false, className = '' }) {
  return (
    <div className={`grid gap-md ${className}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <StatBlock key={it.label} {...it} align="center" loading={loading} />
      ))}
    </div>
  );
}
