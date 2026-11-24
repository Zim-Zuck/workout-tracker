// THE TIMEFRAME REGISTRY.
//
// Three screens used to carry three independent window lists. These tests are
// what stops a fourth appearing, and what pins `resolveRange` to the behaviour
// it had inside progressSummary.js before it moved here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOWS, DASHBOARD_WINDOWS, SHARE_WINDOWS, EXERCISE_WINDOWS,
  timeframeList, pillOptions, dashboardPillOptions, windowDays, resolveRange, rangeFor,
  customRange, localDayBounds
} from '../src/services/timeframes.js';
import { TIMEFRAMES } from '../src/services/progressSummary.js';

const DAY = 86400000;

test('every preset id exists in the registry', () => {
  for (const ids of [DASHBOARD_WINDOWS, SHARE_WINDOWS, EXERCISE_WINDOWS]) {
    for (const id of ids) {
      assert.ok(WINDOWS[id], `${id} is not in the registry`);
    }
  }
});

test('every registry entry carries all three label forms and a days value', () => {
  for (const [id, w] of Object.entries(WINDOWS)) {
    assert.equal(typeof w.label, 'string', `${id} label`);
    assert.equal(typeof w.shortLabel, 'string', `${id} shortLabel`);
    assert.equal(typeof w.pill, 'string', `${id} pill`);
    assert.ok(w.days === null || typeof w.days === 'number', `${id} days`);
  }
});

test('the day counts are the ones the three old lists agreed on', () => {
  assert.equal(windowDays('2w'), 14);
  assert.equal(windowDays('4w'), 28);
  assert.equal(windowDays('6w'), 42);
  assert.equal(windowDays('12w'), 84);
  assert.equal(windowDays('3m'), 90);
  assert.equal(windowDays('6m'), 182);
  assert.equal(windowDays('1y'), 365);
  assert.equal(windowDays('all'), null);
  assert.equal(windowDays('custom'), null);
});

test('1m is gone: 4w is the only sub-month window', () => {
  // D3. A 30-day `1m` and a 28-day `4w` were the same question with two
  // answers; ExerciseDetail now asks the 28-day one.
  assert.equal(WINDOWS['1m'], undefined);
  assert.ok(EXERCISE_WINDOWS.includes('4w'));
  assert.ok(!EXERCISE_WINDOWS.includes('1m'));
});

test('progressSummary.TIMEFRAMES keeps the exact shape the share card reads', () => {
  // ProgressShareCard maps over this with .id/.label and is not being touched.
  assert.deepEqual(TIMEFRAMES.map((t) => t.id), SHARE_WINDOWS);
  for (const t of TIMEFRAMES) {
    assert.equal(typeof t.label, 'string');
    assert.equal(typeof t.shortLabel, 'string');
    assert.ok(t.days === null || typeof t.days === 'number');
  }
  // The labels the card was already printing.
  assert.equal(TIMEFRAMES.find((t) => t.id === '4w').label, '4 Weeks');
  assert.equal(TIMEFRAMES.find((t) => t.id === 'all').shortLabel, 'ALL TIME');
});

test('the dashboard pills read exactly as they did', () => {
  assert.deepEqual(dashboardPillOptions(), [
    { value: '2w', label: '2 weeks' },
    { value: '4w', label: '4 weeks' },
    { value: '6w', label: '6 weeks' },
    { value: '12w', label: '12 weeks' },
    { value: '1y', label: '1 year' }
  ]);
});

test('the exercise pills read as compact range chips', () => {
  assert.deepEqual(pillOptions(EXERCISE_WINDOWS), [
    { value: '4w', label: '4W' },
    { value: '3m', label: '3M' },
    { value: '6m', label: '6M' },
    { value: '1y', label: '1Y' },
    { value: 'all', label: 'All' }
  ]);
});

test('timeframeList keeps preset order and merges the registry entry', () => {
  const list = timeframeList(['4w', 'all']);
  assert.deepEqual(list.map((t) => t.id), ['4w', 'all']);
  assert.equal(list[0].days, 28);
});

