// TREND CLASSIFICATION.
//
// The one piece of new judgement in this phase: deciding whether a lift is
// going up, flat or down, from a sequence of per-session estimated 1RMs.
//
// Every threshold is an exported constant with a documented reason, and these
// tests assert against the constants rather than against their current values,
// so tuning one does not silently invalidate the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTrend, isRankableTrend,
  TREND_MIN_SESSIONS, TREND_MIN_SPAN_DAYS, TREND_FLAT_PCT, TREND_MIN_R2, TREND_STATUSES
} from '../src/services/exerciseStats.js';
import { estimate1RM, E1RM_REP_CAP } from '../src/services/calculations.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 11, 12, 0).getTime();

// A history of one exercise: one working set per session, `everyDays` apart,
// oldest first. The caller gives weights; reps default to 5.
const history = (weights, { everyDays = 7, reps = 5, exerciseId = 'ex' } = {}) =>
  weights.map((weightKg, i) => ({
    id: `w${i}`,
    date: NOW - (weights.length - 1 - i) * everyDays * DAY,
    sets: [{
      id: `s${i}`, exerciseId, type: 'working', completed: true, timestamp: 0,
      weightKg: Array.isArray(weightKg) ? weightKg[0] : weightKg,
      reps: Array.isArray(weightKg) ? weightKg[1] : reps
    }]
  }));

const trend = (weights, opts) => classifyTrend(history(weights, opts), opts?.exerciseId || 'ex');

test('every status it can return is a declared one', () => {
  const samples = [
    trend([100, 102, 104, 106, 108]),
    trend([100, 100, 100, 100, 100]),
    trend([110, 108, 106, 104, 102]),
    trend([100, 130, 95, 135, 100, 140]),
    trend([100, 105])
  ];
  for (const t of samples) assert.ok(TREND_STATUSES.includes(t.status), `${t.status} is undeclared`);
});

// ------------------------------------------------------------ directions ----

test('a clean climb is improving, with the arithmetic percentage', () => {
  // 100 to 120 over 6 weekly sessions. The fitted line passes through every
  // point, so the fitted change IS the observed change.
  const t = trend([100, 104, 108, 112, 116, 120]);
  assert.equal(t.status, 'improving');
  assert.equal(t.sessions, 6);
  assert.equal(t.spanDays, 35);
  assert.ok(Math.abs(t.r2 - 1) < 1e-9, 'a perfect line should have r2 = 1');
  // e1RM scales linearly with weight at fixed reps, so the percentage is the
  // weight's: 20/100.
  assert.ok(Math.abs(t.pctChange - 20) < 0.1, `expected ~20%, got ${t.pctChange}`);
  assert.ok(t.slopeKgPerWeek > 0);
  assert.equal(t.reason, null);
  assert.ok(isRankableTrend(t));
});

test('a clean decline is declining', () => {
  const t = trend([120, 116, 112, 108, 104, 100]);
  assert.equal(t.status, 'declining');
  assert.ok(t.pctChange < -TREND_FLAT_PCT);
  assert.ok(t.slopeKgPerWeek < 0);
  assert.ok(isRankableTrend(t));
});

test('a flat series is steady, not improving and not declining', () => {
  const t = trend([100, 100, 100, 100, 100]);
  assert.equal(t.status, 'steady');
  assert.equal(t.pctChange, 0);
  assert.equal(t.slopeKgPerWeek, 0);
  assert.ok(isRankableTrend(t));
});

test('a change smaller than the equipment can resolve is steady', () => {
  // 100 to 101 is 1%, under the 2% floor: smaller than one notch on a plate set.
  const t = trend([100, 100.25, 100.5, 100.75, 101]);
  assert.equal(t.status, 'steady');
  assert.ok(Math.abs(t.pctChange) < TREND_FLAT_PCT);
});

test('the flat band is symmetric: a tiny loss is steady too', () => {
  const t = trend([101, 100.75, 100.5, 100.25, 100]);
  assert.equal(t.status, 'steady');
});

// ----------------------------------------------------------------- noise ----

test('a sawtooth with a real net gain is noisy, not improving', () => {
  // Net upward, but the line explains almost none of the variation, so the
  // direction is not something the lifter could see.
  const t = trend([100, 140, 95, 145, 105, 150, 100, 155]);
  assert.ok(t.pctChange > TREND_FLAT_PCT, 'the fixture must have a net gain to withhold');
  assert.ok(t.r2 < TREND_MIN_R2, `expected a weak fit, got r2 ${t.r2}`);
  assert.equal(t.status, 'noisy');
  assert.ok(!isRankableTrend(t));
  // The numbers are still reported — only the direction is withheld.
  assert.equal(typeof t.pctChange, 'number');
  assert.equal(typeof t.r2, 'number');
});

