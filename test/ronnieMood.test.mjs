// RONNIE'S MOOD — every priority branch and the edge cases from RONNIE_PROMPT.md §6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRonnieMood, RONNIE_MOOD_CONFIG } from '../src/services/ronnieMood.js';

// A fixed Wednesday, 2pm local, so hour/day-of-week assumptions in the tests
// are explicit rather than depending on when the suite happens to run.
const WED_2PM = new Date(2025, 0, 15, 14, 0, 0).getTime(); // 2025-01-15 is a Wednesday
const day = 86400000;

test('brand new user with no history defaults to smug', () => {
  const mood = getRonnieMood({ hasHistory: false, accountCreatedAt: WED_2PM }, WED_2PM);
  assert.equal(mood, 'smug');
});

test('hype: a workout completed today beats everything else', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 3600000,
    streakWeeks: 0,
    sessionsThisWeek: 1
  }, WED_2PM);
  assert.equal(mood, 'hype');
});

test('hype: a PR within the last 6 hours, even on a different day', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 2 * day,
    newPRAt: WED_2PM - 3 * 3600000
  }, WED_2PM);
  assert.equal(mood, 'hype');
});

test('a PR older than 6 hours does not trigger hype', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 10 * day,
    newPRAt: WED_2PM - 7 * 3600000
  }, WED_2PM);
  assert.notEqual(mood, 'hype');
});

test('sleepy: local hour >= 23', () => {
  const lateNight = new Date(2025, 0, 15, 23, 30, 0).getTime();
  const mood = getRonnieMood({ hasHistory: true, lastWorkoutDate: lateNight - 5 * day }, lateNight);
  assert.equal(mood, 'sleepy');
});

test('sleepy: local hour < 5', () => {
  const earlyMorning = new Date(2025, 0, 15, 4, 59, 0).getTime();
  const mood = getRonnieMood({ hasHistory: true, lastWorkoutDate: earlyMorning - 5 * day }, earlyMorning);
  assert.equal(mood, 'sleepy');
});

test('sleepy window is exclusive at the 5am end', () => {
  const fiveAM = new Date(2025, 0, 15, 5, 0, 0).getTime();
  const mood = getRonnieMood({ hasHistory: true, lastWorkoutDate: fiveAM - 5 * day }, fiveAM);
  assert.notEqual(mood, 'sleepy');
});

test('hype still wins over sleepy at 11:30pm if trained today', () => {
  const lateNight = new Date(2025, 0, 15, 23, 30, 0).getTime();
  const mood = getRonnieMood({ hasHistory: true, lastWorkoutDate: lateNight - 3600000 }, lateNight);
  assert.equal(mood, 'hype');
});

test('roast: 4+ days since last workout', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 4 * day,
    streakWeeks: 0,
    sessionsThisWeek: 0
  }, WED_2PM);
  assert.equal(mood, 'roast');
});

test('3 days since last workout is not yet roast', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 3 * day,
    streakWeeks: 0,
    sessionsThisWeek: 0
  }, WED_2PM);
  assert.notEqual(mood, 'roast');
});

test('roast with no history requires the account to be 3+ days old', () => {
  // Happens to be a Monday, but with no lastWorkoutDate the Monday exemption
  // never applies (it requires a workout to check the prior Thu-Sun window).
  const mondayNoon = new Date(2025, 0, 13, 12, 0, 0).getTime();
  const tooNew = getRonnieMood({ hasHistory: false, accountCreatedAt: mondayNoon - 2 * day }, mondayNoon);
  assert.equal(tooNew, 'smug');
  const oldEnough = getRonnieMood({ hasHistory: false, accountCreatedAt: mondayNoon - 3 * day }, mondayNoon);
  assert.equal(oldEnough, 'roast');
});

test('roast with no history and unknown account age stays smug', () => {
  const mood = getRonnieMood({ hasHistory: false, accountCreatedAt: null }, WED_2PM);
  assert.equal(mood, 'smug');
});

test('never roasts on a Monday if trained in the prior Thu-Sun window', () => {
  // Monday 2025-01-20. Thursday before it is 2025-01-16.
  const monday = new Date(2025, 0, 20, 14, 0, 0).getTime();
  const lastThursday = new Date(2025, 0, 16, 9, 0, 0).getTime();
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: lastThursday, // 4 days before Monday — would normally roast
    streakWeeks: 0,
    sessionsThisWeek: 0
  }, monday);
  assert.notEqual(mood, 'roast');
});

test('Monday exemption does not apply to a gap starting before that Thu-Sun window', () => {
  const monday = new Date(2025, 0, 20, 14, 0, 0).getTime();
  const theMondayBefore = new Date(2025, 0, 13, 9, 0, 0).getTime(); // a full week earlier
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: theMondayBefore,
    streakWeeks: 0,
    sessionsThisWeek: 0
  }, monday);
  assert.equal(mood, 'roast');
});