test('resolveRange spans exactly the window for a preset id', () => {
  const now = Date.now();
  const { start, end } = resolveRange('6m', []);
  assert.ok(Math.abs(end - now) < 2000);
  assert.equal(end - start, 182 * DAY);
});

test('resolveRange falls back to 6 months for an unknown id', () => {
  const { start, end } = resolveRange('nonsense', []);
  assert.equal(end - start, 182 * DAY);
});

test('resolveRange on `all` starts at the first workout', () => {
  const first = Date.now() - 400 * DAY;
  const { start } = resolveRange('all', [{ date: first }, { date: Date.now() - DAY }]);
  assert.equal(start, first);
});

test('resolveRange on `all` with no history falls back to 4 weeks, not a zero range', () => {
  const { start, end } = resolveRange('all', []);
  assert.equal(end - start, 28 * DAY);
});

test('resolveRange honours a custom range, and ignores a half-filled one', () => {
  const from = Date.now() - 50 * DAY;
  const to = Date.now() - 20 * DAY;
  assert.deepEqual(resolveRange('custom', [], { start: from, end: to }), { start: from, end: to });
  // A custom id with no usable dates must not produce a broken range; it falls
  // through to the preset path, as it always did.
  const partial = resolveRange('custom', [], { start: from });
  assert.ok(partial.end > partial.start);
});

test('rangeFor is unbounded below for `all`', () => {
  const asOf = 1_700_000_000_000;
  assert.deepEqual(rangeFor('all', asOf), { start: -Infinity, end: asOf });
  assert.deepEqual(rangeFor('4w', asOf), { start: asOf - 28 * DAY, end: asOf });
});

// THE SHARE CARD AND THE EVOLUTION SCREEN PICK THE SAME DAYS.
//
// Both screens offer a custom range through a pair of "YYYY-MM-DD" date inputs.
// They used to parse those strings separately — the Evolution screen through
// customRange(), the share card through new Date(), which reads a bare date as
// UTC midnight. In UTC+2 the card's window therefore opened at 02:00 on its
// first day (missing an early session) and ran two hours into the day after its
// last. Both now go through customRange(), and resolveRange() takes the range
// it returns unchanged, so these tests pin the two paths to one answer.
test('the share card and the Evolution screen resolve a custom range identically', () => {
  // What TrainingEvolution.jsx computes for a custom period.
  const evolution = customRange('2026-02-01', '2026-02-07');
  // What ProgressShareCard.jsx hands buildProgressSummary, which resolves it
  // through resolveRange exactly as below.
  const shareCard = resolveRange('custom', [], customRange('2026-02-01', '2026-02-07'));
  assert.deepEqual(shareCard, evolution);
});

test('a custom share-card range opens at local midnight and closes at local end of day', () => {
  const range = resolveRange('custom', [], customRange('2026-02-01', '2026-02-07'));
  const open = new Date(range.start);
  const close = new Date(range.end);
  assert.equal(open.getHours(), 0);
  assert.equal(open.getMinutes(), 0);
  assert.equal(open.getDate(), 1);
  assert.equal(close.getDate(), 7);
  assert.equal(close.getHours(), 23);
  assert.equal(close.getMinutes(), 59);
});

test('a session logged in the first hour of a custom range is inside it', () => {
  // The exact case the UTC parsing lost: 00:30 local on the opening day.
  const range = resolveRange('custom', [], customRange('2026-02-01', '2026-02-07'));
  const earlySession = new Date(2026, 1, 1, 0, 30).getTime();
  const lateSession = new Date(2026, 1, 7, 22, 45).getTime();
  assert.ok(earlySession >= range.start && earlySession <= range.end);
  assert.ok(lateSession >= range.start && lateSession <= range.end);
  // And the day after the closing day is still outside.
  assert.ok(new Date(2026, 1, 8, 0, 30).getTime() > range.end);
});
