import { useEffect } from 'react';
import { RONNIE_EXPRESSIONS, DEFAULT_EXPRESSION } from '../data/ronnieExpressions.js';
import flexSrc from '../assets/ronnie/ronnie-flex.png';
import faceSmug from '../assets/ronnie/ronnie-face-smug.png';
import faceWorried from '../assets/ronnie/ronnie-face-worried.png';
import faceHype from '../assets/ronnie/ronnie-face-hype.png';
import faceShocked from '../assets/ronnie/ronnie-face-shocked.png';
import faceFlat from '../assets/ronnie/ronnie-face-flat.png';
import faceWrecked from '../assets/ronnie/ronnie-face-wrecked.png';
import faceShouting from '../assets/ronnie/ronnie-head-loud.png';

// RONNIE — the character, as approved bitmap artwork cut from the character
// sheet. Pure presentation: no data fetching, no line logic.
//
// The face comes from the LINE being spoken (see `expression` on every entry
// in src/data/ronnieLines.js), not from the intensity setting and not from
// getRonnieMood. Intensity still decides which lines are eligible and how the
// bubble text is styled; it no longer has a face of its own.

export { RONNIE_EXPRESSIONS, DEFAULT_EXPRESSION } from '../data/ronnieExpressions.js';

// Per-face metrics, measured off the PNGs' alpha channel rather than guessed:
//
//   w, h     intrinsic pixel size
//   cheek    skull width in px, averaged over the rows between 38% and 53% of
//            the image height — the band below the hair and above the jaw
//            taper, which is the most stable "how big is his head" measure
//   bottom   y of the lowest opaque pixel (the base of the neck), which is
//            what gets anchored so the chin never hops between faces
//
// The sheet draws the smug head about 12% smaller than the rest, and every
// face has slightly different hair and mouth extents, so none of them can be
// laid out by their file dimensions. Normalising on `cheek` and `bottom`
// instead makes head size and chin position identical across all seven.
const FACES = {
  smug:     { src: faceSmug,     w:  90, h: 131, cheek: 67.3, bottom: 124 },
  worried:  { src: faceWorried,  w: 115, h: 148, cheek: 77.8, bottom: 140 },
  hype:     { src: faceHype,     w: 108, h: 153, cheek: 77.1, bottom: 146 },
  shocked:  { src: faceShocked,  w: 112, h: 147, cheek: 76.4, bottom: 139 },
  flat:     { src: faceFlat,     w:  99, h: 146, cheek: 75.3, bottom: 139 },
  wrecked:  { src: faceWrecked,  w: 110, h: 153, cheek: 77.9, bottom: 146 },
  shouting: { src: faceShouting, w: 112, h: 147, cheek: 76.7, bottom: 139 }
};

export const RONNIE_FACE_SOURCES = Object.fromEntries(
  Object.entries(FACES).map(([key, f]) => [key, f.src])
);

const FULL = { src: flexSrc, w: 458, h: 533 };
export const RONNIE_FLEX_SRC = flexSrc;

// The fixed box every face is laid out inside, sized to the tallest/widest
// head so nothing is ever clipped. Rendered at any `size`, the geometry below
// is expressed in percentages of this box, so one container controls layout
// and switching faces cannot move anything.
const HEAD_BOX = { w: 112, h: 153 };
const TARGET_CHEEK = HEAD_BOX.w * 0.7; // rendered skull width, identical for all seven
const CHIN_INSET = 2;                   // px of box left below the neck

// Resolved once at module load: each face's rendered width, and its left/top,
// as percentages of the box.
const FACE_LAYOUT = Object.fromEntries(Object.entries(FACES).map(([key, f]) => {
  const scale = TARGET_CHEEK / f.cheek;
  const width = f.w * scale;
  return [key, {
    src: f.src,
    width: `${(width / HEAD_BOX.w) * 100}%`,
    left: `${((HEAD_BOX.w - width) / 2 / HEAD_BOX.w) * 100}%`,
    top: `${((HEAD_BOX.h - CHIN_INSET - f.bottom * scale) / HEAD_BOX.h) * 100}%`
  }];
}));