test('a single deload does not flip a climb into a decline', () => {
  // No outlier removal: the regression has to absorb this on its own, which is
  // the common case the averaging is for.
  const t = trend([100, 104, 108, 85, 112, 116, 120]);
  assert.equal(t.status, 'improving');
});

test('a flat noisy line is steady, because flat is flat', () => {
  const t = trend([100, 103, 97, 102, 98, 101, 99]);
  assert.ok(Math.abs(t.pctChange) < TREND_FLAT_PCT);
  assert.equal(t.status, 'steady');
});

// ---------------------------------------------------- insufficient data ----

test('fewer than the minimum sessions is insufficient, not flat', () => {
  const t = trend([100, 105, 110]);
  assert.equal(t.sessions, 3);
  assert.ok(t.sessions < TREND_MIN_SESSIONS);
  assert.equal(t.status, 'insufficient');
  assert.equal(t.reason, 'too_few_sessions');
  // Nothing numeric may masquerade as zero.
  assert.equal(t.pctChange, null);
  assert.equal(t.r2, null);
  assert.equal(t.slopeKgPerWeek, null);
  assert.equal(t.fittedStartKg, null);
  assert.ok(!isRankableTrend(t));
});

test('no history at all is insufficient', () => {
  const t = classifyTrend([], 'ex');
  assert.equal(t.status, 'insufficient');
  assert.equal(t.reason, 'too_few_sessions');
  assert.equal(t.sessions, 0);
  assert.equal(t.spanDays, 0);
  assert.equal(t.observedBestKg, 0);
});

test('enough sessions crammed into too short a span is insufficient', () => {
  // Six sessions over ten days: readiness, not adaptation.
  const t = trend([100, 102, 104, 106, 108, 110], { everyDays: 2 });
  assert.equal(t.sessions, 6);
  assert.ok(t.spanDays < TREND_MIN_SPAN_DAYS);
  assert.equal(t.status, 'insufficient');
  assert.equal(t.reason, 'span_too_short');
});

test('sessions all on the same day are insufficient, not a division by zero', () => {
  const sameDay = [100, 105, 110, 115].map((weightKg, i) => ({
    id: `w${i}`, date: NOW,
    sets: [{ id: `s${i}`, exerciseId: 'ex', type: 'working', completed: true, weightKg, reps: 5, timestamp: i }]
  }));
  const t = classifyTrend(sameDay, 'ex');
  assert.equal(t.spanDays, 0);
  assert.equal(t.status, 'insufficient');
  assert.equal(t.reason, 'span_too_short');
  assert.ok(Number.isFinite(t.observedBestKg));
});

test('the span is measured exactly at the boundary', () => {
  // Four sessions exactly TREND_MIN_SPAN_DAYS apart end to end: admissible.
  const everyDays = TREND_MIN_SPAN_DAYS / 3;
  const t = trend([100, 104, 108, 112], { everyDays });
  assert.equal(t.spanDays, TREND_MIN_SPAN_DAYS);
  assert.notEqual(t.status, 'insufficient');
});

test('a bodyweight lift is insufficient for lack of load, never a plateau', () => {
  // Every set logs 0 kg, so every estimate is 0. A flat line of zeroes is an
  // absence of load to measure, not a stalled lift.
  const t = trend([0, 0, 0, 0, 0, 0]);
  assert.equal(t.status, 'insufficient');
  assert.equal(t.reason, 'no_load');
  assert.equal(t.sessions, 6);
  assert.equal(t.observedBestKg, 0);
});

test('a lift that gains load partway through is classified, not withheld', () => {
  // Weight finally recorded: there is something to measure.
  const t = trend([0, 0, 0, 80, 85, 90]);
  assert.notEqual(t.reason, 'no_load');
  assert.ok(['improving', 'noisy'].includes(t.status), t.status);
});

// ------------------------------------------------------ no NaN, anywhere ----

test('identical estimates give r2 = 1 and no NaN', () => {
  const t = trend([100, 100, 100, 100, 100, 100]);
  assert.equal(t.r2, 1);
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} is ${v}`);
  }
});

test('no field is ever NaN, across a spread of shapes', () => {
  const shapes = [
    [100, 102, 104, 106], [100, 100, 100, 100], [0, 0, 0, 0],
    [100, 50, 150, 25, 175], [1, 2, 3, 4, 5], [500, 1, 500, 1, 500, 1]
  ];
  for (const weights of shapes) {
    const t = trend(weights);
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${weights}: ${k} is ${v}`);
    }
  }
});

