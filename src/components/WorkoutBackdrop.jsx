import { useEffect, useRef, useState } from 'react';
import { RONNIE_FLEX_SRC } from '../ui/Ronnie.jsx';

// RONNIE, BEHIND THE WORKOUT.
//
// A single fixed image layer that sits between the Ambient Glass gradient and
// everything on the active-session screen. He is atmosphere, not content: the
// layer never takes a pointer event, never enters the accessibility tree, and
// never moves anything — only `opacity` and `transform` are ever animated.
//
// He fades UP with the session. At zero completed sets he is a barely-there
// shape in the gradient; by the last set he is clearly in the room. That is
// the same idea as the body map's "lights up as you log", applied to the
// whole screen rather than to one card.
//
// Mounted only while a session is active (WorkoutScreen renders it, nothing
// else does), so no other screen ever pays for it.

// The art is cropped mid-shin, so he is anchored BELOW the bottom of the
// viewport: the crop line ends up behind the tab bar and is never visible.
const BOTTOM_OFFSET = -40; // px

// Native width is 458, and the ceiling is ~1.3x that — but the ceiling turned
// out not to be the interesting constraint. Rendered near full column width his
// face lands exactly where the set rows' numbers are, and a recognisable face
// behind data reads as a rendering bug however faint it is. At ~85% of the
// column he sits lower and smaller, the detailed region falls behind the end of
// a card rather than its middle, and he reads as someone standing in the room.
const WIDTH = 'min(86%, 360px)';

// Both ends dissolve into the gradient so he has no edge anywhere: the top of
// his head fades out before it reaches the content, and his shins fade out
// well before the tab bar, so the mid-shin crop in the artwork is never seen.
const MASK = 'linear-gradient(to bottom, transparent 0%, #000 30%, #000 64%, transparent 92%)';

function clamp01(n) {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export default function WorkoutBackdrop({ completedSets = 0, totalSets = 0 }) {
  const progress = clamp01(totalSets > 0 ? completedSets / totalSets : 0);

  // One brief brightening the moment the last set lands — a reaction, not a
  // state. Keyed so the animation restarts if the user unchecks and recompletes.
  const [flareKey, setFlareKey] = useState(0);
  const wasComplete = useRef(progress >= 1);
  useEffect(() => {
    const complete = progress >= 1 && totalSets > 0;
    if (complete && !wasComplete.current) setFlareKey((k) => k + 1);
    wasComplete.current = complete;
  }, [progress, totalSets]);

  // Faint at 0%, clearly present at 100%. Both curves are linear in progress so
  // the change is legible set by set rather than arriving all at the end.
  const opacity = 0.12 + progress * 0.18;   // 0.12 -> 0.30
  const saturate = 1.0 + progress * 0.7;    // 1.0  -> 1.7, so he gains colour too

  return (
    <div
      aria-hidden="true"
      key={flareKey}
      className={`ronnie-backdrop${flareKey ? ' ronnie-backdrop-flare' : ''}`}
      style={{
        position: 'fixed',
        bottom: BOTTOM_OFFSET,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 'var(--layout-max-width, 512px)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        // -1 rather than 0: `position: relative` on the screen root creates no
        // stacking context, so a negative index puts him above the <html>
        // gradient and below every in-flow element on the page without any
        // sibling needing a z-index of its own.
        zIndex: -1,
        maskImage: MASK,
        WebkitMaskImage: MASK
      }}
    >
      <img
        src={RONNIE_FLEX_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        className="ronnie-backdrop-art"
        style={{
          width: WIDTH,
          height: 'auto',
          display: 'block',
          opacity,
          // Three things are happening here, all of them load-bearing:
          //
          //   grayscale + sepia + hue-rotate   pushes him off his own brown and
          //     into the maroon the screen is already made of
          //   contrast(0.3)   flattens his internal line work. This is what
          //     stops him reading as a picture: at full contrast his eyes and
          //     teeth stay legible through the glass at any opacity low enough
          //     to be tasteful, and a legible face behind a column of numbers
          //     looks like a bug. Flattened, he is shape and volume only.
          //   soft-light   lets the gradient behind him do the final colouring,
          //     so he belongs to the background rather than sitting on it.
          //
          // No blur anywhere: this is a column-wide fixed layer, and blurring
          // one costs a compositing pass on every scroll of the screen the user
          // spends the most time on.
          filter: `grayscale(1) contrast(0.3) brightness(1.05) sepia(0.35) hue-rotate(-20deg) saturate(${saturate})`,
          mixBlendMode: 'soft-light',
          transition: 'opacity var(--motion-slow) var(--motion-ease), filter var(--motion-slow) var(--motion-ease)'
        }}
      />
    </div>
  );
}
