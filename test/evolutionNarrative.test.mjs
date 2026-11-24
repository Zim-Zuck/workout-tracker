// PLAIN-ENGLISH SUMMARIES.
//
// These tests exist to catch exactly one class of bug: a sentence that claims
// something the numbers do not support. Every assertion below either checks a
// literal sentence or checks that a figure quoted in the sentence is the one
// that was passed in — never a re-derivation of the arithmetic, which already
// has its own tests in trainingEvolution.test.mjs and highlights.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVolumeTrend, buildVerdict, summarizeDataGaps, VERDICT_STEADY_BAND_PCT
} from '../src/services/evolutionNarrative.js';
import { change } from '../src/services/trainingEvolution.js';
import { TREND_MIN_SESSIONS, TREND_MIN_SPAN_DAYS } from '../src/services/exerciseStats.js';
import { E1RM_REP_CAP } from '../src/services/calculations.js';

// --------------------------------------------------------- classifyVolumeTrend

test('a null percentage (nothing before) reads as improving, not steady', () => {
  assert.equal(classifyVolumeTrend(null), 'improving');
});

test('a change inside the steady band is steady in either direction', () => {
  assert.equal(classifyVolumeTrend(3), 'steady');
  assert.equal(classifyVolumeTrend(-3), 'steady');
  assert.equal(classifyVolumeTrend(0), 'steady');
});

test('a change outside the steady band reads as its sign, exactly at the boundary', () => {
  assert.equal(classifyVolumeTrend(VERDICT_STEADY_BAND_PCT), 'improving');
  assert.equal(classifyVolumeTrend(-VERDICT_STEADY_BAND_PCT), 'declining');
  assert.equal(classifyVolumeTrend(40), 'improving');
  assert.equal(classifyVolumeTrend(-40), 'declining');
});

// --------------------------------------------------------------- buildVerdict

const shapeEqual = { equalLength: true };
const shapeUnequal = { equalLength: false };

test('an empty period B says so and nothing else', () => {
  const sentence = buildVerdict({ flags: { emptyB: true } });
  assert.equal(sentence, 'Nothing has been logged yet in this period.');
});

test('an empty period A says there is nothing to compare, not "Infinity% more"', () => {
  const sentence = buildVerdict({ flags: { emptyA: true } });
  assert.match(sentence, /nothing yet to measure/);
  assert.ok(!sentence.includes('Infinity'), sentence);
  assert.ok(!sentence.includes('NaN'), sentence);
});

test('equal-length periods compare totals, and a big gain becomes a multiple', () => {
  const sentence = buildVerdict({
    delta: { workouts: change(10, 17), volumeKg: change(1000, 2000) },
    shape: shapeEqual,
    flags: {},
    muscle: []
  });
  assert.equal(sentence, 'You trained 70% more often and lifted about 2x the volume.');
});

test('unequal-length periods compare the per-week rate, not the totals', () => {
  const sentence = buildVerdict({
    // Totals would say "declining" — the rates (the honest comparison here)
    // say the opposite, and the sentence must follow the rates.
    delta: {
      workouts: change(20, 10), volumeKg: change(4000, 1000),
      perWeek: change(2, 5), volumePerWeek: change(400, 1000)
    },
    shape: shapeUnequal,
    flags: {},
    muscle: []
  });
  assert.match(sentence, /more often/);
  assert.ok(!sentence.includes('less often'), sentence);
});

test('a change inside the steady band reads as "about as often" / "about the same volume"', () => {
  const sentence = buildVerdict({
    delta: { workouts: change(10, 10.3), volumeKg: change(1000, 1020) },
    shape: shapeEqual,
    flags: {},
    muscle: []
  });
  assert.equal(sentence, 'You trained about as often as before and lifted about the same volume.');
});

