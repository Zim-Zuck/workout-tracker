// EXPORTING A CHOSEN FEW WORKOUTS.
//
// The format is the product here — somebody pastes this into a message and
// reads it with their eyes — so it is asserted here rather than eyeballed in the
// app. Dates are the one thing not spelled out literally: they render in the
// runner's own locale, so the tests that touch them build the expected string
// the same way the exporter does and assert on ORDER and STRUCTURE instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  workoutToText, workoutsToText, workoutsToCsv, exportFilename, CSV_COLUMNS
} from '../src/services/workoutExport.js';
import { normalizeWorkout } from '../src/db/normalize.js';

const exercises = [
  { id: 'ex_bench', name: 'Bench Press', muscleGroups: ['Chest', 'Triceps'] },
  { id: 'ex_lat', name: 'Lat Pulldown', muscleGroups: ['Back', 'Biceps'] },
  { id: 'ex_press', name: 'Overhead Press', muscleGroups: ['Shoulders'] }
];
const exMap = new Map(exercises.map((e) => [e.id, e]));

const DAY = 86400000;
const T = new Date(2026, 10, 6, 18, 4).getTime(); // Fri 6 Nov 2026, 18:04 local

function workout(over = {}) {
  const date = over.date ?? T;
  return normalizeWorkout({
    id: 'wo_1', date, startTime: date, endTime: date + 48 * 60000,
    split: 'push', name: '', isActive: 0, notes: '', skipped: [],
    exercises: ['ex_bench', 'ex_press'],
    sets: [
      { id: 's1', exerciseId: 'ex_bench', type: 'warmup', weightKg: 40, reps: 10, timestamp: date + 100, completed: true },
      { id: 's2', exerciseId: 'ex_bench', type: 'working', weightKg: 80, reps: 8, timestamp: date + 200, completed: true },
      { id: 's3', exerciseId: 'ex_bench', type: 'working', weightKg: 82.5, reps: 6, timestamp: date + 300, completed: true },
      { id: 's4', exerciseId: 'ex_press', type: 'working', weightKg: 40, reps: 10, timestamp: date + 400, completed: true },
      { id: 's5', exerciseId: 'ex_press', type: 'working', weightKg: 40, reps: 8, timestamp: date + 500, completed: false }
    ],
    ...over
  });
}

test('a workout reads as a titled block with one line of sets per exercise', () => {
  const text = workoutToText(workout(), exMap);
  const lines = text.split('\n');
  assert.match(lines[0], /^Push · .*2026.*· 48m$/);
  assert.equal(lines[1], '');
  assert.equal(lines[2], 'Bench Press');
  assert.equal(lines[3], '  40 kg × 10 (warm-up), 80 kg × 8, 82.5 kg × 6');
  assert.equal(lines[4], 'Overhead Press');
  // The unticked set is kept and marked, not dropped: the export has to agree
  // with the session screen it came from.
  assert.equal(lines[5], '  40 kg × 10, 40 kg × 8 (not done)');
});

test('the totals line counts working sets only, and excludes warm-up volume', () => {
  const text = workoutToText(workout(), exMap);
  // 80×8 + 82.5×6 + 40×10 = 1,535 kg. The 40 kg warm-up and the unticked set
  // are both outside it.
  assert.match(text, /\n3 working sets · 1,535 kg$/);
});

test('one working set is not "1 working sets"', () => {
  const w = workout({
    exercises: ['ex_press'],
    sets: [{ id: 'a', exerciseId: 'ex_press', type: 'working', weightKg: 40, reps: 10, timestamp: T, completed: true }]
  });
  assert.match(workoutToText(w, exMap), /\n1 working set · 400 kg$/);
});

test('notes, a custom name and skipped exercises all survive the trip', () => {
  const text = workoutToText(
    workout({ notes: 'felt strong', name: 'Birthday bench', skipped: ['ex_lat'] }),
    exMap
  );
  assert.match(text, /^Push · /);
  assert.match(text, /\n"Birthday bench"\n/);
  assert.match(text, /\nSkipped: Lat Pulldown\n/);
  assert.match(text, /Notes: felt strong$/);
});

test('an exercise with no sets says so rather than vanishing', () => {
  const w = workout({ exercises: ['ex_bench', 'ex_lat'] });
  assert.match(workoutToText(w, exMap), /\nLat Pulldown\n  no sets\n/);
});

test('an exercise deleted from the library still exports its sets', () => {
  const w = workout({
    exercises: ['ex_gone'],
    sets: [{ id: 'a', exerciseId: 'ex_gone', type: 'working', weightKg: 50, reps: 5, timestamp: T, completed: true }]
  });
  const text = workoutToText(w, exMap);
  assert.match(text, /Deleted exercise \(ex_gone…\)/);
  assert.match(text, /50 kg × 5/);
});

