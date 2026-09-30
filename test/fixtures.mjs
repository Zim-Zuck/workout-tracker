// The hard cases, as data.
//
// Every one of these is something that is actually on somebody's phone, or could
// be. They are written in the OLD (pre-v3) shape — no order, no completedAt, no
// skipped, no split — because that is what the migration has to survive.
import { readFileSync, existsSync } from 'node:fs';

const T = 1727000000000; // a fixed "now" so every run is identical

// Two months of ordinary history, including the two shapes that produced the
// duplicate set number: completion timestamps out of logging sequence, and two
// sets landing on the same millisecond.
export function ordinaryHistory(count = 24) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = T - i * 3 * 86400000;
    out.push({
      id: 'wo_' + i, date: d, startTime: d, endTime: d + 55 * 60000,
      name: ['Morning Workout', 'Afternoon Workout', 'Evening Workout'][i % 3],
      exercises: ['ex_bench_press', 'ex_lat_pulldown'],
      notes: i % 4 === 0 ? 'felt strong' : '',
      isActive: 0,
      sets: [
        { id: `s${i}a`, exerciseId: 'ex_bench_press', type: 'warmup', weightKg: 40, reps: 10, timestamp: d + 400, completed: true },
        { id: `s${i}b`, exerciseId: 'ex_bench_press', type: 'working', weightKg: 80 + i * 0.5, reps: 8, timestamp: d + 900, completed: true },
        { id: `s${i}c`, exerciseId: 'ex_bench_press', type: 'working', weightKg: 80 + i * 0.5, reps: 8, timestamp: d + 700, completed: true },
        { id: `s${i}d`, exerciseId: 'ex_lat_pulldown', type: 'working', weightKg: 60, reps: 10, timestamp: d + 1000, completed: true },
        // the millisecond tie
        { id: `s${i}e`, exerciseId: 'ex_lat_pulldown', type: 'working', weightKg: 60, reps: 10, timestamp: d + 1000, completed: false }
      ]
    });
  }
  return out;
}

// A session that was running when the user updated the app. The single most
// likely moment for an upgrade to hurt somebody, because it is the one record
// they are actively looking at.
export const inProgressWorkout = {
  id: 'wo_active', date: T + 86400000, startTime: T + 86400000, endTime: null,
  name: 'Afternoon Workout', exercises: ['ex_squat'], isActive: 1, notes: '',
  sets: [
    { id: 'sa1', exerciseId: 'ex_squat', type: 'warmup', weightKg: 60, reps: 8, timestamp: T, completed: true },
    { id: 'sa2', exerciseId: 'ex_squat', type: 'working', weightKg: 100, reps: 5, timestamp: T + 60000, completed: true },
    { id: 'sa3', exerciseId: 'ex_squat', type: 'working', weightKg: 100, reps: 5, timestamp: T + 120000, completed: false }
  ]
};

// Records with fields missing or explicitly null. Written by builds with bugs,
// by a tab killed mid-write, or by a hand-edited export.
export const brokenRecords = [
  // no sets array at all
  { id: 'wo_nosets', date: T - 1000, name: 'Ghost', isActive: 0 },
  // null date, but a usable startTime
  { id: 'wo_nulldate', date: null, startTime: T - 2000, name: null, isActive: 0,
    sets: [{ id: 'bs1', exerciseId: 'ex_squat', type: 'working', weightKg: 90, reps: 5, timestamp: T - 2000, completed: true }] },
  // null weight and reps on a completed set
  { id: 'wo_nullnums', date: T - 3000, name: 'Odd', isActive: 0,
    sets: [{ id: 'bs2', exerciseId: 'ex_squat', type: 'working', weightKg: null, reps: null, timestamp: T - 3000, completed: true }] },
  // a set with no exerciseId, and no exercises list on the workout
  { id: 'wo_noex', date: T - 4000, name: 'Orphan', isActive: 0,
    sets: [{ id: 'bs3', type: 'working', weightKg: 50, reps: 12, timestamp: T - 4000, completed: true }] },
  // no type on the set (pre-dates set types existing)
  { id: 'wo_notype', date: T - 5000, name: 'Ancient', isActive: 0, exercises: ['ex_squat'],
    sets: [{ id: 'bs4', exerciseId: 'ex_squat', weightKg: 70, reps: 6, timestamp: T - 5000, completed: true }] },
  // a second active session — only one may survive as active
  { id: 'wo_active2', date: T + 10000, startTime: T + 10000, name: 'Stale active', isActive: 1, exercises: ['ex_squat'],
    sets: [{ id: 'bs5', exerciseId: 'ex_squat', type: 'working', weightKg: 80, reps: 5, timestamp: T + 10000, completed: false }] }
];

