import { useEffect, useRef, useState } from 'react';
import { Ronnie } from '../ui/index.js';
import { RONNIE_BUBBLE, RONNIE_INTENSITY_TEXT } from '../theme/ronnie.js';
import { RONNIE_MOODS, getRonnieMood } from '../services/ronnieMood.js';
import {
  eligibleLines, nextLine, resolveLineText, formatClockToken,
  applyIntensity, normalizeIntensity
} from '../services/ronnieLines.js';
import { getFirstLaunchAt } from '../db/database.js';
import { startOfDay } from '../utils/date.js';

const LAST_LINE_KEY = 'ronnie.lastLineId';

function readLastLineId() {
  try { return localStorage.getItem(LAST_LINE_KEY); } catch { return null; }
}
function writeLastLineId(id) {
  try { localStorage.setItem(LAST_LINE_KEY, id); } catch { /* best-effort */ }
}

function daysBetween(fromMs, toMs) {
  return Math.round((startOfDay(toMs) - startOfDay(fromMs)) / 86400000);
}

// `?ronnieMood=roast` forces a mood for manual QA across all five line sets.
// (Ronnie's face follows the intensity setting, not this.) Dev-only — import.meta.env.DEV is stripped by the
// production Vite build, so this branch (and the URL check) never ships.
function devMoodOverride() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('ronnieMood');
  return RONNIE_MOODS.includes(requested) ? requested : null;
}

// Draws the next line from the shuffle-bag, mutating the two refs it's given
// and persisting the id so it survives across app opens. A plain function
// rather than a hook: it's called from three different places (mount, tap,
// mood-change) and none of them need it to be memoized.
//
// `shownId` — the line actually on screen right now — is what the no-repeat
// guard is measured against, falling back to the persisted id on the very
// first draw of a session. Anchored to the visible line rather than to the
// persisted one so the "never twice in a row" promise is about what the user
// sees. Note that this function has side effects (it advances the bag and
// writes to storage), so it must be called from an event handler or an
// effect — never from render or from inside a setState updater, which React
// may invoke more than once per update.
function drawLine(eligible, queueRef, lastIdRef, shownId) {
  const lastId = shownId ?? lastIdRef.current;
  const { line, queue } = nextLine({ eligible, queue: queueRef.current, lastId });
  queueRef.current = queue;
  if (line) { lastIdRef.current = line.id; writeLastLineId(line.id); }
  return line;
}

// THE TODAY ROW — Ronnie plus his speech bubble.
//
// Owns mood selection, line selection and the bubble. Ronnie himself
// (src/ui/Ronnie.jsx) is pure presentation; everything that reasons about the
// user's actual training lives here, one layer up, so Ronnie stays reusable
// for a future Progress/post-workout placement without this logic following
// it.
export default function RonnieBanter({ workouts, totals, workoutName, latestPR, intensity, className = '' }) {
  const tier = normalizeIntensity(intensity);
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  useEffect(() => {
    getFirstLaunchAt().then(setAccountCreatedAt).catch(() => {});
  }, []);

  const now = Date.now();
  const lastSession = workouts?.[0] || null;
  const hasHistory = !!lastSession;
  const daysSince = lastSession ? daysBetween(lastSession.date, now) : null;
  const newPRAt = latestPR?.date ?? null;
  const newPR = newPRAt != null && now - newPRAt <= 6 * 3600000;

  const computedMood = getRonnieMood({
    lastWorkoutDate: lastSession?.date ?? null,
    newPRAt,
    sessionsThisWeek: totals?.thisWeek ?? 0,
    streakWeeks: totals?.streakWeeks ?? 0,
    hasHistory,
    accountCreatedAt
  }, now);
  const mood = devMoodOverride() || computedMood;

  const context = {
    sessionsThisWeek: totals?.thisWeek ?? 0,
    hasHistory,
    daysSince,
    streak: totals?.streakWeeks ?? 0,
    newPR,
    time: formatClockToken(now),
    workout: workoutName ?? null
  };
  const eligible = eligibleLines(mood, context, { intensity: tier });

  // Token substitution first, then the intensity transform, so `loud` shouts
  // the resolved text ("IT'S 4AM...") rather than the template.
  // The face travels with the line, so the bubble and the head always agree.
  const render = (line) => (line ? {
    id: line.id,
    text: applyIntensity(resolveLineText(line, context), tier),
    expression: line.expression
  } : null);

  const queueRef = useRef([]);
  const lastIdRef = useRef(readLastLineId());
  const prevMoodRef = useRef(mood);
  const prevTierRef = useRef(tier);
  const firstRender = useRef(true);
  const [currentLine, setCurrentLine] = useState(null); // { id, text, expression } | null
  // What the bubble is showing, as a ref rather than read back out of state:
  // the next draw needs it synchronously, and state may not have flushed yet.
  const shownIdRef = useRef(null);
  const [fading, setFading] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');

  // One draw, one visible line. Side-effecting, so every caller is an event
  // handler or an effect.
  const draw = () => {
    const line = drawLine(eligible, queueRef, lastIdRef, shownIdRef.current);
    if (line) shownIdRef.current = line.id;
    return render(line);
  };

  // Picks the opening line once per mount, and a fresh one whenever the mood
  // itself changes (e.g. finishing a workout flips the row to hype) — but
  // never on an ordinary re-render or data refresh with the same mood, per
  // the brief: the line only changes on screen open, tap, or mood change.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevMoodRef.current = mood;
      setCurrentLine(draw());
      return;
    }
    if (prevMoodRef.current === mood && prevTierRef.current === tier) return;
    prevMoodRef.current = mood;
    prevTierRef.current = tier;
    queueRef.current = []; // new mood or new intensity, new shuffle-bag
    setFading(true);
    const t = setTimeout(() => {
      setCurrentLine(draw());
      setFading(false);
    }, 120);
    return () => clearTimeout(t);
    // eligible/context deliberately excluded: they're closed over fresh at the
    // moment `mood` changes, which is the only moment this effect should act.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, tier]);

  const handleTap = () => {
    setFading(true);
    setTimeout(() => {
      const resolved = draw();
      setCurrentLine(resolved);
      setFading(false);
      // Announced on tap only — never on mount or an automatic mood change.
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
        <span
          className="relative text-micro font-semibold"
          style={{ color: RONNIE_BUBBLE.caption }}
        >
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
