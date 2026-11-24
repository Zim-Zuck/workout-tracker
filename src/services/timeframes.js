// THE TIMEFRAME REGISTRY.
//
// There used to be three independent lists of time windows: Progress.jsx's
// WINDOWS (2w/4w/6w/12w/1y), progressSummary.js's TIMEFRAMES
// (4w/3m/6m/1y/all/custom) and ExerciseDetail.jsx's RANGES (1m/3m/6m/1y/all).
// `3m`, `6m`, `1y` and `all` were defined three times over and happened to
// agree; `4w` (28 days) and `1m` (30 days) were the same question with two
// different answers and two different labels. Nothing stopped a fourth list
// appearing, or one of the duplicates drifting.
//
// So the DEFINITIONS are consolidated here and the PRESETS are not. Each screen
// keeps its own list of ids, because the screens ask different questions: the
// dashboard asks "what has recent training looked like" and wants short
// windows; the share card asks "what period am I publishing" and wants long
// ones plus a custom range. Forcing one list on all three would be an
// abstraction nobody asked for. What matters is that `6m` means 182 days
// everywhere, exactly once.
//
// THREE LABEL FORMS, because three places need different casing and none of
// them should change: `label` is title case for the share card's headline,
// `shortLabel` is the card's uppercase period stamp, and `pill` is the compact
// form ExerciseDetail's range pills use. The dashboard's lowercase pills
// ("4 weeks", and "last 4 weeks" in a subtitle) are `label.toLowerCase()`.
export const WINDOWS = {
  '2w':     { days: 14,   label: '2 Weeks',   shortLabel: '2 WEEKS',   pill: '2W' },
  '4w':     { days: 28,   label: '4 Weeks',   shortLabel: '4 WEEKS',   pill: '4W' },
  '6w':     { days: 42,   label: '6 Weeks',   shortLabel: '6 WEEKS',   pill: '6W' },
  '12w':    { days: 84,   label: '12 Weeks',  shortLabel: '12 WEEKS',  pill: '12W' },
  '3m':     { days: 90,   label: '3 Months',  shortLabel: '3 MONTHS',  pill: '3M' },
  '6m':     { days: 182,  label: '6 Months',  shortLabel: '6 MONTHS',  pill: '6M' },
  '1y':     { days: 365,  label: '1 Year',    shortLabel: '1 YEAR',    pill: '1Y' },
  'all':    { days: null, label: 'All Time',  shortLabel: 'ALL TIME',  pill: 'All' },
  'custom': { days: null, label: 'Custom',    shortLabel: 'CUSTOM',    pill: 'Custom' }
};

// The Progress dashboard: recent training, so short windows.
export const DASHBOARD_WINDOWS = ['2w', '4w', '6w', '12w', '1y'];

// The Progress Share Card: publishable periods, plus a custom range.
export const SHARE_WINDOWS = ['4w', '3m', '6m', '1y', 'all', 'custom'];

// One exercise over time. `1m` (30 days) collapsed into `4w` (28) here rather
// than keeping a near-duplicate definition alive for a two-day difference.
export const EXERCISE_WINDOWS = ['4w', '3m', '6m', '1y', 'all'];

// When a timeframe id is not in the registry. 6 months, which is what
// progressSummary's resolveRange already fell back to.
const FALLBACK_ID = '6m';

// [{ id, days, label, shortLabel, pill }] for a preset, in preset order.
export function timeframeList(ids) {
  return ids.map((id) => ({ id, ...WINDOWS[id] }));
}

// { value, label } pairs for SegmentedPills. `labelKey` picks which of the
// registry's three label forms the pills show.
export function pillOptions(ids, labelKey = 'pill') {
  return ids.map((id) => ({ value: id, label: WINDOWS[id][labelKey] }));
}

// The dashboard's pills, which read "2 weeks" rather than "2W".
export function dashboardPillOptions() {
  return DASHBOARD_WINDOWS.map((id) => ({ value: id, label: WINDOWS[id].label.toLowerCase() }));
}

