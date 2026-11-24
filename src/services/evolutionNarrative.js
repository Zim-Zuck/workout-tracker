// PLAIN-ENGLISH SUMMARIES FOR THE EVOLUTION SCREEN.
//
// Everything here reads numbers the comparison engine (trainingEvolution.js)
// and the highlight engine (exerciseStats.js) already computed — nothing is
// reclassified or recalculated, only put into a sentence. No React, no I/O.
import { TREND_MIN_SESSIONS, TREND_MIN_SPAN_DAYS } from './exerciseStats.js';
import { E1RM_REP_CAP } from './calculations.js';

// How far a period-over-period volume change has to move before the screen
// calls it a trend rather than noise. Independent of TREND_FLAT_PCT in
// exerciseStats.js, which bounds a single lift's multi-week slope — this
// bounds one whole-training-volume comparison between two periods, a
// different question answered from different numbers.
export const VERDICT_STEADY_BAND_PCT = 5;

// 'improving' | 'steady' | 'declining' — the three words the Highlights pill
// is allowed to say. `pct` is a change() percentage (null means "new", which
// reads as the best kind of improving: there was nothing before).
export function classifyVolumeTrend(pct) {
  if (pct == null) return 'improving';
  if (Math.abs(pct) < VERDICT_STEADY_BAND_PCT) return 'steady';
  return pct > 0 ? 'improving' : 'declining';
}

function frequencyClause(c) {
  if (c.kind === 'new') return 'started training in this period';
  if (c.kind === 'gone') return 'trained before, but logged nothing this period';
  if (c.kind === 'none' || Math.abs(c.pct) < VERDICT_STEADY_BAND_PCT) return 'trained about as often as before';
  const pct = Math.round(Math.abs(c.pct));
  return c.pct > 0 ? `trained ${pct}% more often` : `trained ${pct}% less often`;
}

// A big enough gain reads better as a multiple ("about 2x the volume") than
// as a percentage ("117% more volume") — the example this screen's brief
// asked for by name. Rounded to the nearest half, which is as precise as a
// one-word multiplier should ever sound.
function roundMultiplier(m) {
  const rounded = Math.round(m * 2) / 2;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

function volumeClause(c) {
  if (c.kind === 'new') return 'started logging real training volume';
  if (c.kind === 'gone') return 'logged no volume this period';
  if (c.kind === 'none' || Math.abs(c.pct) < VERDICT_STEADY_BAND_PCT) return 'lifted about the same volume';
  if (c.pct > 0) {
    const multiplier = c.from > 0 ? c.to / c.from : null;
    if (multiplier != null && multiplier >= 1.8) return `lifted about ${roundMultiplier(multiplier)}x the volume`;
    return `lifted ${Math.round(c.pct)}% more volume`;
  }
  return `lifted ${Math.round(Math.abs(c.pct))}% less volume`;
}

// The one or two muscle groups that picked up the most real work, by
// kilograms gained rather than by share — a group's share of total volume can
// fall while its kilograms rise (a new leg day dilutes everything else's
// share without taking away any of their work), and the verdict is about the
// training, not the pie chart. Omitted entirely when nothing grew, rather
// than naming whatever shrank the least.
function muscleGrowthClause(muscleRows) {
  if (!Array.isArray(muscleRows) || !muscleRows.length) return null;
  const grew = muscleRows
    .filter((m) => m.value.abs > 0)
    .sort((x, y) => y.value.abs - x.value.abs)
    .slice(0, 2)
    .map((m) => m.label);
  if (!grew.length) return null;
  const names = grew.length === 1 ? grew[0] : `${grew[0]} and ${grew[1]}`;
  return `${names} grew the most.`;
}

// ONE OR TWO SENTENCES, for the strip directly under the summary card.
//
// `result` is exactly what compareTrainingPeriods() returns. The empty-period
// flags get their own plain fallback rather than a sentence built from zeros,
// because "0% more often" about a period with nothing logged is not a fact
// worth stating.
export function buildVerdict({ a, b, delta, shape, muscle, flags }) {
  if (flags?.emptyB) return 'Nothing has been logged yet in this period.';
  if (flags?.emptyA) {
    return "Nothing was logged in the period you're comparing against, so there's nothing yet to measure this against.";
  }

  const freqChange = shape.equalLength ? delta.workouts : delta.perWeek;
  const volChange = shape.equalLength ? delta.volumeKg : delta.volumePerWeek;
  const headline = `You ${frequencyClause(freqChange)} and ${volumeClause(volChange)}.`;
  const growth = muscleGrowthClause(muscle);
  return growth ? `${headline} ${growth}` : headline;
}

// ---------------------------------------------------------------------------
// THE COLLAPSED "NOT ENOUGH DATA" ROW.
//
// buildHighlights() already counts two separate things it cannot report a
// trend for — withheld for too little data, and withheld for being too
// variable to call — and keeps them separate on purpose (see exerciseStats.js:
// a noisy lift has plenty of data, it just does not agree with itself). The
// screen still wants one line ("Not enough data for N lifts") with the
// reasons one tap away, so this is where the two get added back together for
// display without losing which reason is which.
// ---------------------------------------------------------------------------

const REASON_LABEL = {
  too_few_sessions: `under ${TREND_MIN_SESSIONS} sessions`,
  span_too_short: `under ${TREND_MIN_SPAN_DAYS} days of history`,
  no_load: 'no load logged',
  rep_capped: `above ${E1RM_REP_CAP} reps, where the estimate stops tracking`,
  noisy: 'too inconsistent to call a trend'
};

export function summarizeDataGaps(highlights) {
  const { needMoreData, tooVariable } = highlights;
  const reasons = Object.entries(needMoreData.byReason)
    .map(([reason, count]) => ({ reason, count, label: REASON_LABEL[reason] || 'another reason' }));
  if (tooVariable.count > 0) {
    reasons.push({ reason: 'noisy', count: tooVariable.count, label: REASON_LABEL.noisy });
  }
  reasons.sort((x, y) => y.count - x.count);
  return { total: needMoreData.count + tooVariable.count, reasons };
}
