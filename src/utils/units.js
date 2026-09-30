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

// A session, weekly or lifetime VOLUME total.
//
// Always grouped and always whole kilograms: "6,808 kg" rather than
// "6807.5 kg". Half a kilo on a total of several tonnes is noise, and the
// separator is what makes the magnitude readable at a glance. Bar loads keep
// using formatWeight(), where the half matters and the separator never does.
export function formatVolume(kg) {
  const v = Math.round(kg || 0);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg`;
}
