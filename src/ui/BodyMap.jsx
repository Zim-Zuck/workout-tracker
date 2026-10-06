import { useId } from 'react';
import { color } from '../theme/tokens.js';
import { FRONT, BACK, SILHOUETTE, FULL_BOX } from './anatomyPaths.js';

// THE ANATOMY RENDERER.
//
// A port of the Claude Design `BodyMap` component. One figure, one view, any
// crop. Everything above it (the porthole, the session pair, the finish plate)
// is composition — this file is the only place that knows how a muscle is
// painted.
//
// WHY "ENGRAVED" AND NOT A FLAT FILL. The design explored three treatments and
// two of them failed the only test that matters here: a 58px porthole. Flat
// fills and wireframes both lose depth at that size and the muscle stops being
// readable as a shape. Engraved — a vertical gradient plus a diagonal hatch in
// the page's own background colour — is what keeps it legible, so it is the
// default and the other two exist for larger plates.
//
// THE TWO TIERS ARE THE POINT. Primary sits at 0.86–1.0 opacity, secondary at
// 0.48–0.68, untrained at a near-flat white wash. Collapsing those tiers (every
// listed muscle painted primary) is what makes one of these diagrams turn into
// a uniform blob, which is why services/anatomy.js works to keep them apart.
//
// Intensity moves opacity WITHIN a tier rather than between them: a half-done
// exercise is a dimmer version of the same shape, never a different one.
export default function BodyMap({
  view = 'front',
  primary = [],
  secondary = [],
  intensity = 0,
  box = FULL_BOX,
  height = 64,
  treatment = 'engraved',   // engraved | flat | wire
  accent = color.ink,
  className,
  style
}) {
  // SVG ids are document-global, so two BodyMaps on one screen sharing a
  // gradient id means the second silently repaints the first. useId gives each
  // instance its own namespace.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = { grad: `${uid}g`, wash: `${uid}w`, hatch: `${uid}h`, blur: `${uid}f` };

  const k = clamp01(intensity);
  const src = view === 'back' ? BACK : FRONT;
  const prim = new Set(primary);
  const sec = new Set(secondary);

  const [, , vw, vh] = box.split(/\s+/).map(Number);
  const width = Math.round((height * vw) / vh);

  const muscles = [];
  const hatches = [];
  const glows = [];

  for (const [id, d] of Object.entries(src)) {
    const isPrimary = prim.has(id);
    const isSecondary = !isPrimary && sec.has(id);
    const on = isPrimary || isSecondary;

    muscles.push({ id, d, ...paint(treatment, { on, isPrimary, k, accent, ids }) });

    // The hatch rides on top of every region including untrained ones — it is
    // the engraving, not a highlight, and removing it from the idle regions
    // makes the trained ones look like stickers.
    if (treatment === 'engraved') {
      hatches.push({ id, d, opacity: on ? (isPrimary ? 0.95 : 0.6) : 0.45 });
    }
    // A bloom under the shape, only once an exercise is most of the way done.
    // This is the one thing on the figure that reads as "you did that".
    if (isPrimary && k > 0.4) glows.push({ id, d, opacity: 0.5 * k });
  }

  const sil = silhouettePaint(treatment);

  return (
    <svg
      viewBox={box}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', overflow: 'visible', flex: 'none', ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={ids.grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="1" />
          <stop offset="1" stopColor={accent} stopOpacity="0.62" />
        </linearGradient>
        <linearGradient id={ids.wash} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color.primary} stopOpacity="0.22" />
          <stop offset="1" stopColor={color.primary} stopOpacity="0.08" />
        </linearGradient>
        {/* The hatch is the PAGE background colour, not black: it has to read as
            a groove cut into the shape on this particular ground. */}
        <pattern id={ids.hatch} patternUnits="userSpaceOnUse" width="2.6" height="2.6">
          <path d="M0 2.6 L2.6 0" fill="none" stroke={color.bg} strokeOpacity="0.34" strokeWidth="0.7" />
        </pattern>
        <filter id={ids.blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <g>
        {SILHOUETTE.map((d, i) => (
          <path
            key={i} d={d} fill={sil.fill} stroke={color.primary}
            fillOpacity={sil.fillOpacity} strokeOpacity={sil.strokeOpacity}
            strokeWidth={sil.strokeWidth} strokeLinejoin="round"
          />
        ))}
      </g>

      {glows.map((g) => (
        <path key={`glow-${g.id}`} d={g.d} fill={accent} opacity={g.opacity} filter={`url(#${ids.blur})`} />
      ))}

      {muscles.map((m) => (
        <path
          key={m.id}
          data-muscle={m.id}
          d={m.d}
          fill={m.fill}
          stroke={m.stroke}
          opacity={m.opacity}
          fillOpacity={m.fillOpacity}
          strokeOpacity={m.strokeOpacity}
          strokeWidth={m.strokeWidth}
          strokeLinejoin="round"
          // 250ms on opacity and fill only, per the design system's motion rule,
          // and the global prefers-reduced-motion rule in index.css collapses it.
          style={{ transition: `opacity var(--motion-slow) var(--motion-ease), fill-opacity var(--motion-slow) var(--motion-ease)` }}
        />
      ))}

      {hatches.map((h) => (
        <path key={`hatch-${h.id}`} d={h.d} fill={`url(#${ids.hatch})`} opacity={h.opacity} />
      ))}
    </svg>
  );
}

// The three treatments, as literal alpha ramps from the design source. The
// numbers are deliberately not rounded or "tidied" — they are the measured
// values that passed the 58px contrast check.
function paint(treatment, { on, isPrimary, k, accent, ids }) {
  if (treatment === 'flat') {
    return on
      ? { fill: accent, stroke: accent, fillOpacity: 1, strokeOpacity: 1, strokeWidth: 1.1, opacity: isPrimary ? 0.8 + 0.2 * k : 0.34 + 0.2 * k }
      : { fill: color.primary, stroke: color.primary, fillOpacity: 1, strokeOpacity: 1, strokeWidth: 1.1, opacity: 0.12 };
  }
  if (treatment === 'engraved') {
    return on
      ? { fill: `url(#${ids.grad})`, stroke: 'none', fillOpacity: 1, strokeOpacity: 0, strokeWidth: 0, opacity: isPrimary ? 0.86 + 0.14 * k : 0.48 + 0.2 * k }
      : { fill: `url(#${ids.wash})`, stroke: 'none', fillOpacity: 1, strokeOpacity: 0, strokeWidth: 0, opacity: 1 };
  }
  return on
    ? { fill: accent, stroke: accent, fillOpacity: isPrimary ? 0.26 + 0.2 * k : 0.14 + 0.08 * k, strokeOpacity: isPrimary ? 1 : 0.7, strokeWidth: 1, opacity: 1 }
    : { fill: 'none', stroke: color.primary, fillOpacity: 1, strokeOpacity: 0.26, strokeWidth: 0.8, opacity: 1 };
}

function silhouettePaint(treatment) {
  if (treatment === 'wire') {
    return { fill: 'none', fillOpacity: 1, strokeOpacity: 0.3, strokeWidth: 0.9 };
  }
  return {
    fill: color.primary,
    fillOpacity: treatment === 'engraved' ? 0.045 : 0.05,
    strokeOpacity: 0.1,
    strokeWidth: 0.8
  };
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