// Sets sharing one millisecond across a whole session — the pathological version
// of the tie, where timestamp carries no ordering information at all.
export const identicalTimestamps = {
  id: 'wo_sametime', date: T - 99000, startTime: T - 99000, name: 'Same instant', isActive: 0,
  exercises: ['ex_bench_press'],
  sets: Array.from({ length: 8 }, (_, i) => ({
    id: `same${i}`, exerciseId: 'ex_bench_press', type: 'working',
    weightKg: 100, reps: 5, timestamp: T - 99000, completed: true
  }))
};

// Sets pointing at exercises that are not in the library: one the user deleted,
// one from a custom lift, one from a future build.
export const unknownExerciseWorkout = {
  id: 'wo_unknownex', date: T - 88000, startTime: T - 88000, name: 'Mystery', isActive: 0,
  exercises: ['ex_deleted', 'ex_custom_mine', 'ex_from_the_future'],
  sets: [
    { id: 'u1', exerciseId: 'ex_deleted', type: 'working', weightKg: 55, reps: 9, timestamp: T - 88000, completed: true },
    { id: 'u2', exerciseId: 'ex_custom_mine', type: 'working', weightKg: 32.5, reps: 12, timestamp: T - 87000, completed: true },
    { id: 'u3', exerciseId: 'ex_from_the_future', type: 'myotatic', weightKg: 20, reps: 20, timestamp: T - 86000, completed: true }
  ]
};

// A large history. 5,000 workouts at 6 sets each is 30,000 set records, which is
// well past what any real user has and is the point of running it.
export function largeHistory(count = 5000) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = T - i * 3600000;
    out.push({
      id: 'big_' + i, date: d, startTime: d, endTime: d + 3600000,
      name: 'Workout', exercises: ['ex_squat', 'ex_bench_press'], isActive: 0, notes: '',
      sets: Array.from({ length: 6 }, (_, k) => ({
        id: `big_${i}_${k}`, exerciseId: k < 3 ? 'ex_squat' : 'ex_bench_press',
        type: k === 0 ? 'warmup' : 'working',
        weightKg: 60 + (i % 40) * 0.5, reps: 5 + (k % 3),
        timestamp: d + k * 60000, completed: true
      }))
    });
  }
  return out;
}

export const legacyExercises = [
  { id: 'ex_custom_mine', name: 'My Lift', muscleGroups: ['Chest'], defaultReps: [8, 10] },
  { id: 'ex_split_override', name: 'Overridden Lift', muscleGroups: ['Back'], split: 'pull', incrementKg: 2.5 }
];
export const legacySettings = [
  { key: 'defaultRestSec', value: 150 },
  { key: 'defaultRepsLow', value: 6 },
  { key: 'defaultRepsHigh', value: 12 },
  { key: 'soundEnabled', value: false }
];

// The user's own export, if they dropped one in. Used as an extra fixture rather
// than in place of the synthetic ones — real data proves the migration works on
// real data, and says nothing about the edge cases real data happens not to have.
export function myExport() {
  const path = 'fixtures/my-export.json';
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (err) { throw new Error(`fixtures/my-export.json exists but could not be parsed: ${err.message}`); }
}
