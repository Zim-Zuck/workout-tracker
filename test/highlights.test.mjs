// TRAINING INTELLIGENCE v1.
//
// Deterministic templates over numbers classifyTrend already computed. The
// tests that matter are: no new thresholds were invented, every sentence
// contains the figures it claims to rest on, and "too little data" is never
// confused with "too variable" — different problems with different answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHighlights, HIGHLIGHT_LIMIT,
  TREND_FLAT_PCT, TREND_MIN_SESSIONS, TREND_MIN_SPAN_DAYS, classifyTrend
} from '../src/services/exerciseStats.js';

const DAY = 86400000;
const NOW = new Date(2025, 5, 11, 12, 0).getTime();

const set = (exerciseId, weightKg, i) => ({
  id: `s_${exerciseId}_${i}`, exerciseId, type: 'working', weightKg, reps: 5, completed: true, timestamp: i
});

// n weekly sessions of one exercise, ending at NOW.
const weekly = (exerciseId, weights) => weights.map((kg, i) => ({
  id: `${exerciseId}${i}`,
  date: NOW - (weights.length - 1 - i) * 7 * DAY,
  sets: [set(exerciseId, kg, i)]
}));

const merge = (...lists) => {
  const byDate = new Map();
  for (const list of lists) {
    for (const w of list) {
      const existing = byDate.get(w.date);
      if (existing) existing.sets.push(...w.sets);
      else byDate.set(w.date, { id: `w${w.date}`, date: w.date, sets: [...w.sets] });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date - b.date);
};

const named = (...ids) => ids.map((id) => ({ id, name: id.toUpperCase(), muscleGroups: ['Chest'] }));
const RANGE = { start: NOW - 120 * DAY, end: NOW };

test('the top improvers lead, biggest percentage first, capped at three', () => {
  const workouts = merge(
    weekly('a', [100, 104, 108, 112, 116, 120]),  // +20%
    weekly('b', [100, 103, 106, 109, 112, 115]),  // +15%
    weekly('c', [100, 102, 104, 106, 108, 110]),  // +10%
    weekly('d', [100, 101, 102, 103, 104, 105])   // +5%, crowded out
  );
  const h = buildHighlights(workouts, named('a', 'b', 'c', 'd'), RANGE);
  assert.equal(h.improving.length, HIGHLIGHT_LIMIT);
  assert.deepEqual(h.improving.map((x) => x.exercise.id), ['a', 'b', 'c']);
  const pcts = h.improving.map((x) => x.trend.pctChange);
  assert.deepEqual(pcts, [...pcts].sort((x, y) => y - x));
});

test('an improving sentence carries the percentage, the span and the session count', () => {
  const workouts = weekly('a', [100, 104, 108, 112, 116, 120]);
  const h = buildHighlights(workouts, named('a'), RANGE);
  const { sentence, trend } = h.improving[0];
  assert.match(sentence, /^A: \+\d+\.\d%/);
  assert.ok(sentence.includes(`${trend.pctChange.toFixed(1)}%`), sentence);
  assert.ok(sentence.includes(`${Math.round(trend.spanDays / 7)} weeks`), sentence);
  assert.ok(sentence.includes(`${trend.sessions} sessions`), sentence);
  // Nothing in the sentence that is not a computed figure.
  assert.equal(sentence, `A: +${trend.pctChange.toFixed(1)}% over 5 weeks, 6 sessions`);
});

test('a steady sentence names the flat threshold rather than restating it', () => {
  const workouts = weekly('a', [100, 100, 100, 100, 100, 100]);
  const h = buildHighlights(workouts, named('a'), RANGE);
  assert.equal(h.improving.length, 0);
  assert.equal(h.steady.length, 1);
  assert.ok(h.steady[0].sentence.includes(`within ${TREND_FLAT_PCT}%`), h.steady[0].sentence);
  assert.ok(h.steady[0].sentence.includes('6 sessions'));
});

test('steady is capped for display but the full count is reported', () => {
  const flat = [100, 100, 100, 100, 100, 100];
  const workouts = merge(weekly('a', flat), weekly('b', flat), weekly('c', flat), weekly('d', flat));
  const h = buildHighlights(workouts, named('a', 'b', 'c', 'd'), RANGE);
  assert.equal(h.steady.length, HIGHLIGHT_LIMIT);
  assert.equal(h.steadyTotal, 4);
});

test('too little data and too variable are counted separately', () => {
  const workouts = merge(
    weekly('a', [100, 104, 108, 112, 116, 120]),             // improving
    weekly('b', [100, 105]),                                  // too few sessions
    weekly('c', [0, 0, 0, 0, 0, 0]),                          // no load
    weekly('d', [100, 140, 95, 145, 105, 150, 100, 155])      // noisy
  );
  const h = buildHighlights(workouts, named('a', 'b', 'c', 'd'), RANGE);
  assert.equal(h.needMoreData.count, 2);
  assert.deepEqual(h.needMoreData.byReason, { too_few_sessions: 1, no_load: 1 });
  assert.equal(h.tooVariable.count, 1);
  assert.deepEqual(h.tooVariable.names, ['D']);
  // The noisy lift must not be counted as lacking data.
  assert.ok(!h.sentences.needMoreData.includes('D'), h.sentences.needMoreData);
});

test('the need-more-data sentence breaks the count down by reason', () => {
  const workouts = merge(
    weekly('b', [100, 105]),
    weekly('c', [100, 105, 110]),
    weekly('d', [0, 0, 0, 0, 0, 0])
  );
  const h = buildHighlights(workouts, named('b', 'c', 'd'), RANGE);
  assert.equal(h.needMoreData.count, 3);
  assert.ok(h.sentences.needMoreData.startsWith('3 lifts need more data:'), h.sentences.needMoreData);
  assert.ok(h.sentences.needMoreData.includes(`2 under ${TREND_MIN_SESSIONS} sessions`), h.sentences.needMoreData);
  assert.ok(h.sentences.needMoreData.includes('1 with no load logged'), h.sentences.needMoreData);
});

test('a span-too-short reason names the span minimum', () => {
  // Six sessions three days apart: enough sessions, not enough span.
  const dense = [100, 103, 106, 109, 112, 115].map((kg, i) => ({
    id: `d${i}`, date: NOW - (5 - i) * 3 * DAY, sets: [set('a', kg, i)]
  }));
  const h = buildHighlights(dense, named('a'), RANGE);
  assert.equal(h.needMoreData.byReason.span_too_short, 1);
  assert.ok(h.sentences.needMoreData.includes(`less than ${TREND_MIN_SPAN_DAYS} days`), h.sentences.needMoreData);
});

test('singular and plural are both handled', () => {
  const one = buildHighlights(weekly('b', [100, 105]), named('b'), RANGE);
  assert.ok(one.sentences.needMoreData.startsWith('1 lift needs more data:'), one.sentences.needMoreData);

  const noisyOne = buildHighlights(weekly('d', [100, 140, 95, 145, 105, 150, 100, 155]), named('d'), RANGE);
  assert.ok(noisyOne.sentences.tooVariable.startsWith('1 lift is too variable to call:'), noisyOne.sentences.tooVariable);
});

test('nothing withheld means no sentence at all, not an empty one', () => {
  const h = buildHighlights(weekly('a', [100, 104, 108, 112, 116, 120]), named('a'), RANGE);
  assert.equal(h.sentences.needMoreData, null);
  assert.equal(h.sentences.tooVariable, null);
  assert.equal(h.needMoreData.count, 0);
  assert.equal(h.tooVariable.count, 0);
});

test('an empty history produces an empty, non-throwing result', () => {
  const h = buildHighlights([], named('a'), RANGE);
  assert.deepEqual(h.improving, []);
  assert.deepEqual(h.steady, []);
  assert.equal(h.needMoreData.count, 0);
  assert.equal(h.sentences.needMoreData, null);
});

test('it invents no thresholds: every status comes from classifyTrend', () => {
  const workouts = merge(
    weekly('a', [100, 104, 108, 112, 116, 120]),
    weekly('b', [100, 100, 100, 100, 100, 100]),
    weekly('c', [100, 105])
  );
  const exercises = named('a', 'b', 'c');
  const h = buildHighlights(workouts, exercises, RANGE);
  for (const row of [...h.improving, ...h.steady]) {
    const direct = classifyTrend(workouts, row.exercise.id, RANGE);
    assert.equal(row.trend.status, direct.status);
    assert.equal(row.trend.pctChange, direct.pctChange);
    assert.equal(row.trend.sessions, direct.sessions);
  }
});

test('a declining lift is in neither highlight list, and is not withheld either', () => {
  // Declines are real results, but a "highlight" is not where they belong, and
  // they are certainly not missing data.
  const workouts = weekly('a', [120, 116, 112, 108, 104, 100]);
  const h = buildHighlights(workouts, named('a'), RANGE);
  assert.deepEqual(h.improving, []);
  assert.deepEqual(h.steady, []);
  assert.equal(h.needMoreData.count, 0);
  assert.equal(h.tooVariable.count, 0);
});

test('the range is honoured', () => {
  const workouts = weekly('a', [100, 104, 108, 112, 116, 120]);
  const narrow = buildHighlights(workouts, named('a'), { start: NOW - 14 * DAY, end: NOW });
  assert.equal(narrow.improving.length, 0);
  assert.equal(narrow.needMoreData.count, 1);
});

test('a deleted exercise appears in no sentence', () => {
  const workouts = merge(weekly('a', [100, 104, 108, 112, 116, 120]), weekly('ghost', [50, 55, 60, 65, 70, 75]));
  const h = buildHighlights(workouts, named('a'), RANGE);
  assert.deepEqual(h.improving.map((x) => x.exercise.id), ['a']);
  assert.equal(h.needMoreData.count, 0);
});
