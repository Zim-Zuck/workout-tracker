import { useEffect, useRef, useState } from 'react';
import { Ronnie } from '../ui/index.js';
import { RONNIE_BUBBLE, RONNIE_INTENSITY_TEXT } from '../theme/ronnie.js';
import {
  eligibleLines, nextLine, resolveLineText, applyIntensity, normalizeIntensity
} from '../services/ronnieLines.js';
import { WEEKLY_PACE_LINES } from '../data/weeklyPaceLines.js';
import { weeklyPaceState, WEEKLY_PACE_STATES } from '../services/weeklyVolumeProjection.js';

const LAST_LINE_KEY = 'ronnie.weeklyPaceLastLineId';

function readLastLineId() {
  try { return localStorage.getItem(LAST_LINE_KEY); } catch { return null; }
}
function writeLastLineId(id) {
  try { localStorage.setItem(LAST_LINE_KEY, id); } catch { /* best-effort */ }
}

// Tonnes, one decimal, trailing ".0" trimmed — "41", not "41.0", matching how
// the card's own fmtVol() reads when a value lands on a whole tonne.
function tonnes(kg) {
  return (Math.round((kg / 1000) * 10) / 10).toString();
}

// `?weeklyPaceMood=behind` forces a state for manual QA across all six pools.
// Dev-only — import.meta.env.DEV is stripped by the production build.
function devStateOverride() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('weeklyPaceMood');
  return WEEKLY_PACE_STATES.includes(requested) ? requested : null;
}

// RONNIE, REACTING TO THE WEEK SO FAR — the Weekly Volume card's own line,
// separate from the Today row (src/components/RonnieBanter.jsx): a different
// mood axis (pace state, not hype/sleepy/roast/impressed/smug) reacting to a
// different input (projectWeeklyVolume(), not streaks or PRs), so it keeps
// its own shuffle-bag and its own persisted "last shown" id rather than
// fighting the Today row over either.
//
// Renders nothing when there's no projection to react to (same "not enough
// history" guard as the rest of the card) or when the projection resolves to
// no eligible line.
export default function WeeklyPaceRonnie({ projection, intensity, className = '' }) {
  const tier = normalizeIntensity(intensity);
  const state = devStateOverride() || weeklyPaceState(projection);

  const context = projection ? {
    done: tonnes(projection.volumeDone),
    total: tonnes(projection.projected),
    weekday: new Date().toLocaleDateString(undefined, { weekday: 'long' })
  } : {};

  const eligible = state ? eligibleLines(state, context, { intensity: tier, lines: WEEKLY_PACE_LINES }) : [];

  const render = (line) => (line ? {
    id: line.id,
    text: applyIntensity(resolveLineText(line, context), tier),
    expression: line.expression
  } : null);

  const queueRef = useRef([]);
  const lastIdRef = useRef(readLastLineId());
  const prevStateRef = useRef(state);
  const prevTierRef = useRef(tier);
  const firstRender = useRef(true);
  const [currentLine, setCurrentLine] = useState(null); // { id, text, expression } | null
  const shownIdRef = useRef(null);
  const [fading, setFading] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');

  const draw = () => {
    const lastId = shownIdRef.current ?? lastIdRef.current;
    const { line, queue } = nextLine({ eligible, queue: queueRef.current, lastId });
    queueRef.current = queue;
    if (line) {
      lastIdRef.current = line.id;
      shownIdRef.current = line.id;
      writeLastLineId(line.id);
    }
    return render(line);
  };

  // A fresh line on mount, and on every pace-state or intensity change — never
  // on an ordinary re-render with the same state, so Ronnie isn't re-rolling
  // every time a set gets logged mid-render.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevStateRef.current = state;
      setCurrentLine(draw());
      return;
    }
    if (prevStateRef.current === state && prevTierRef.current === tier) return;
    prevStateRef.current = state;
    prevTierRef.current = tier;
    queueRef.current = [];
    setFading(true);
    const t = setTimeout(() => {
      setCurrentLine(draw());
      setFading(false);
    }, 120);
    return () => clearTimeout(t);
    // eligible/context deliberately excluded: closed over fresh at the moment
    // `state` changes, which is the only moment this effect should act.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tier]);

  const handleTap = () => {
    setFading(true);
    setTimeout(() => {
      const resolved = draw();
      setCurrentLine(resolved);
      setFading(false);
      if (resolved) setLiveMessage(resolved.text);
    }, 120);
  };

  if (!currentLine) return null;

  return (
    <div className={`flex items-center gap-sm ${className}`}>
      <Ronnie variant="head" expression={currentLine.expression} size={104} onPress={handleTap} />
      <div
        className="relative flex-1 min-w-0 flex flex-col justify-center gap-xxs transition-[opacity,transform] duration-fast ease-out"
        style={{
          minHeight: 84,
          padding: '12px 16px 14px 16px',
          borderRadius: 20,
          background: RONNIE_BUBBLE.background,
          color: RONNIE_BUBBLE.text,
          transform: `rotate(-1deg) scale(${fading ? 0.98 : 1})`,
          opacity: fading ? 0 : 1
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: -7, top: '50%', width: 16, height: 16, marginTop: -8,
            borderRadius: 3, background: RONNIE_BUBBLE.background, transform: 'rotate(45deg)'
          }}
        />
        <span className="relative text-micro font-semibold" style={{ color: RONNIE_BUBBLE.caption }}>
          RONNIE
        </span>
        <span className="relative text-body" style={{ lineHeight: 1.25, ...RONNIE_INTENSITY_TEXT[tier] }}>
          {currentLine.text}
        </span>
      </div>
      <span className="sr-only" aria-live="polite">{liveMessage}</span>
    </div>
  );
}
