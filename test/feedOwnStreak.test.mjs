// THE STREAK NUMBER — one source of truth.
//
// Today used to show "0w STREAK" in its stats row (live, from computeTotals)
// next to "is on an 8-week streak" in the feed below it (stale, from a
// published community_events snapshot). mergeOwn now reconciles the user's own
// derived-count rows against local history, which is where the sets were
// logged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOwn } from '../src/services/feedPresenter.js';

const serverStreak = {
  id: 501, own: true, event_type: 'streak', subject: 'streak_8',
  created_at: new Date(2025, 5, 1).toISOString(), reaction_count: 3,
  metadata: { weeks: 8 }
};
const localStreak = {
  id: -2, local: true, own: true, event_type: 'streak', subject: 'streak_8',
  created_at: new Date(2025, 5, 1).toISOString(), reaction_count: 0,
  metadata: { weeks: 9 }
};

test('an own published streak takes its weeks from local history, keeping its reactions', () => {
  const merged = mergeOwn([serverStreak], [localStreak], { localAuthoritative: true });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 501);
  assert.equal(merged[0].reaction_count, 3);
  assert.equal(merged[0].metadata.weeks, 9);
});

test('an own published streak local history no longer supports is dropped', () => {
  // The streak has lapsed: ownAchievements emits no streak row at all, so the
  // published 8-week claim stops being asserted in the present tense.
  const merged = mergeOwn([serverStreak], [], { localAuthoritative: true });
  assert.deepEqual(merged, []);
});

test('the same is true of own workout milestones', () => {
  const milestone = { id: 502, own: true, event_type: 'workout_milestone', subject: 'workouts_50', metadata: { total: 50 } };
  assert.deepEqual(mergeOwn([milestone], [], { localAuthoritative: true }), []);
});

test('an own published PR is never dropped — a PR that happened stays happened', () => {
  const pr = { id: 503, own: true, event_type: 'pr', subject: 'ex-1', metadata: { weight_kg: 100 } };
  const merged = mergeOwn([pr], [], { localAuthoritative: true });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 503);
});

test("other people's streaks are left exactly as published", () => {
  const theirs = { id: 601, event_type: 'streak', subject: 'streak_12', metadata: { weeks: 12 } };
  const merged = mergeOwn([theirs], [], { localAuthoritative: true });
  assert.deepEqual(merged, [theirs]);
});

test('nothing is reconciled on a scope that synthesises no own rows', () => {
  // The friends scope is other people only. With no local rows to compare
  // against, every published own row must survive untouched.
  const merged = mergeOwn([serverStreak], [], { localAuthoritative: false });
  assert.deepEqual(merged, [serverStreak]);
});

test('a local row with no server twin still rides along', () => {
  const merged = mergeOwn([], [localStreak], { localAuthoritative: true });
  assert.deepEqual(merged, [localStreak]);
});

test('a local row is dropped once its server twin has arrived, so nothing doubles up', () => {
  const merged = mergeOwn([serverStreak], [localStreak], { localAuthoritative: true });
  assert.equal(merged.filter((e) => e.event_type === 'streak').length, 1);
});
