// THE SET RING'S GEOMETRY.
//
// Split out of Porthole.jsx so it can be tested as the arithmetic it is, and
// because two things here are decisions rather than drawing.
//
// ONE: A ONE-SET EXERCISE. A single segment spans 350°, and an SVG arc takes the
// short way round unless the large-arc flag is set. The design helper hardcodes
// that flag to 0 — fine for its three-set example, but a plank or a single AMRAP
// set would have drawn a 10° tick where a full ring belongs.
//
// TWO: TOO MANY SETS. Fixed 10° gaps are 60° of a six-set ring and 200° of a
// twenty-set one, at which point the ring is mostly gap. The gap budget is held
// at 60° total and divided among however many sets there are, and past twelve
// the ring stops counting and becomes one continuous progress arc — twenty
// dashes is a texture, not a number. Design has not ruled on the threshold;
// twelve is mine.
export const MAX_SEGMENTS = 12;

const R = 34;   // ring radius, in the 72×72 reference frame
const C = 36;   // centre

export function ringSegments(total, done) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const d = Math.min(n, Math.max(0, Math.floor(Number(done) || 0)));
  if (n === 0) return [];

  if (n > MAX_SEGMENTS) {
    // 269.99 rather than 270: a sweep of exactly 360° starts and ends at the
    // same point, which an arc command draws as nothing at all.
    const track = [{ d: arc(-90, 269.99), done: false }];
    if (d === 0) return track;
    return [...track, { d: arc(-90, -90 + (d / n) * 359.99), done: true }];
  }

  const gap = n <= 6 ? 10 : 60 / n;
  const step = 360 / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      d: arc(-90 + i * step + gap / 2, -90 + (i + 1) * step - gap / 2),
      done: i < d
    });
  }
  return out;
}

function arc(a0, a1) {
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${point(a0)} A${R} ${R} 0 ${large} 1 ${point(a1)}`;
}

function point(deg) {
  const r = (deg * Math.PI) / 180;
  return `${(C + R * Math.cos(r)).toFixed(2)} ${(C + R * Math.sin(r)).toFixed(2)}`;
}
