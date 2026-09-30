// Weights are always stored and displayed in kilograms.

// Nice rounding for display: nearest 0.5 kg (matches common plate resolutions).
export function roundDisplay(kg) {
  if (kg == null || Number.isNaN(kg)) return 0;
  return Math.round(kg / 0.5) * 0.5;
}

export function formatWeight(kg, opts = {}) {
  const v = roundDisplay(kg);
  const withUnit = opts.withUnit !== false;
  // Strip trailing zero (80.0 → 80) but keep half increments (82.5).
  const plain = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
  // Opt-in digit grouping, for the few places a weekly or lifetime total is set
  // large enough that "48200 kg" is genuinely hard to read. Off by default so
  // every existing set/lift readout in the app is untouched — a bar load is
  // never big enough to need a separator, and adding one there would be noise.
  const str = opts.group
    ? v.toLocaleString(undefined, { maximumFractionDigits: Number.isInteger(v) ? 0 : 1 })
    : plain;
  return withUnit ? `${str} kg` : str;
}
