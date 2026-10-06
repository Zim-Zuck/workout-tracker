import { color } from '../theme/tokens.js';
import BodyMap from './BodyMap.jsx';
import { ringSegments } from './setRing.js';

// THE PORTHOLE.
//
// A circular window cropped to the region an exercise works, with the set
// tracker as the ring around it: one segment per set, green once logged. The
// crop is the load-bearing idea — a whole 58px body is a smudge, a 58px window
// onto one shoulder is a shoulder — and the ring is there because the thing you
// most want to know mid-set is how many are left, and it was previously only
// available by counting rows.
//
// Design spec it implements: 58px window inset in a 72px box, ring radius 34 of
// 72, 2.6px round-capped segments, 10° gaps, first segment starting at twelve
// o'clock. The arc arithmetic, and the two cases the mock's three-set example
// did not have to solve, live in setRing.js.
export default function Porthole({
  view = 'front',
  box,
  primary = [],
  secondary = [],
  intensity = 0,
  done = 0,
  total = 0,
  size = 72,
  label,
  className
}) {
  // Everything scales off the 72px reference so a larger porthole is the same
  // drawing, not a second set of numbers to keep in sync.
  const s = size / 72;
  const inset = 7 * s;
  const windowSize = size - inset * 2;
  const segments = ringSegments(total, done);

  return (
    <div
      className={className}
      role="img"
      aria-label={label || undefined}
      style={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      <div
        style={{
          position: 'absolute', left: inset, top: inset,
          width: windowSize, height: windowSize,
          borderRadius: '9999px', overflow: 'hidden',
          // Light from above-centre, so the window reads as a recess in the card
          // rather than a circle drawn on it.
          background: `radial-gradient(circle at 50% 40%, rgba(255,255,255,.12), rgba(255,255,255,.03))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        {/* Drawn slightly larger than the window and clipped by it: the crop
            should bleed to the edges, not sit inside a visible margin. */}
        <BodyMap
          view={view}
          box={box}
          primary={primary}
          secondary={secondary}
          intensity={intensity}
          height={windowSize * (64 / 58)}
        />
      </div>

      {segments.length > 0 && (
        <svg
          viewBox="0 0 72 72" width={size} height={size}
          style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
          aria-hidden="true" focusable="false"
        >
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.d}
              fill="none"
              stroke={seg.done ? color.done : 'rgba(255,255,255,.16)'}
              strokeWidth="2.6"
              strokeLinecap="round"
              style={{ transition: `stroke var(--motion-slow) var(--motion-ease)` }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
