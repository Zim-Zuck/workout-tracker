import { Minus, Plus } from 'lucide-react';

// Stepper-only or full stepper+field. Used for weight and rep entry.
// value is a display number (units already converted). Parent handles the
// conversion back to kg for storage.
export default function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  bigSteps = [],   // e.g. [-5, -2.5, 2.5, 5] for weight
  inputMode = 'decimal',
  suffix = '',
  ariaLabel,
  className = ''
}) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const bump = (delta) => onChange(round(clamp((Number(value) || 0) + delta), step));

  return (
    <div className={`flex items-stretch gap-1 ${className}`}>
      <button
        type="button"
        aria-label="Decrement"
        onClick={() => bump(-step)}
        className="w-11 h-11 shrink-0 rounded-lg bg-card border border-border active:bg-border flex items-center justify-center"
      >
        <Minus size={18} />
      </button>
      <div className="flex-1 relative">
        <input
          aria-label={ariaLabel}
          type="text"
          inputMode={inputMode}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.');
            if (raw === '') return onChange(0);
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-full h-11 bg-card border border-border rounded-lg text-center text-lg font-semibold outline-none focus:border-accent"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>
        )}
      </div>
      <button
        type="button"
        aria-label="Increment"
        onClick={() => bump(step)}
        className="w-11 h-11 shrink-0 rounded-lg bg-card border border-border active:bg-border flex items-center justify-center"
      >
        <Plus size={18} />
      </button>
      {bigSteps.length > 0 && (
        <div className="flex gap-1 ml-1">
          {bigSteps.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => bump(s)}
              className="h-11 px-2 rounded-lg bg-card border border-border text-xs font-medium active:bg-border"
              aria-label={`${s > 0 ? '+' : ''}${s}`}
            >
              {s > 0 ? `+${s}` : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function round(v, step) {
  // Guard against floating-point drift with fractional steps.
  const inv = 1 / step;
  return Math.round(v * inv) / inv;
}
