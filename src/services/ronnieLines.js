// RONNIE'S LINE SELECTION.
//
// Pure functions over src/data/ronnieLines.js — no React, no storage. The
// caller (RonnieBanter) owns the "which line did we show last" state and
// persists it; everything here just answers "given this mood, this context,
// and this queue, what's next".
import { RONNIE_LINES } from '../data/ronnieLines.js';

// The three intensity levels, quietest first. Intensity is independent of
// mood: it decides which lines are *eligible* and how they are styled, never
// which face Ronnie is wearing.
export const RONNIE_INTENSITIES = ['cold', 'doghouse', 'loud'];
export const DEFAULT_INTENSITY = 'doghouse';

export function normalizeIntensity(intensity) {
  return RONNIE_INTENSITIES.includes(intensity) ? intensity : DEFAULT_INTENSITY;
}

const TOKEN_RE = /\{(\w+)\}/g;

// Local time formatted the way Ronnie talks about it: "4am", "11:30pm" — no
// leading zero, minutes dropped entirely on the hour.
export function formatClockToken(ms) {
  const d = new Date(ms);
  const hour24 = d.getHours();
  const minute = d.getMinutes();
  const period = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 || 12;
  return minute === 0 ? `${hour12}${period}` : `${hour12}:${String(minute).padStart(2, '0')}${period}`;
}

// `loud` is a render-time transform, not a second copy of every line: shout
// the whole thing, and a line that merely ends is now a line that demands.
// Applied after token substitution so "{time}" becomes "4AM" too.
export function applyIntensity(text, intensity) {
  if (text == null) return text;
  if (normalizeIntensity(intensity) !== 'loud') return text;
  const shouted = text.toUpperCase();
  return shouted.endsWith('.') ? `${shouted.slice(0, -1)}!` : shouted;
}

// Substitutes {daysSince}/{time}/{workout} from `context`. Returns
// null — never a string with a raw "{token}" in it — if any referenced token
// is missing or unknown, so the caller can drop the line from the pool.
export function resolveLineText(line, context) {
  let missing = false;
  const text = line.text.replace(TOKEN_RE, (_, key) => {
    const value = context[key];
    if (value === null || value === undefined) { missing = true; return ''; }
    return String(value);
  });
  return missing ? null : text;
}

const REQUIRES_RE = /^(\w+)\s*(==|>=|<=|>|<)?\s*(-?\d+(?:\.\d+)?)?$/;

// Evaluates one line's `requires` string against `context`. A bare identifier
// ("hasHistory", "newPR") is a truthiness check; the comparison forms used in
// ronnieLines.js are the only grammar supported. An unrecognised expression
// fails closed (the line is excluded) rather than risking an eval of anything
// resembling user-controlled text.
export function requirementMet(requires, context) {
  if (!requires) return true;
  const match = REQUIRES_RE.exec(requires.trim());
  if (!match) return false;
  const [, key, op, numStr] = match;
  const value = context[key];
  if (!op) return Boolean(value);
  if (value === null || value === undefined) return false;
  const num = Number(numStr);
  const n = Number(value);
  switch (op) {
    case '==': return n === num;
    case '>=': return n >= num;
    case '<=': return n <= num;
    case '>': return n > num;
    case '<': return n < num;
    default: return false;
  }
}

// Every line for `mood` that this intensity allows, whose `requires` is met
// and whose tokens all resolve. Two fallbacks, in order: if the intensity's
// pool is empty for this mood, fall back to the `doghouse` tier (the brief's
// rule — `cold` hype would otherwise have nothing to say if its three lines
// were ever removed); if the conditional pool is then still empty, fall back
// to that mood's unconditional lines, so a mood is never left mute.
function tierPool(mood, intensity, lines) {
  return lines.filter((l) => l.mood === mood && (l.tiers || RONNIE_INTENSITIES).includes(intensity));
}

export function eligibleLines(mood, context, options = {}) {
  const { intensity = DEFAULT_INTENSITY, lines = RONNIE_LINES } = options;
  const tier = normalizeIntensity(intensity);
  let pool = tierPool(mood, tier, lines);
  if (!pool.length && tier !== DEFAULT_INTENSITY) pool = tierPool(mood, DEFAULT_INTENSITY, lines);
  const eligible = pool.filter((l) => requirementMet(l.requires, context) && resolveLineText(l, context) != null);
  if (eligible.length) return eligible;
  return pool.filter((l) => !l.requires && resolveLineText(l, context) != null);
}

export function shuffleLines(lines, rng = Math.random) {
  const arr = lines.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// One step of the "shuffle-bag" cycle: consumes from `queue`, refilling with a
// fresh shuffle of `eligible` when it runs dry, and rotating the head to the
// back if it would repeat `lastId` immediately (only possible right after a
// reshuffle, and only when there's more than one eligible line to rotate in).
//
// Pure and deterministic given `rng`, so tests can assert "never repeats"
// without depending on Math.random.
export function nextLine({ eligible, queue = [], lastId = null, rng = Math.random }) {
  if (!eligible.length) return { line: null, queue: [] };
  let q = queue.filter((queued) => eligible.some((e) => e.id === queued.id));
  if (!q.length) q = shuffleLines(eligible, rng);
  if (q[0].id === lastId && q.length > 1) q = [...q.slice(1), q[0]];
  const [line, ...rest] = q;
  return { line, queue: rest };
}
