import { useEffect, useMemo, useRef, useState } from 'react';

const ITEM_H = 44;

export default function WheelPicker({
  open,
  title,
  value,
  min,
  max,
  step,
  unit,
  onCancel,
  onConfirm,
}) {
  const listRef = useRef(null);
  const [current, setCurrent] = useState(value);
  const scrollTimer = useRef(null);
  const lastIdx = useRef(-1);

  const items = useMemo(() => {
    const arr = [];
    const inv = 1 / step;
    for (let v = min; v <= max + 1e-9; v += step) {
      arr.push(Math.round(v * inv) / inv);
    }
    return arr;
  }, [min, max, step]);

  const indexOfValue = (v) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < items.length; i++) {
      const d = Math.abs(items[i] - v);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  useEffect(() => {
    if (!open) return;
    const idx = indexOfValue(value);
    lastIdx.current = idx;
    setCurrent(items[idx]);
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = idx * ITEM_H;
    });
  }, [open]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const idx = Math.round(listRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (clamped !== lastIdx.current) {
      lastIdx.current = clamped;
      setCurrent(items[clamped]);
      if (navigator.vibrate) navigator.vibrate(2);
    }
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (!listRef.current) return;
      const target = clamped * ITEM_H;
      if (Math.abs(listRef.current.scrollTop - target) > 0.5) {
        listRef.current.scrollTo({ top: target, behavior: 'smooth' });
      }
    }, 90);
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
            onClick={() => onConfirm(current)}
            className="text-accent font-semibold text-[15px] py-1.5 px-1 active:opacity-60"
          >
            Done
          </button>
        </div>

        <div className="relative h-[220px] px-4 pb-4">
          <div
            className="pointer-events-none absolute left-4 right-4 top-1/2 -translate-y-1/2 rounded-xl bg-white/[.04]"
            style={{ height: ITEM_H }}
          />
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="h-full overflow-y-scroll no-scrollbar snap-y snap-mandatory"
            style={{
              paddingTop: (220 - ITEM_H) / 2,
              paddingBottom: (220 - ITEM_H) / 2,
              scrollSnapType: 'y mandatory',
            }}
          >
            {items.map((v) => {
              const active = v === current;
              return (
                <div
                  key={v}
                  className="snap-center flex items-baseline justify-center gap-1.5"
                  style={{
                    height: ITEM_H,
                    transition: 'opacity .18s, transform .18s',
                    opacity: active ? 1 : 0.35,
                  }}
                >
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: active ? 26 : 20,
                      fontWeight: active ? 600 : 500,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {formatVal(v)}
                  </span>
                  {unit && (
                    <span className="text-muted text-[13px]">{unit}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