test('a decline is stated plainly, with no alarm language', () => {
  const sentence = buildVerdict({
    delta: { workouts: change(10, 6), volumeKg: change(1000, 400) },
    shape: shapeEqual,
    flags: {},
    muscle: []
  });
  assert.equal(sentence, 'You trained 40% less often and lifted 60% less volume.');
});

test('one muscle grew the most, named without a trailing "and"', () => {
  const sentence = buildVerdict({
    delta: { workouts: change(10, 10), volumeKg: change(1000, 1000) },
    shape: shapeEqual,
    flags: {},
    muscle: [
      { label: 'Quads', value: change(200, 500) },
      { label: 'Chest', value: change(300, 250) }
    ]
  });
  assert.ok(sentence.endsWith('Quads grew the most.'), sentence);
});

test('two muscles grew the most, joined by "and"', () => {
  const sentence = buildVerdict({
    delta: { workouts: change(10, 10), volumeKg: change(1000, 1000) },
    shape: shapeEqual,
    flags: {},
    muscle: [
      { label: 'Quads', value: change(200, 500) },
      { label: 'Glutes', value: change(150, 400) },
      { label: 'Chest', value: change(300, 250) }
    ]
  });
  assert.ok(sentence.endsWith('Quads and Glutes grew the most.'), sentence);
});

test('no muscle growth omits the clause instead of naming what shrank least', () => {
  const sentence = buildVerdict({
    delta: { workouts: change(10, 10), volumeKg: change(1000, 1000) },
    shape: shapeEqual,
    flags: {},
    muscle: [{ label: 'Chest', value: change(300, 250) }]
  });
  assert.equal(sentence, 'You trained about as often as before and lifted about the same volume.');
});

test('starting from nothing reads as starting, never as a percentage', () => {
  const sentence = buildVerdict({
    delta: { workouts: change(0, 4), volumeKg: change(0, 2000) },
    shape: shapeEqual,
    flags: {},
    muscle: []
  });
  assert.ok(!sentence.includes('%'), sentence);
  assert.ok(!sentence.includes('Infinity'), sentence);
  assert.match(sentence, /started training/);
});

// ----------------------------------------------------------- summarizeDataGaps

const highlights = (needMoreData, tooVariable) => ({
  needMoreData: { count: Object.values(needMoreData).reduce((a, n) => a + n, 0), byReason: needMoreData },
  tooVariable: { count: tooVariable, names: [] }
});

test('nothing withheld is a total of zero and no reasons', () => {
  const g = summarizeDataGaps(highlights({}, 0));
  assert.equal(g.total, 0);
  assert.deepEqual(g.reasons, []);
});

test('the total adds too-little-data and too-variable together', () => {
  const g = summarizeDataGaps(highlights({ too_few_sessions: 2, no_load: 1 }, 3));
  assert.equal(g.total, 6);
});

test('reasons are sorted biggest first and carry a human label with its real threshold', () => {
  const g = summarizeDataGaps(highlights({ too_few_sessions: 1, span_too_short: 5 }, 2));
  assert.deepEqual(g.reasons.map((r) => r.reason), ['span_too_short', 'noisy', 'too_few_sessions']);
  const spanReason = g.reasons.find((r) => r.reason === 'span_too_short');
  assert.ok(spanReason.label.includes(String(TREND_MIN_SPAN_DAYS)), spanReason.label);
  const sessionsReason = g.reasons.find((r) => r.reason === 'too_few_sessions');
  assert.ok(sessionsReason.label.includes(String(TREND_MIN_SESSIONS)), sessionsReason.label);
});

test('rep-capped names the real cap rather than restating it', () => {
  const g = summarizeDataGaps(highlights({ rep_capped: 4 }, 0));
  assert.ok(g.reasons[0].label.includes(String(E1RM_REP_CAP)), g.reasons[0].label);
});

test('zero too-variable is left out of the reasons entirely', () => {
  const g = summarizeDataGaps(highlights({ no_load: 1 }, 0));
  assert.ok(!g.reasons.some((r) => r.reason === 'noisy'));
});
