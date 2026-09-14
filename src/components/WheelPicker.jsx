import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Premium wheel picker with pointer-driven physics, momentum, rubber-band edges,
// per-item scale/opacity falloff, and precise snap-to-value on release.
// Values are stored in items[]; the wheel's transform is an "offset" in px,
// where offset = 0 places items[0] at the center, and offset = index * ITEM_H
// places items[index] at the center.

const ITEM_H = 44;
const VISIBLE = 5; // odd; determines viewport height and falloff distance
const VIEW_H = ITEM_H * VISIBLE;
const CENTER = VIEW_H / 2;

// Physics tuning.
const FRICTION = 0.0018;   // deceleration in px/ms^2 (kinetic scroll)
const SNAP_TENSION = 0.22; // spring approach factor per frame at 60fps
const SNAP_DAMP = 0.68;    // velocity damping per frame
const RUBBER = 0.55;       // how much drag past edges resists

export default function WheelPicker({
  open, title, value, min, max, step, unit, onCancel, onConfirm,
}) {
  const items = useMemo(() => {
    const arr = [];
    const inv = 1 / step;
    for (let v = min; v <= max + 1e-9; v += step) {
      arr.push(Math.round(v * inv) / inv);
    }
    return arr;
  }, [min, max, step]);

  const indexOfValue = useCallback((v) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < items.length; i++) {
      const d = Math.abs(items[i] - v);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }, [items]);

  const maxOffset = (items.length - 1) * ITEM_H;

  const wheelRef = useRef(null);       // moving inner list
  const trackRef = useRef(null);       // fixed viewport
  const offsetRef = useRef(0);         // current px offset (drives transform)
  const velocityRef = useRef(0);       // px/ms
  const rafRef = useRef(null);
  const draggingRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastYRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const pointerIdRef = useRef(null);
  const lastHapticIdxRef = useRef(-1);
  const modeRef = useRef('idle'); // 'idle' | 'drag' | 'inertia' | 'snap'

  const [activeIdx, setActiveIdx] = useState(indexOfValue(value));

  const setTransform = () => {
    if (wheelRef.current) {
      wheelRef.current.style.transform = `translate3d(0, ${-offsetRef.current}px, 0)`;
    }
    updateItemStyles();
  };

  // Per-item scale/opacity, based on visual distance from center.
  const updateItemStyles = () => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const off = offsetRef.current;
    const first = Math.max(0, Math.floor(off / ITEM_H) - Math.ceil(VISIBLE / 2));
    const last = Math.min(items.length - 1, Math.ceil(off / ITEM_H) + Math.ceil(VISIBLE / 2));
    for (let i = first; i <= last; i++) {
      const node = wheel.children[i];
      if (!node) continue;
      const dPx = i * ITEM_H - off; // pixels from center
      const t = Math.min(1, Math.abs(dPx) / (ITEM_H * (VISIBLE / 2)));
      const opacity = 1 - t * 0.75;
      const scale = 1 - t * 0.22;
      // subtle 3d curl for that Apple wheel feel
      const rot = Math.max(-42, Math.min(42, dPx * 0.5));
      node.style.opacity = String(opacity);
      node.style.transform = `translateY(0) scale(${scale.toFixed(3)}) rotateX(${(-rot).toFixed(2)}deg)`;
    }
  };

  const nearestIndex = (off) => {
    return Math.max(0, Math.min(items.length - 1, Math.round(off / ITEM_H)));
  };

  const setActiveFromOffset = () => {
    const idx = nearestIndex(offsetRef.current);
    if (idx !== lastHapticIdxRef.current) {
      lastHapticIdxRef.current = idx;
      setActiveIdx(idx);
      if (navigator.vibrate) { try { navigator.vibrate(1); } catch {} }
    }
  };

  const cancelRaf = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  const startInertiaOrSnap = () => {
    modeRef.current = Math.abs(velocityRef.current) > 0.02 ? 'inertia' : 'snap';
    lastTimeRef.current = performance.now();
    const step = (t) => {
      const dt = Math.min(48, t - lastTimeRef.current);
      lastTimeRef.current = t;

      if (modeRef.current === 'inertia') {
        // Apply friction against motion.
        const dir = Math.sign(velocityRef.current);
        const decel = FRICTION * dt;
        const nextV = velocityRef.current - dir * decel;
        // Stop if we crossed zero, or velocity got small.
        if (Math.sign(nextV) !== dir || Math.abs(nextV) < 0.05) {
          velocityRef.current = 0;
          modeRef.current = 'snap';
        } else {
          velocityRef.current = nextV;
          offsetRef.current += velocityRef.current * dt;
        }

        // Edge rubber-band during inertia: pull back and reduce velocity.
        if (offsetRef.current < 0) {
          offsetRef.current = offsetRef.current * 0.7;
          velocityRef.current *= 0.5;
          if (offsetRef.current > -0.5) { offsetRef.current = 0; modeRef.current = 'snap'; }
        } else if (offsetRef.current > maxOffset) {
          const over = offsetRef.current - maxOffset;
          offsetRef.current = maxOffset + over * 0.7;
          velocityRef.current *= 0.5;
          if (over < 0.5) { offsetRef.current = maxOffset; modeRef.current = 'snap'; }
        }

        setTransform();
        setActiveFromOffset();
      }

      if (modeRef.current === 'snap') {
        const target = nearestIndex(offsetRef.current) * ITEM_H;
        const delta = target - offsetRef.current;
        // Critically-damped-ish approach.
        const frames = dt / (1000 / 60);
        offsetRef.current += delta * (1 - Math.pow(1 - SNAP_TENSION, frames));
        velocityRef.current *= Math.pow(SNAP_DAMP, frames);
        if (Math.abs(delta) < 0.3) {
          offsetRef.current = target;
          velocityRef.current = 0;
          setTransform();
          setActiveFromOffset();
          modeRef.current = 'idle';
          return;
        }
        setTransform();
        setActiveFromOffset();
      }

      rafRef.current = requestAnimationFrame(step);
    };
    cancelRaf();
    rafRef.current = requestAnimationFrame(step);
  };

  // Initialize offset when the picker opens or the target value changes.
  useLayoutEffect(() => {
    if (!open) return;
    cancelRaf();
    const idx = indexOfValue(value);
    offsetRef.current = idx * ITEM_H;
    velocityRef.current = 0;
    lastHapticIdxRef.current = idx;
    setActiveIdx(idx);
    modeRef.current = 'idle';
    // Two rAF ticks: first lets refs attach, second ensures layout.
    requestAnimationFrame(() => {
      setTransform();
      requestAnimationFrame(setTransform);
    });
  }, [open, value, indexOfValue]);

  useEffect(() => () => cancelRaf(), []);

  // Pointer handlers ------------------------------------------------------
  const onPointerDown = (e) => {
    if (!trackRef.current) return;
    trackRef.current.setPointerCapture?.(e.pointerId);
    pointerIdRef.current = e.pointerId;
    cancelRaf();
    modeRef.current = 'drag';
    draggingRef.current = true;
    startYRef.current = e.clientY;
    lastYRef.current = e.clientY;
    startOffsetRef.current = offsetRef.current;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    const now = performance.now();
    const dy = e.clientY - lastYRef.current;
    lastYRef.current = e.clientY;
    const dt = Math.max(1, now - lastTimeRef.current);
    lastTimeRef.current = now;

    // Instantaneous velocity smoothed with prior.
    const instV = -dy / dt; // finger down = positive offset (scroll forward)
    velocityRef.current = velocityRef.current * 0.6 + instV * 0.4;

    let next = startOffsetRef.current - (e.clientY - startYRef.current);
    // Rubber-band past edges.
    if (next < 0) next = next * RUBBER;
    else if (next > maxOffset) next = maxOffset + (next - maxOffset) * RUBBER;
    offsetRef.current = next;
    setTransform();
    setActiveFromOffset();
  };

  const endDrag = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (pointerIdRef.current != null && trackRef.current) {
      try { trackRef.current.releasePointerCapture(pointerIdRef.current); } catch {}
    }
    pointerIdRef.current = null;
    startInertiaOrSnap();
  };

  // Wheel/trackpad support for desktop.
  const onWheel = (e) => {
    e.preventDefault();
    cancelRaf();
    modeRef.current = 'drag';
    // Convert wheel delta to offset directly, with a tiny velocity so snap-after works.
    const now = performance.now();
    const dt = Math.max(8, now - (lastTimeRef.current || now));
    lastTimeRef.current = now;
    let next = offsetRef.current + e.deltaY;
    if (next < 0) next = next * RUBBER;
    else if (next > maxOffset) next = maxOffset + (next - maxOffset) * RUBBER;
    offsetRef.current = next;
    velocityRef.current = e.deltaY / dt;
    setTransform();
    setActiveFromOffset();
    // After a beat of quiet, snap.
    clearTimeout(onWheel._t);
    onWheel._t = setTimeout(() => startInertiaOrSnap(), 60);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const target = Math.max(0, Math.min(items.length - 1, nearestIndex(offsetRef.current) + dir));
      cancelRaf();
      offsetRef.current = target * ITEM_H;
      velocityRef.current = 0;
      modeRef.current = 'snap';
      startInertiaOrSnap();
    } else if (e.key === 'Enter') {
      onConfirm(items[nearestIndex(offsetRef.current)]);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!open) return null;

  const formatVal = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ''));

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_.18s_ease-out]"
        onClick={onCancel}
      />
      <div
        className="relative w-full bg-surface/85 backdrop-blur-2xl border-t border-white/5 rounded-t-3xl shadow-2xl safe-bottom animate-[sheetUp_.28s_cubic-bezier(.32,.72,0,1)]"
        style={{ WebkitBackdropFilter: 'blur(24px) saturate(180%)' }}
      >
        <div className="flex justify-center pt-2">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-muted text-[15px] py-1.5 px-1 active:opacity-60"
          >
            Cancel
          </button>
          <span className="text-[13px] font-medium tracking-tight text-muted">{title}</span>
          <button
            type="button"
            onClick={() => onConfirm(items[nearestIndex(offsetRef.current)])}
            className="text-accent font-semibold text-[15px] py-1.5 px-1 active:opacity-60"
          >
            Done
          </button>
        </div>

        <div className="relative px-4 pb-4">
          <div
            ref={trackRef}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className="relative mx-auto overflow-hidden outline-none select-none"
            style={{
              height: VIEW_H,
              perspective: '1200px',
              touchAction: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              cursor: 'grab',
            }}
          >
            {/* Center selection band */}
            <div
              className="pointer-events-none absolute left-0 right-0 rounded-xl bg-white/[.05]"
              style={{
                top: CENTER - ITEM_H / 2,
                height: ITEM_H,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(255,255,255,0.04)',
              }}
            />
            {/* Top/bottom fade masks */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(10,10,11,0.92) 0%, rgba(10,10,11,0) 30%, rgba(10,10,11,0) 70%, rgba(10,10,11,0.92) 100%)',
              }}
            />

            <div
              ref={wheelRef}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: CENTER - ITEM_H / 2,
                willChange: 'transform',
                transformStyle: 'preserve-3d',
                transform: `translate3d(0, ${-offsetRef.current}px, 0)`,
              }}
            >
              {items.map((v, i) => (
                <div
                  key={v}
                  className="flex items-baseline justify-center gap-1.5"
                  style={{
                    height: ITEM_H,
                    transformOrigin: 'center center',
                    // baseline styles; JS updates transform/opacity for smooth curl
                    willChange: 'transform, opacity',
                    backfaceVisibility: 'hidden',
                  }}
                >
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: i === activeIdx ? 26 : 22,
                      fontWeight: i === activeIdx ? 600 : 500,
                      letterSpacing: '-0.02em',
                      transition: 'font-size .12s ease, font-weight .12s ease, color .18s',
                      color: i === activeIdx ? undefined : undefined,
                    }}
                  >
                    {formatVal(v)}
                  </span>
                  {unit && (
                    <span
                      className="text-muted text-[13px]"
                      style={{ opacity: i === activeIdx ? 1 : 0.6 }}
                    >
                      {unit}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