test('impressed: streak >= 2 weeks and a session logged this week', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 2 * day,
    streakWeeks: 3,
    sessionsThisWeek: 1
  }, WED_2PM);
  assert.equal(mood, 'impressed');
});

test('impressed: streak >= 2 weeks and last session <= 3 days ago, even with none logged this week', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 3 * day,
    streakWeeks: 2,
    sessionsThisWeek: 0
  }, WED_2PM);
  assert.equal(mood, 'impressed');
});

test('a 2-week streak that has gone cold (4+ days, off track) roasts instead of impresses', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 4 * day,
    streakWeeks: 2,
    sessionsThisWeek: 0
  }, WED_2PM);
  assert.equal(mood, 'roast');
});

test('default: everything else falls back to smug', () => {
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 2 * day,
    streakWeeks: 1,
    sessionsThisWeek: 1
  }, WED_2PM);
  assert.equal(mood, 'smug');
});

test('a custom config can move the thresholds without touching the branching', () => {
  const config = { ...RONNIE_MOOD_CONFIG, roastMinDaysSinceWorkout: 2 };
  const mood = getRonnieMood({
    hasHistory: true,
    lastWorkoutDate: WED_2PM - 2 * day,
    streakWeeks: 0,
    sessionsThisWeek: 0
  }, WED_2PM, config);
  assert.equal(mood, 'roast');
});

// ---------------------------------------------------------------------------
// Clock edge cases — the ones most likely to produce a wrong face.
// ---------------------------------------------------------------------------

// Machine-local DST transitions: a plain (ms / 86400000) lands on 3.96 or 4.04
// days across the shift, which would flip roast on or off by a rounding
// accident. daysBetween compares calendar day starts instead.
test('a gap spanning a DST transition is still counted in whole calendar days', () => {
  // Late March and late October cover both directions in either hemisphere.
  // Neither date is a Monday, so the Monday rest-day exemption cannot mask the
  // result. On a machine in a zone without DST this is simply a plain
  // four-calendar-day assertion, which is still worth holding.
  for (const [month, day] of [[2, 30], [9, 29]]) {
    const now = new Date(2025, month, day, 12, 0).getTime();
    const fourDaysAgo = new Date(2025, month, day - 4, 12, 0).getTime();
    assert.equal(
      getRonnieMood({ lastWorkoutDate: fourDaysAgo, hasHistory: true }, now),
      'roast',
      `four calendar days should roast around ${2025}-${month + 1}`
    );
    const threeDaysAgo = new Date(2025, month, day - 3, 12, 0).getTime();
    assert.notEqual(
      getRonnieMood({ lastWorkoutDate: threeDaysAgo, hasHistory: true }, now),
      'roast',
      `three calendar days should not roast around ${2025}-${month + 1}`
    );
  }
});

test('a session finished just after midnight counts as today, by the device clock', () => {
  // The app has no "my day starts at" setting, so the device's calendar day is
  // the only definition available. A 00:30 session is therefore today's, and
  // Ronnie is hype rather than sleepy — which is the right way round: he is
  // reacting to the work, not to the hour.
  const now = new Date(2025, 5, 10, 0, 45).getTime();
  const justFinished = new Date(2025, 5, 10, 0, 30).getTime();
  assert.equal(getRonnieMood({ lastWorkoutDate: justFinished, hasHistory: true }, now), 'hype');
});

test('Sunday night sits in sleepy, not in next week', () => {
  // 23:30 on a Sunday: the week strip is about to roll over, but mood is read
  // from the clock, not the week, so the boundary cannot produce a wrong face.
  const sundayLate = new Date(2025, 5, 8, 23, 30).getTime();
  assert.equal(new Date(sundayLate).getDay(), 0);
  assert.equal(
    getRonnieMood({
      lastWorkoutDate: new Date(2025, 5, 6, 18, 0).getTime(),
      sessionsThisWeek: 3, streakWeeks: 6, hasHistory: true
    }, sundayLate),
    'sleepy'
  );
});

test('the same instant read in a different timezone follows the device, not UTC', () => {
  // Mood is a function of local wall-clock time by design (getHours), so a
  // device that has moved timezones simply tells a different, locally correct
  // story about the same instant. Asserted via the local calendar rather than
  // by faking a zone: a workout logged at 22:00 local yesterday is 1 day ago
  // whatever offset the device is now on.
  const now = new Date(2025, 5, 10, 9, 0).getTime();
  const lastNight = new Date(2025, 5, 9, 22, 0).getTime();
  assert.equal(getRonnieMood({ lastWorkoutDate: lastNight, hasHistory: true }, now), 'smug');
});
