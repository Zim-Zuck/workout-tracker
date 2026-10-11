// THE STREAK, AND ITS GRACE WEEK.
//
// One definition, used by the stats row, the feed and Ronnie's mood alike:
// consecutive weeks with at least one session, with the current week allowed
// to be empty without ending anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak } from '../src/services/calculations.js';
import { startOfWeek } from '../src/utils/date.js';

const WEEK = 7 * 86400000;

// A Wednesday, so "this week" is unambiguous and nothing lands on a boundary.
const NOW = new Date(2025, 5, 11, 12, 0).getTime();
const thisWeek = startOfWeek(NOW);

// One session in each of the given weeks, counting back: 0 is this week.
const sessionsInWeeks = (...offsets) =>
  offsets.map((n) => ({ date: thisWeek - n * WEEK + 2 * 86400000 }));

test('no history is no streak', () => {
  assert.equal(computeStreak([], NOW), 0);
});

test('a session this week counts the current week', () => {
  assert.equal(computeStreak(sessionsInWeeks(0), NOW), 1);
  assert.equal(computeStreak(sessionsInWeeks(0, 1, 2), NOW), 3);
});

test('an empty current week does not end the streak', () => {
  // Monday morning after eight solid weeks: still 8, not 0.
  assert.equal(computeStreak(sessionsInWeeks(1, 2, 3, 4, 5, 6, 7, 8), NOW), 8);
});

test('the grace week is not counted as a week trained', () => {
  // Three weeks ending last week reads 3 today, and only becomes 4 once this
  // week has a session in it — a streak cannot grow without training.
  const trained = sessionsInWeeks(1, 2, 3);
  assert.equal(computeStreak(trained, NOW), 3);
  assert.equal(computeStreak([...trained, ...sessionsInWeeks(0)], NOW), 4);
});

test('two empty weeks in a row is a real break', () => {
  assert.equal(computeStreak(sessionsInWeeks(2, 3, 4), NOW), 0);
});

test('a gap further back ends the count there', () => {
  // Weeks 1, 2 and 3 are contiguous; week 5 is stranded behind the gap.
  assert.equal(computeStreak(sessionsInWeeks(1, 2, 3, 5), NOW), 3);
});

test('several sessions in one week still count that week once', () => {
  const sameWeek = [0, 1, 2].map((d) => ({ date: thisWeek + d * 86400000 }));
  assert.equal(computeStreak(sameWeek, NOW), 1);
});

test('the grace week holds across a year boundary', () => {
  const newYear = new Date(2026, 0, 1, 10, 0).getTime();
  const week = startOfWeek(newYear);
  const lastThree = [1, 2, 3].map((n) => ({ date: week - n * WEEK + 86400000 }));
  assert.equal(computeStreak(lastThree, newYear), 3);
});

test('a future-dated session cannot invent a streak out of nothing', () => {
  // Nothing in this week or last, so the count is 0 whatever sits ahead of it.
  const nextWeek = [{ date: thisWeek + WEEK + 86400000 }];
  assert.equal(computeStreak(nextWeek, NOW), 0);
});
