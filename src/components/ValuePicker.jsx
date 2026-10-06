import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { color } from '../theme/tokens.js';

// THE SET VALUE PICKER — a ruler dial with a stepper on either side.
//
// It replaces the vertical wheel. The wheel was accurate but it was the only
// control on the screen: one value, one gesture, no context. This one answers
// the question the gym actually asks — "what did I do last time, and what am I
// supposed to do now" — by putting those two numbers on the sheet as chips you
// can tap, and leaving the ruler for everything in between.
//
// Three ways in, all equal:
//   · the ± steppers, for the one-notch adjustment that is most edits
//   · the ruler, dragged, for a bigger jump
//   · the chips (Same as last / Last N / Target N), for the common answer
//
// Geometry: the ruler is an offset in px, where offset = (value - min)/step
// times TICK_GAP. The needle is always dead centre; the ruler moves under it.

const TICK_GAP = 16;     // px between adjacent steps
const RULER_H = 86;
// Ticks arrive and leave rather than being clipped at the edge.
const EDGE_FADE = 'linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)';
const FRICTION = 0.0022; // px/ms^2
const SNAP_TENSION = 0.26;

export default function ValuePicker({
  open,
  title,
  value,
  min,
  max,
  step,
  unit,
  noun,                 // what the confirm button counts: "reps", or unit
  lastValue = null,     // previous session's value for this set, if any
  targetValue = null,   // progression target, if any
  onCancel,
  onConfirm,
  stepOptions,
  onStepChange
}) {
  // WHERE THE NOTCHES SIT.
  //
  // Normally on the round lattice from zero, so the ruler is labelled 55, 60,
  // 65 like a tape measure. But a set already logged at 81.5 kg is not on a
  // 1 kg lattice, and snapping it there would silently rewrite the weight to 82
  // the moment you confirmed. So a value that is off-lattice anchors the whole
  // ruler on itself instead: 81.5 steps to 82.5 and 80.5, the way plates
  // actually come on and off a bar.
  //
  // Re-decided whenever the increment changes, against the value on screen —
  // otherwise switching 1 kg → 2.5 kg at 82 kg would nudge the reading to 82.5
  // without anyone asking for it.
  const [val, setVal] = useState(value);
  const [anchor, setAnchor] = useState(() => (onLattice(value, step) ? 0 : value));
  const lastStepRef = useRef(step);
  if (lastStepRef.current !== step) {
    lastStepRef.current = step;
    const next = onLattice(val, step) ? 0 : val;
    // Deriving state during render: React discards this pass and re-runs with
    // the new anchor, so nothing downstream ever sees the stale lattice.
    if (next !== anchor) setAnchor(next);
  }

  // A labelled tick every few notches, chosen so the printed interval is a
  // number a person would write: every 5 at 1 kg, every 4 at 2.5 kg.
  const majorEvery = useMemo(() => {
    for (const m of [5, 4, 10, 2]) {
      const span = step * m;
      if (Math.abs(span - Math.round(span)) < 1e-9 && Math.round(span) % 5 === 0) return m;
    }
    return 5;
  }, [step]);

  const quantize = useCallback((v) => {
    const inv = 1e6;
    const q = Math.round((v - anchor) / step) * step + anchor;
    return Math.min(max, Math.max(min, Math.round(q * inv) / inv));
  }, [anchor, min, max, step]);

  const [dragging, setDragging] = useState(false);
  // Whether the strip animates to its next offset. Off while a finger is on it
  // and while the release is settling; on for taps, which should glide.
  const [smooth, setSmooth] = useState(true);

  const trackRef = useRef(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef(null);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastTickRef = useRef(null);
  const pointerIdRef = useRef(null);
  const [width, setWidth] = useState(320);

  // Offsets are measured from the first notch at or above min.
  const base = useMemo(() => {
    const k = Math.ceil((min - anchor) / step - 1e-9);
    return anchor + k * step;
  }, [anchor, min, step]);
  const steps = Math.max(1, Math.floor((max - base) / step + 1e-9));
  const maxOffset = steps * TICK_GAP;

  const offsetOf = useCallback((v) => ((v - base) / step) * TICK_GAP, [base, step]);
  const valueOf = useCallback(
    (off) => quantize(base + (off / TICK_GAP) * step),
    [base, step, quantize]
  );

  const cancelRaf = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  // Commit the offset to a displayed value, with one haptic tick per notch.
  const syncValue = useCallback(() => {
    const v = valueOf(offsetRef.current);
    if (v !== lastTickRef.current) {
      lastTickRef.current = v;
      setVal(v);
      if (navigator.vibrate) { try { navigator.vibrate(1); } catch {} }
    }
  }, [valueOf]);

  const paint = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.setProperty('--ruler-offset', `${-offsetRef.current}px`);
    }
  }, []);

  // Move the ruler to a value. Used by the steppers and the chips, so every
  // route to a number ends up in the same place.
  //
  // THE VALUE CHANGES IMMEDIATELY and the travel is a CSS transition, not an
  // animation frame loop. Driving a discrete ± tap through requestAnimationFrame
  // made the new value depend on frames being delivered at all: in a background
  // tab, or under a reduced-motion/throttled frame clock, the button animated
  // nothing and committed nothing.
  const glideTo = useCallback((v) => {
    const next = quantize(v);
    cancelRaf();
    velocityRef.current = 0;
    setSmooth(true);
    lastTickRef.current = next;
    setVal(next);
    offsetRef.current = offsetOf(next);
    paint();
    if (navigator.vibrate) { try { navigator.vibrate(1); } catch {} }
  }, [offsetOf, quantize, paint]);

  const settle = useCallback(() => {
    lastTimeRef.current = performance.now();
    const tick = (t) => {
      const dt = Math.min(48, t - lastTimeRef.current);
      lastTimeRef.current = t;
      if (Math.abs(velocityRef.current) > 0.03) {
        const dir = Math.sign(velocityRef.current);
        const next = velocityRef.current - dir * FRICTION * dt;
        velocityRef.current = Math.sign(next) === dir ? next : 0;
        offsetRef.current += velocityRef.current * dt;
        offsetRef.current = Math.max(0, Math.min(maxOffset, offsetRef.current));
        if (offsetRef.current === 0 || offsetRef.current === maxOffset) velocityRef.current = 0;
        paint(); syncValue();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // Snap to the nearest notch.
      const target = offsetOf(valueOf(offsetRef.current));
      const delta = target - offsetRef.current;
      if (Math.abs(delta) < 0.4) {
        offsetRef.current = target;
        paint(); syncValue();
        rafRef.current = null;
        setSmooth(true);
        return;
      }
      offsetRef.current += delta * SNAP_TENSION;
      paint(); syncValue();
      rafRef.current = requestAnimationFrame(tick);
    };
    cancelRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [maxOffset, offsetOf, valueOf, paint, syncValue]);

  // Open / re-target. Deliberately keyed on the incoming value only: changing
  // the increment must not snap the dial back to where the sheet opened.
  const quantizeRef = useRef(quantize);
  quantizeRef.current = quantize;
  useLayoutEffect(() => {
    if (!open) return;
    cancelRaf();
    const v = quantizeRef.current(value);
    offsetRef.current = offsetOf(v);
    velocityRef.current = 0;
    lastTickRef.current = v;
    setVal(v);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  // The ruler is drawn in px, so it needs its own width to know which ticks
  // are on screen.
  useLayoutEffect(() => {
    if (!open) return;
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 320);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [open]);

  // A changed increment (1 → 2.5 kg), or a jump that re-anchored the lattice,
  // must not move the needle: re-derive the offset for the value already shown.
  useLayoutEffect(() => {
    if (!open) return;
    cancelRaf();
    offsetRef.current = offsetOf(val);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, anchor]);

  useEffect(() => () => cancelRaf(), []);

  // Escape closes, and the page behind does not scroll — the same contract as
  // every other sheet (ui/BottomSheet.jsx). The wheel this replaced only
  // honoured Escape while the wheel itself had keyboard focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel?.(); } };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  // Pointer ---------------------------------------------------------------
  const onPointerDown = (e) => {
    cancelRaf();
    trackRef.current?.setPointerCapture?.(e.pointerId);
    pointerIdRef.current = e.pointerId;
    draggingRef.current = true;
    setDragging(true);
    setSmooth(false);
    startXRef.current = e.clientX;
    lastXRef.current = e.clientX;
    startOffsetRef.current = offsetRef.current;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    const now = performance.now();
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    const dt = Math.max(1, now - lastTimeRef.current);
    lastTimeRef.current = now;
    velocityRef.current = velocityRef.current * 0.6 + (-dx / dt) * 0.4;
    offsetRef.current = Math.max(0, Math.min(
      maxOffset, startOffsetRef.current - (e.clientX - startXRef.current)
    ));
    paint();
    syncValue();
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (pointerIdRef.current != null) {
      try { trackRef.current?.releasePointerCapture(pointerIdRef.current); } catch {}
    }
    pointerIdRef.current = null;
    settle();
  };

  // A shortcut chip lands on the number that was actually recorded. If that
  // number is off the current lattice (last week's 81.5 under a 2.5 kg
  // increment), the lattice moves to meet it rather than the number being
  // rounded to fit — the chip says "Last 81.5", so tapping it must give 81.5.
  const jumpTo = (raw) => {
    const v = Math.min(max, Math.max(min, raw));
    const nextAnchor = onLattice(v, step) ? 0 : v;
    cancelRaf();
    velocityRef.current = 0;
    setSmooth(true);
    lastTickRef.current = v;
    setVal(v);
    if (nextAnchor !== anchor) {
      // The layout effect above repaints once the new lattice is in place.
      setAnchor(nextAnchor);
    } else {
      offsetRef.current = offsetOf(v);
      paint();
    }
    if (navigator.vibrate) { try { navigator.vibrate(1); } catch {} }
  };

  const nudge = (dir) => {
    const next = quantize(val + dir * step);
    if (next === val) return;
    glideTo(next);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
    else if (e.key === 'Enter') onConfirm(val);
    else if (e.key === 'Escape') onCancel();
  };

  // Chips -----------------------------------------------------------------
  // Only what the data supports. A "Target" chip with nothing behind it is a
  // lie, so it does not render. The numbers are shown EXACTLY as recorded —
  // quantising them to the current increment made a chip advertise a weight
  // nobody had lifted.
  const last = lastValue != null ? clampTo(lastValue, min, max) : null;
  const target = targetValue != null ? clampTo(targetValue, min, max) : null;
  const chips = [];
  if (last != null) chips.push({ key: 'last', label: `Last ${fmt(last)}`, value: last });
  if (target != null && target !== last) chips.push({ key: 'target', label: `Target ${fmt(target)}`, value: target });

  // Which ticks are on screen, derived from the COMMITTED value rather than
  // from the live offset ref. The ref is mutated outside React, so a render
  // triggered by something else (switching the increment, say) used to lay the
  // ticks out against last render's offset — which is how a 1 kg → 2.5 kg
  // switch redrew the ruler around 200 kg while the needle still read 81.5.
  const ticks = useMemo(() => {
    if (!open) return [];
    const centre = offsetOf(val);
    const half = width / 2;
    const first = Math.max(0, Math.floor((centre - half) / TICK_GAP) - 1);
    const lastI = Math.min(steps, Math.ceil((centre + half) / TICK_GAP) + 1);
    const out = [];
    for (let i = first; i <= lastI; i++) {
      out.push({ i, major: i % majorEvery === 0, value: quantize(base + i * step) });
    }
    return out;
    // Recomputed on every value change, which is once per notch — cheap, and it
    // keeps the DOM to roughly one screen of ticks instead of 500.
  }, [open, width, val, steps, base, step, majorEvery, quantize, offsetOf]);

  if (!open) return null;

  const unitSuffix = noun || unit || 'reps';
  const atMin = val <= min;
  const atMax = val >= max;

  return (
    // The SAME chrome as every other bottom sheet in the app (see
    // ui/BottomSheet.jsx). The inherited version used `bg-glass/85`, which
    // Tailwind resolves by overriding the token's own alpha — so the panel
    // rendered as 85% WHITE over the dark app rather than as glass.
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-bg/70 anim-fade" onClick={onCancel} aria-hidden="true" />
      <div
        className="relative w-full max-w-app anim-sheet glass-surface glass-blur bg-glass
                   border-t border-x border-glass-border rounded-t-device shadow-sheet safe-bottom"
      >
        <div className="flex justify-center pt-md pb-xs" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-ink/25" />
        </div>

        <p className="mt-md text-center text-micro font-semibold uppercase text-ink-tertiary">{title}</p>

        {/* Value + steppers ------------------------------------------------ */}
        <div className="mt-md px-base flex items-center justify-between gap-base">
          <StepperButton label={`Decrease by ${fmt(step)}`} icon={Minus} disabled={atMin} onClick={() => nudge(-1)} />

          <div className="flex-1 flex flex-col items-center gap-sm min-w-0">
            <p className="flex items-baseline justify-center gap-xs">
              <span
                className="text-ink tabular font-semibold leading-none"
                style={{ fontSize: 56, letterSpacing: '-0.035em' }}
                aria-live="polite"
              >
                {fmt(val)}
              </span>
              <span className="text-body font-regular text-ink-secondary">{unitSuffix}</span>
            </p>
            {last != null && (
              <button
                type="button"
                onClick={() => jumpTo(last)}
                disabled={val === last}
                className="h-8 px-md rounded-full bg-glass-inset border border-glass-inset-border
                           text-label font-semibold text-ink disabled:opacity-40
                           transition-colors duration-fast ease-out active:bg-glass-pressed"
              >
                Same as last
              </button>
            )}
          </div>

          <StepperButton label={`Increase by ${fmt(step)}`} icon={Plus} disabled={atMax} onClick={() => nudge(1)} />
        </div>

        {/* Ruler ------------------------------------------------------------ */}
        <div className="mt-base px-base">
          <div
            ref={trackRef}
            tabIndex={0}
            role="slider"
            aria-label={title}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={val}
            aria-valuetext={`${fmt(val)} ${unitSuffix}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            className="relative overflow-hidden rounded-card bg-glass-inset outline-none select-none"
            style={{
              height: RULER_H,
              touchAction: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              cursor: dragging ? 'grabbing' : 'grab',
              '--ruler-offset': `${-offsetOf(val)}px`
            }}
          >
            {/* Ticks are MASKED at the edges rather than covered by a painted
                fade: the sheet is translucent, so a solid-colour overlay would
                be a visible dark block over whatever is behind it. The mask
                sits on a full-width wrapper — the moving strip is a zero-width
                box on the centre line and has no edges of its own to fade. */}
            <div
              className="absolute inset-0"
              style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
            >
            <div
              className="absolute inset-y-0"
              style={{
                left: '50%',
                transform: 'translateX(var(--ruler-offset))',
                willChange: 'transform',
                transition: smooth ? 'transform var(--motion-base) var(--motion-ease)' : 'none'
              }}
            >
              {ticks.map((t) => (
                <span key={t.i} className="absolute" style={{ left: t.i * TICK_GAP }}>
                  <span
                    className="absolute block rounded-full"
                    style={{
                      left: -0.75,
                      top: t.major ? 18 : 24,
                      width: 1.5,
                      height: t.major ? 30 : 18,
                      background: t.major ? color.dataStrong : color.data
                    }}
                  />
                  {t.major && (
                    <span
                      className="absolute text-micro font-semibold text-ink-tertiary tabular"
                      style={{ top: 54, left: 0, transform: 'translateX(-50%)', letterSpacing: 0 }}
                    >
                      {fmt(t.value)}
                    </span>
                  )}
                </span>
              ))}
            </div>
            </div>

            {/* The needle. Always centred: the ruler moves, the reading does not. */}
            <span
              className="pointer-events-none absolute rounded-full bg-ink"
              style={{ left: 'calc(50% - 1.5px)', top: 12, width: 3, height: 44 }}
            />
          </div>
        </div>

        {/* Increment ------------------------------------------------------- */}
        {stepOptions && stepOptions.length > 0 && (
          <div className="mt-base flex justify-center">
            <div className="inline-flex rounded-control bg-glass-inset p-0.5" role="group" aria-label="Increment">
              {stepOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStepChange?.(s)}
                  aria-pressed={s === step}
                  className={`h-9 px-base rounded-md text-label font-semibold tabular transition-colors duration-fast ease-out ${
                    s === step ? 'bg-primary text-on-primary' : 'text-ink-tertiary active:bg-glass-pressed'
                  }`}
                >
                  {fmt(s)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shortcut chips --------------------------------------------------- */}
        {chips.length > 0 && (
          <div className="mt-base flex justify-center gap-md px-base">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => jumpTo(c.value)}
                aria-pressed={val === c.value}
                className={`h-tap px-lg rounded-full border text-body font-regular tabular
                            transition-colors duration-fast ease-out active:bg-glass-pressed ${
                  val === c.value
                    ? 'bg-glass-pressed border-glass-border text-ink'
                    : 'bg-glass-inset border-glass-inset-border text-ink-secondary'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Commit ----------------------------------------------------------- */}
        <div className="mt-lg px-base pb-base flex items-center gap-md">
          <button
            type="button"
            onClick={onCancel}
            className="h-tap px-lg rounded-full bg-glass-inset border border-glass-inset-border
                       text-body font-semibold text-ink-secondary
                       transition-colors duration-fast ease-out active:bg-glass-pressed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(val)}
            className="flex-1 h-tap rounded-full bg-primary text-on-primary text-body font-semibold tabular
                       transition-colors duration-fast ease-out active:bg-primary-pressed"
          >
            Set {fmt(val)} {unitSuffix}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepperButton({ icon: Icon, label, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="shrink-0 w-14 h-14 rounded-full bg-glass-inset border border-glass-inset-border
                 flex items-center justify-center text-ink disabled:opacity-30
                 transition-colors duration-fast ease-out active:bg-glass-pressed"
    >
      <Icon size={22} strokeWidth={2.2} />
    </button>
  );
}

function clampTo(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Is this value already a whole number of steps from zero?
function onLattice(v, step) {
  const n = (v || 0) / step;
  return Math.abs(n - Math.round(n)) < 1e-9;
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}