export function windowDays(id) {
  return WINDOWS[id]?.days ?? null;
}

// [start, end] for a timeframe id. Moved verbatim from progressSummary.js.
//
// `all` spans from the first workout to now, falling back to 4 weeks when there
// is no history at all — a zero-width range would make every percentage NaN.
export function resolveRange(timeframeId, workouts, custom) {
  const now = Date.now();
  // `custom` is a {start, end} range — the shape customRange() below returns and
  // the shape this function returns, so there is exactly one range shape in the
  // codebase and no caller has to translate between two of them.
  if (timeframeId === 'custom' && custom?.start && custom?.end) {
    return { start: custom.start, end: custom.end };
  }
  const tf = WINDOWS[timeframeId] || WINDOWS[FALLBACK_ID];
  if (tf.days == null) {
    const first = (workouts || []).reduce((m, w) => Math.min(m, w.date), now);
    return { start: workouts?.length ? first : now - 28 * 86400000, end: now };
  }
  return { start: now - tf.days * 86400000, end: now };
}

// The simple "last N days up to now" range, for screens with no custom option.
// `all` and anything unknown resolve to an unbounded start.
export function rangeFor(timeframeId, asOf = Date.now()) {
  const days = windowDays(timeframeId);
  return { start: days == null ? -Infinity : asOf - days * 86400000, end: asOf };
}

// A DATE INPUT'S "YYYY-MM-DD" AS A LOCAL DAY, NOT A UTC ONE.
//
// new Date("2026-02-01") parses as UTC midnight, but every workout date in this
// app is a local timestamp. Taking the UTC instant shifts both ends of a custom
// range by the timezone offset: in UTC+2 a range picked as Feb 1 ran to Feb 2
// and excluded anything logged before 02:00 on its opening day. Splitting the
// string and building local midnight and local end-of-day is offset-proof.
export function localDayBounds(value) {
  const [y, m, d] = String(value || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  // Round-trips back to the same calendar day, so "2026-02-31" is rejected
  // rather than silently becoming March 3rd.
  if (start.getFullYear() !== y || start.getMonth() !== m - 1 || start.getDate() !== d) return null;
  return { start: start.getTime(), end: new Date(y, m - 1, d, 23, 59, 59, 999).getTime() };
}

// A custom range from two date-input strings, inclusive of the whole closing
// day — a range picked as the 1st to the 7th has to contain the 7th's evening
// session. Null when either date is missing, malformed, or out of order.
export function customRange(fromValue, toValue) {
  const from = localDayBounds(fromValue);
  const to = localDayBounds(toValue);
  if (!from || !to) return null;
  return from.start < to.end ? { start: from.start, end: to.end } : null;
}

// A CUSTOM RANGE, WRITTEN OUT. One function, because this sentence was being
// built twice — progressSummary.js for the share card's period stamp and
// TrainingEvolution.jsx for its period headings — and the two copies had
// quietly disagreed about the year for as long as both existed.
//
// The disagreement is now a PARAMETER rather than an accident. The share card
// omits the year because its stamp has a fixed width on a 1080px image and
// "NOV 1, 2026 — NOV 15, 2026" does not fit it; the Evolution screen shows the
// year because comparing a block of last year with one from this year is most
// of what that screen is for.
export function formatDayRange(start, end, { year = false, dash = '–' } = {}) {
  const fmt = (ts) => new Date(ts).toLocaleDateString(
    undefined,
    year ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }
  );
  return `${fmt(start)} ${dash} ${fmt(end)}`;
}

// The Training Evolution comparison. No `all`: two periods both running to the
// first workout ever is not a comparison. `custom` stays, because picking an
// arbitrary block — a training camp, the months either side of an injury — is
// most of the point of comparing periods at all.
export const COMPARE_WINDOWS = ['4w', '6w', '12w', '3m', '6m', '1y', 'custom'];