test('a record that lost its exercise list is rebuilt from its sets', () => {
  const w = workout({ exercises: [] });
  const text = workoutToText(w, exMap);
  assert.match(text, /\nBench Press\n/);
  assert.match(text, /\nOverhead Press\n/);
});

test('several workouts export newest first, under a span header', () => {
  const list = [
    workout({ id: 'a', date: T - 4 * DAY }),
    workout({ id: 'b', date: T }),
    workout({ id: 'c', date: T - 2 * DAY })
  ];
  const text = workoutsToText(list, exMap);
  assert.match(text.split('\n')[0], /^Kun · 3 workouts · .+ – .+$/);
  // Dates are rendered in the runner's own locale, so the expected strings are
  // built the same way rather than hardcoded — the assertion is about ORDER.
  const day = (ts) => new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
  // Header names the oldest first and the newest last; the blocks then run
  // newest to oldest, matching the order History shows them in.
  assert.equal(text.split('\n')[0], `Kun · 3 workouts · ${day(T - 4 * DAY)} – ${day(T)}`);
  assert.equal(text.split('\n')[1], ''); // a blank line under the header
  const order = text.split('\n').filter((l) => l.startsWith('Push · ')).map((l) => l.split(' · ')[1]);
  assert.deepEqual(order, [T, T - 2 * DAY, T - 4 * DAY].map((ts) => `${day(ts)}, ${new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`));
});

test('a bodyweight set is reps, not "0 kg"', () => {
  const w = workout({
    exercises: ['ex_press'],
    sets: [{ id: 'a', exerciseId: 'ex_press', type: 'working', weightKg: 0, reps: 8, timestamp: T, completed: true }]
  });
  assert.match(workoutToText(w, exMap), /\n  bodyweight × 8\n/);
});

test('a single workout gets no span header', () => {
  const text = workoutsToText([workout()], exMap);
  assert.match(text, /^Push · /);
});

test('nothing selected exports nothing at all', () => {
  assert.equal(workoutsToText([], exMap), '');
});

test('the CSV is one row per set, oldest first, with units in the headings', () => {
  const csv = workoutsToCsv([workout({ id: 'b', date: T }), workout({ id: 'a', date: T - DAY })], exMap);
  const rows = csv.trim().split('\n');
  assert.equal(rows[0], CSV_COLUMNS.join(','));
  assert.equal(rows.length, 1 + 10); // two sessions, five sets each
  const first = rows[1].split(',');
  assert.equal(first[0], '2026-11-05');            // the older session leads
  assert.equal(first[2], 'Push');
  assert.equal(first[3], 'Bench Press');
  assert.equal(first[4], 'W');                      // warm-ups are lettered
  assert.equal(first[6], '40');                     // weight, unitless
  assert.equal(first[8], '');                       // no volume for a warm-up
  assert.equal(first[10], 'yes');
  const working = rows[2].split(',');
  assert.equal(working[4], '1');                    // working sets number from 1
  assert.equal(working[8], '640');                  // 80 × 8
});

test('an unticked set is a CSV row marked no, with no volume or 1RM', () => {
  const rows = workoutsToCsv([workout()], exMap).trim().split('\n');
  const last = rows[rows.length - 1].split(',');
  assert.equal(last[10], 'no');
  assert.equal(last[8], '');
  assert.equal(last[9], '');
});

test('a comma in an exercise or session name cannot break a column', () => {
  const map = new Map([['ex_odd', { id: 'ex_odd', name: 'Row, Pendlay "heavy"', muscleGroups: ['Back'] }]]);
  const w = workout({
    split: null, name: 'Day one, part two', exercises: ['ex_odd'],
    sets: [{ id: 'a', exerciseId: 'ex_odd', type: 'working', weightKg: 60, reps: 5, timestamp: T, completed: true }]
  });
  const row = workoutsToCsv([w], map).trim().split('\n')[1];
  assert.match(row, /"Row, Pendlay ""heavy"""/);
  assert.equal(row.split('"').length % 2, 1); // quotes balance
});

test('the filename says what is inside it', () => {
  assert.equal(exportFilename([workout()], 'text'), 'lift-workouts-2026-11-06.txt');
  assert.equal(
    exportFilename([workout({ date: T }), workout({ date: T - 7 * DAY })], 'csv'),
    'lift-workouts-2026-10-30_2026-11-06.csv'
  );
  assert.equal(exportFilename([], 'text'), 'lift-workouts-empty.txt');
});
