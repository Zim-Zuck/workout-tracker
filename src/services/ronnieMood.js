// RONNIE'S MOOD.
//
// One pure function, no React, no I/O — everything it needs is passed in as
// plain data so it can be unit tested against fixed clocks without touching
// IndexedDB. The caller (RonnieBanter) is responsible for reading the real
// workout history, totals and account-age signal and reducing them to the
// shape below.
//
// Thresholds live in RONNIE_MOOD_CONFIG so they can be tuned without touching
// the branching logic.
import { startOfDay } from '../utils/date.js';

export const RONNIE_MOOD_CONFIG = {
  // hype: a workout finished today, or a PR landed within this many ms.
  hypePRWindowMs: 6 * 60 * 60 * 1000,
  // sleepy: local hour >= start OR < end (wraps midnight).
  sleepyStartHour: 23,
  sleepyEndHour: 5,
  // roast: no workout for at least this many whole days...
  roastMinDaysSinceWorkout: 4,
  // ...or, if the user has never trained, the account must be at least this old
  // before roast is allowed to fire (a brand-new install stays smug).
  roastMinAccountAgeDaysIfNoHistory: 3,
  // impressed: streak at or above this, and still "on track" this week.
  impressedStreakWeeks: 2,
  impressedRecencyDays: 3
};

export const RONNIE_MOODS = ['hype', 'sleepy', 'roast', 'impressed', 'smug'];

// Whole calendar days between two timestamps, local time. Rounded rather than
// floored/divided outright: a DST transition makes one local day 23 or 25
// real hours long, so a plain (ms / 86400000) can land on a non-integer for
// that single day even though the calendar difference is exactly N days.
function daysBetween(fromMs, toMs) {
  return Math.round((startOfDay(toMs) - startOfDay(fromMs)) / 86400000);
}

function isMonday(nowMs) {
  return new Date(nowMs).getDay() === 1; // Sunday = 0
}

// True when `lastWorkoutDate` falls in the Thursday-through-Sunday window
// immediately before this Monday — "do not punish a normal rest-day gap".
function trainedInPriorThuSun(lastWorkoutDate, nowMs) {
  if (lastWorkoutDate == null) return false;
  const mondayStart = startOfDay(nowMs);
  const thursdayStart = mondayStart - 4 * 86400000;
  return lastWorkoutDate >= thursdayStart && lastWorkoutDate < mondayStart;
}

function shouldRoast({ hasHistory, lastWorkoutDate, daysSince, accountCreatedAt, now }, config) {
  if (isMonday(now) && trainedInPriorThuSun(lastWorkoutDate, now)) return false;
  if (!hasHistory) {
    // Unknown account age is treated as brand new (age 0) — the safe default
    // is to stay smug rather than roast someone whose install date we never
    // recorded.
    const accountAgeDays = accountCreatedAt != null ? daysBetween(accountCreatedAt, now) : 0;
    return accountAgeDays >= config.roastMinAccountAgeDaysIfNoHistory;
  }
  return daysSince != null && daysSince >= config.roastMinDaysSinceWorkout;
}

/**
 * input:
 *   lastWorkoutDate   ms of the most recently completed session, or null
 *   newPRAt           ms the most recent PR was set, or null
 *   sessionsThisWeek  completed sessions in the current Mon-Sun week
 *   streakWeeks       current streak, in weeks
 *   hasHistory        has the user ever completed a workout
 *   accountCreatedAt  ms this device/account first started using the app, or null
 * now: ms "current time" (defaults to Date.now(), overridable for tests)
 */
export function getRonnieMood(input, now = Date.now(), config = RONNIE_MOOD_CONFIG) {
  const {
    lastWorkoutDate = null,
    newPRAt = null,
    sessionsThisWeek = 0,
    streakWeeks = 0,
    hasHistory = false,
    accountCreatedAt = null
  } = input || {};

  const completedToday = lastWorkoutDate != null && startOfDay(lastWorkoutDate) === startOfDay(now);
  const recentPR = newPRAt != null && now >= newPRAt && now - newPRAt <= config.hypePRWindowMs;
  if (completedToday || recentPR) return 'hype';

  const hour = new Date(now).getHours();
  if (hour >= config.sleepyStartHour || hour < config.sleepyEndHour) return 'sleepy';

  const daysSince = lastWorkoutDate != null ? daysBetween(lastWorkoutDate, now) : null;

  if (shouldRoast({ hasHistory, lastWorkoutDate, daysSince, accountCreatedAt, now }, config)) return 'roast';

  const onTrack = sessionsThisWeek >= 1 || (daysSince != null && daysSince <= config.impressedRecencyDays);
  if (streakWeeks >= config.impressedStreakWeeks && onTrack) return 'impressed';

  return 'smug';
}
