import { useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import WheelPicker from './WheelPicker.jsx';
import { fromDisplay, toDisplay, roundDisplay, loadIncrement } from '../utils/units.js';

const TYPE_LABELS = { warmup: 'W', working: '', drop: 'D', failure: 'F' };
const TYPE_ORDER = ['working', 'warmup', 'drop', 'failure'];

export default function SetRow({ index, set, unit, prevSet, onChange, onComplete, onDelete }) {
  const wDisplay = roundDisplay(toDisplay(set.weightKg, unit), unit);
  const step = loadIncrement(unit);
  const [picker, setPicker] = useState(null); // 'weight' | 'reps'
  const [dx, setDx] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const baseDx = useRef(0);

  const prevW = prevSet ? roundDisplay(toDisplay(prevSet.weightKg, unit), unit) : null;
  const prevR = prevSet?.reps ?? null;
  const hasW = set.weightKg > 0;
  const hasR = (set.reps || 0) > 0;

  const cycleType = () => {
    const idx = TYPE_ORDER.indexOf(set.type);
    onChange({ type: TYPE_ORDER[(idx + 1) % TYPE_ORDER.length] });
  };

  const chipLabel = TYPE_LABELS[set.type];
  const chipColor =
    set.type === 'warmup' ? 'text-warn' :
    set.type === 'drop' ? 'text-accent' :
    set.type === 'failure' ? 'text-danger' :
    'text-muted';

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    baseDx.current = dx;
    swiping.current = false;
  };
  const onTouchMove = (e) => {
    const t = e.touches[0];
    const rawDx = t.clientX - startX.current;
    const rawDy = t.clientY - startY.current;
    if (!swiping.current) {
      if (Math.abs(rawDx) > 8 && Math.abs(rawDx) > Math.abs(rawDy) * 1.4) {
        swiping.current = true;
      } else if (Math.abs(rawDy) > 8) {
        return;
      } else {
        return;
      }
    }
    const next = Math.min(0, Math.max(-96, baseDx.current + rawDx));
    setDx(next);
  };
  const onTouchEnd = () => {
    if (!swiping.current) return;
    setDx(dx < -56 ? -80 : 0);
  };

  const completed = set.completed;

  return (
    <>
      <div className="relative overflow-hidden">
        {/* Delete affordance revealed by swipe */}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete set"
          className="absolute inset-y-0 right-0 w-20 flex items-center justify-center text-white bg-danger/90 active:bg-danger"
          tabIndex={dx < -20 ? 0 : -1}
        >
          <Trash2 size={18} />
        </button>

        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative bg-bg"
          style={{
            transform: `translate3d(${dx}px, 0, 0)`,
            transition: swiping.current ? 'none' : 'transform .28s cubic-bezier(.32,.72,0,1)',
          }}
        >
          <div
            className={`grid items-center py-0.5 ${
              completed ? 'bg-success/[.06]' : ''
            } transition-colors`}
            style={{ gridTemplateColumns: '28px 1fr 1fr 40px', columnGap: 4 }}
          >
            <button
              type="button"
              onClick={cycleType}
              aria-label={`Set type ${set.type}. Tap to change.`}
              className={`h-9 text-[13px] font-semibold tabular-nums ${chipColor} active:opacity-60`}
            >
              {chipLabel || (index + 1)}
            </button>

            <button
              type="button"
              onClick={() => setPicker('weight')}
              aria-label={`Weight ${hasW ? wDisplay + ' ' + unit : 'not set'}. Tap to change.`}
              className="h-10 rounded-lg flex items-baseline justify-center gap-1 active:bg-white/[.03]"
            >
              <span
                className={`text-[22px] tabular-nums ${hasW ? 'font-semibold text-text' : 'font-medium text-muted/50'}`}
                style={{ letterSpacing: '-0.02em' }}
              >
                {hasW ? formatNum(wDisplay) : (prevW != null ? formatNum(prevW) : '0')}
              </span>
              <span className="text-[13px] font-medium text-muted">{unit}</span>
            </button>

            <button
              type="button"
              onClick={() => setPicker('reps')}
              aria-label={`Reps ${hasR ? set.reps : 'not set'}. Tap to change.`}
              className="h-10 rounded-lg flex items-baseline justify-center gap-1 active:bg-white/[.03]"
            >
              <span
                className={`text-[22px] tabular-nums ${hasR ? 'font-semibold text-text' : 'font-medium text-muted/50'}`}
                style={{ letterSpacing: '-0.02em' }}
              >
                {hasR ? set.reps : (prevR != null ? prevR : '0')}
              </span>
              <span className="text-[13px] font-medium text-muted">reps</span>
            </button>

            <button
              type="button"
              onClick={onComplete}
              aria-label={completed ? 'Mark set incomplete' : 'Complete set'}
              className={`justify-self-end w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                completed
                  ? 'bg-success text-white shadow-[0_0_0_1px_rgba(34,197,94,0.35)]'
                  : 'text-muted/70 border border-white/10 active:bg-white/[.05]'
              }`}
            >
              <Check size={14} strokeWidth={3.5} />
            </button>
          </div>
        </div>
      </div>

      <WheelPicker
        open={picker === 'weight'}
        title={`Set ${index + 1} · Weight`}
        value={hasW ? wDisplay : (prevW ?? 0)}
        min={0}
        max={unit === 'lbs' ? 1100 : 500}
        step={step}
        unit={unit}
        onCancel={() => setPicker(null)}
        onConfirm={(v) => { onChange({ weightKg: fromDisplay(v, unit) }); setPicker(null); }}
      />
      <WheelPicker
        open={picker === 'reps'}
        title={`Set ${index + 1} · Reps`}
        value={hasR ? set.reps : (prevR ?? 0)}
        min={0}
        max={50}
        step={1}
        unit=""
        onCancel={() => setPicker(null)}
        onConfirm={(v) => { onChange({ reps: Math.max(0, Math.round(v)) }); setPicker(null); }}
      />
    </>
  );
}

function formatNum(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
