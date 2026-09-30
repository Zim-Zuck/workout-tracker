// A loading placeholder. One shimmer definition lives in index.css so every
// loading state in the app pulses in step rather than each at its own rhythm.
export default function Skeleton({ w = '100%', h = 16, radius = 'row', className = '' }) {
  const r = { row: 'rounded-row', pill: 'rounded-full', card: 'rounded-card', control: 'rounded-control' }[radius];
  return (
    <span
      aria-hidden="true"
      className={`skeleton block ${r} ${className}`}
      style={{ width: w, height: h }}
    />
  );
}

// Text-shaped skeletons read as "a sentence is coming", not "a box is coming".
export function SkeletonText({ lines = 2, className = '' }) {
  return (
    <span className={`flex flex-col gap-sm ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? '58%' : '100%'} />
      ))}
    </span>
  );
}