export const RONNIE_MAX_HEAD_WIDTH = HEAD_BOX.w;
export const RONNIE_MAX_FULL_WIDTH = FULL.w;

export function normalizeExpression(expression) {
  return RONNIE_EXPRESSIONS.includes(expression) ? expression : DEFAULT_EXPRESSION;
}

// The artwork's own outline is near-black, which vanishes against the dark
// Ambient Glass surfaces. A stacked set of 1px light drop-shadows traces the
// alpha edge on all four sides to give it a thin rim, plus one soft wide
// shadow to ground him. Harmless on light surfaces (the rim reads as a faint
// halo), and it leaves the PNGs themselves untouched.
function rim(alpha, spread) {
  return [
    `drop-shadow(0 ${spread}px 0 rgba(255,255,255,${alpha}))`,
    `drop-shadow(0 -${spread}px 0 rgba(255,255,255,${alpha}))`,
    `drop-shadow(${spread}px 0 0 rgba(255,255,255,${alpha}))`,
    `drop-shadow(-${spread}px 0 0 rgba(255,255,255,${alpha}))`,
    'drop-shadow(0 3px 7px rgba(0,0,0,0.38))'
  ].join(' ');
}

// A head is ~100px of artwork, so it needs a full 1px of rim to separate from
// the gradient. The full body is twice that and the same rim reads as a sticker
// die-cut around him, so it is thinner and much softer there — just enough to
// keep the outline from dissolving.
const HEAD_RIM = rim(0.72, 1);
const FULL_RIM = rim(0.3, 1);

// Every face ships in the same Today row, so the browser fetches them all as
// soon as the row mounts. These hints move that fetch earlier, before React
// has committed, so the first line already has the right face and a reroll
// crossfades into an image that is already decoded.
let preloaded = false;
export function preloadRonnieFaces() {
  if (preloaded || typeof document === 'undefined') return;
  preloaded = true;
  for (const { src } of Object.values(FACES)) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);
  }
}

export default function Ronnie({
  variant = 'head',
  expression = DEFAULT_EXPRESSION,
  size,
  onPress,
  decorative = true,
  className = ''
}) {
  useEffect(preloadRonnieFaces, []);

  const isFull = variant === 'full';
  const box = isFull ? FULL : HEAD_BOX;
  const width = Math.min(Math.round(size ?? (isFull ? 240 : 96)), box.w);
  const height = Math.round(width * (box.h / box.w));
  const current = normalizeExpression(expression);

  const alt = decorative ? '' : 'Ronnie, your gym buddy';
  const imgProps = {
    alt,
    'aria-hidden': decorative ? 'true' : undefined,
    draggable: false,
    decoding: 'async'
  };

  const art = isFull ? (
    <img
      {...imgProps}
      src={FULL.src}
      width={width}
      height={height}
      style={{ display: 'block', width, height, filter: FULL_RIM }}
    />
  ) : (
    // Every face is mounted and crossfaded by opacity alone — no mount/unmount,
    // no reflow, and the incoming face is already decoded. Each one is placed
    // by its own measured geometry, so the crossfade is a pure dissolve
    // between two heads of the same size with their chins in the same place.
    RONNIE_EXPRESSIONS.map((key) => {
      const layout = FACE_LAYOUT[key];
      return (
        <img
          {...imgProps}
          key={key}
          src={layout.src}
          className="ronnie-face-layer"
          style={{
            position: 'absolute',
            left: layout.left,
            top: layout.top,
            width: layout.width,
            height: 'auto',
            opacity: key === current ? 1 : 0,
            filter: HEAD_RIM
          }}
        />
      );
    })
  );

  const frameStyle = {
    position: 'relative',
    display: 'block',
    width,
    height,
    flexShrink: 0
  };

  if (!onPress) {
    return <span className={className} style={frameStyle}>{art}</span>;
  }

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label="Ronnie, your gym buddy"
      className={className}
      style={{ ...frameStyle, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
    >
      {art}
    </button>
  );
}