// ------------------------------------------------------------ rep ranges ----

test('the estimate normalises rep ranges: heavy triples and light tens agree', () => {
  // Alternating 5s and 10s chosen so each pair estimates to the same number.
  // A classifier reading top weight would call this a sawtooth; reading e1RM it
  // is correctly flat.
  const w10 = 100;
  const e = estimate1RM(w10, 10);
  const w5 = e / (1 + 5 / 30);
  const sessions = [[w10, 10], [w5, 5], [w10, 10], [w5, 5], [w10, 10], [w5, 5]];
  const t = classifyTrend(history(sessions), 'ex');
  assert.equal(t.status, 'steady');
  assert.ok(Math.abs(t.pctChange) < 1e-9);
});

test('progress made by adding reps is seen, not only progress by adding weight', () => {
  const sessions = [[100, 3], [100, 4], [100, 5], [100, 6], [100, 7], [100, 8]];
  const t = classifyTrend(history(sessions), 'ex');
  assert.equal(t.status, 'improving');
  assert.ok(t.pctChange > 0);
});

test('high-rep work is flagged as rep-capped rather than called a plateau', () => {
  // Above the 12-rep cap the estimate stops rising, so 12 to 20 reps at a fixed
  // weight reads flat. The flag is what lets a screen say "e1RM can't track
  // this" instead.
  const sessions = [[50, 13], [50, 15], [50, 17], [50, 19], [50, 20], [50, 22]];
  const t = classifyTrend(history(sessions), 'ex');
  assert.equal(t.repCapped, true);
  assert.equal(t.status, 'steady');
});

test('rep-capped is false for ordinary rep ranges', () => {
  assert.equal(trend([100, 104, 108, 112]).repCapped, false);
  // Exactly at the cap counts as capped — that is where the estimate stops.
  const atCap = history([[50, E1RM_REP_CAP], [50, E1RM_REP_CAP], [50, E1RM_REP_CAP], [50, E1RM_REP_CAP]]);
  assert.equal(classifyTrend(atCap, 'ex').repCapped, true);
  // A minority of capped sessions does not flag the whole trend.
  const mostly = history([[100, 5], [100, 5], [100, 5], [50, 20]]);
  assert.equal(classifyTrend(mostly, 'ex').repCapped, false);
});

// -------------------------------------------------------------- plumbing ----

test('warm-ups and unchecked sets are not observations', () => {
  const workouts = history([100, 104, 108, 112]);
  workouts.push({
    id: 'extra', date: NOW + DAY,
    sets: [
      { id: 'x1', exerciseId: 'ex', type: 'warmup', completed: true, weightKg: 500, reps: 5, timestamp: 0 },
      { id: 'x2', exerciseId: 'ex', type: 'working', completed: false, weightKg: 500, reps: 5, timestamp: 1 }
    ]
  });
  assert.equal(classifyTrend(workouts, 'ex').sessions, 4);
});

test('one observation per session, at the session\'s best set', () => {
  const workouts = history([100, 104, 108, 112]);
  workouts[3].sets.push({ id: 'b', exerciseId: 'ex', type: 'working', completed: true, weightKg: 60, reps: 5, timestamp: 1 });
  const t = classifyTrend(workouts, 'ex');
  assert.equal(t.sessions, 4, 'the back-off set must not add an observation');
  assert.equal(t.status, 'improving');
});

test('other exercises in the same sessions are ignored', () => {
  const workouts = history([100, 104, 108, 112]);
  for (const w of workouts) {
    w.sets.push({ id: `o${w.id}`, exerciseId: 'other', type: 'working', completed: true, weightKg: 999, reps: 5, timestamp: 9 });
  }
  assert.equal(classifyTrend(workouts, 'ex').observedBestKg, estimate1RM(112, 5));
});

test('the range filter is honoured, and unsorted input is sorted', () => {
  const workouts = history([100, 104, 108, 112, 116, 120]).reverse();
  const all = classifyTrend(workouts, 'ex');
  assert.equal(all.sessions, 6);
  assert.equal(all.firstDate, NOW - 35 * DAY);
  assert.equal(all.lastDate, NOW);
  const windowed = classifyTrend(workouts, 'ex', { start: NOW - 21 * DAY, end: NOW });
  assert.equal(windowed.sessions, 4);
  assert.equal(windowed.status, 'improving');
});

test('an exercise never trained is insufficient, not an error', () => {
  const t = classifyTrend(history([100, 104, 108, 112]), 'ex_never_touched');
  assert.equal(t.status, 'insufficient');
  assert.equal(t.sessions, 0);
});
