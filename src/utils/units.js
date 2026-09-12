// Weights are ALWAYS stored in kilograms internally.
// The user's unit preference is a display-only concern; historical data never changes shape.

export const KG_PER_LB = 0.45359237;

export function toDisplay(kg, unit) {
  if (kg == null || Number.isNaN(kg)) return 0;
  return unit === 'lbs' ? kg / KG_PER_LB : kg;
}

export function fromDisplay(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return unit === 'lbs' ? n * KG_PER_LB : n;
}

// Nice rounding for display: 0.5 in kg, 1 in lbs (matches common gym plate resolutions).
export function roundDisplay(value, unit) {
  const step = unit === 'lbs' ? 1 : 0.5;
  return Math.round(value / step) * step;
}

// Smallest available loading increment on the bar (per side * 2). Matches user pref.
export function loadIncrement(unit) {
  return unit === 'lbs' ? 5 : 2.5; // lbs: 2.5lb plates per side → 5lb; kg: 1.25kg plates per side → 2.5kg
}

export function formatWeight(kg, unit, opts = {}) {
  const v = roundDisplay(toDisplay(kg, unit), unit);
  const withUnit = opts.withUnit !== false;
  // Strip trailing zero (80.0 → 80) but keep half increments (82.5).
  const str = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
  return withUnit ? `${str} ${unit}` : str;
}
