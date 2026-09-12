import { Check, Trash2 } from 'lucide-react';
import NumberInput from './NumberInput.jsx';
import { fromDisplay, toDisplay, roundDisplay, loadIncrement } from '../utils/units.js';

const TYPE_LABELS = { warmup: 'W', working: '', drop: 'D', failure: 'F' };
const TYPE_ORDER = ['working', 'warmup', 'drop', 'failure'];

export default function SetRow({ index, set, unit, onChange, onComplete, onDelete }) {
  const wDisplay = roundDisplay(toDisplay(set.weightKg, unit), unit);
  const step = loadIncrement(unit);
  const bigSteps = unit === 'lbs' ? [-5, 5] : [-2.5, 2.5];

  const setType = () => {
    const idx = TYPE_ORDER.indexOf(set.type);
    const next = TYPE_ORDER[(idx + 1) % TYPE_ORDER.length];
    onChange({ type: next });
  };

  const label = TYPE_LABELS[set.type];
  return (
    <div className={`rounded-xl border ${set.completed ? 'bg-success/10 border-success/30' : 'bg-card border-border'} p-2`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={setType}
          aria-label={`Set type: ${set.type}. Tap to change.`}
          className={`w-7 h-11 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold ${
            set.type === 'warmup' ? 'bg-warn/20 text-warn' :
            set.type === 'drop' ? 'bg-accent/20 text-accent' :
            set.type === 'failure' ? 'bg-danger/20 text-danger' :
            'bg-surface text-muted'
          }`}
        >
          {label || (index + 1)}
        </button>

        <NumberInput
          value={wDisplay}
          onChange={(v) => onChange({ weightKg: fromDisplay(v, unit) })}
          step={step}
          min={0}
          bigSteps={bigSteps}
          ariaLabel="Weight"
          suffix={unit}
          className="flex-1"
        />
      </div>

      <div className="flex items-center gap-2 mt-2">
        <div className="w-7 shrink-0" aria-hidden="true" />
        <NumberInput
          value={set.reps || 0}
          onChange={(v) => onChange({ reps: Math.max(0, Math.round(v)) })}
          step={1}
          min={0}
          bigSteps={[-1, 1]}
          inputMode="numeric"
          suffix="reps"
          ariaLabel="Reps"
          className="flex-1"
        />

        <button
          type="button"
          onClick={onComplete}
          aria-label={set.completed ? 'Mark set incomplete' : 'Complete set'}
          className={`w-14 h-11 rounded-lg flex items-center justify-center border ${
            set.completed ? 'bg-success text-white border-success' : 'bg-card border-border text-muted active:bg-border'
          }`}
        >
          <Check size={20} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete set"
          className="w-11 h-11 rounded-lg bg-card border border-border text-muted active:bg-border flex items-center justify-center"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
