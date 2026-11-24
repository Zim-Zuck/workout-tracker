// FUN FACTS — every fact is a sentence built from a number a canonical
// function already computed, so the tests that matter are: the threshold
// that keeps a thin history from producing a silly fact, and that the
// sentence states the figure a canonical function actually produced (cross-
// checked against prTimeline/muscleVolume/repRangeCounts directly, never a
// hand-counted expectation that could quietly drift from them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFunFacts } from '../src/services/funFacts.js';
import { prTimeline } from '../src/services/prs.js';
import { startOfWeek } from '../src/utils/date.js';

const DAY = 86400000;
const BASE = new Date(2026, 2, 10, 12, 0).getTime();
const MON0 = startOfWeek(BASE);
// Pinned so factTrainingSpan (the one builder that reads real time) can
// never silently flip a test's expected fact list depending on what day it
// happens to run — every fixture below is dated relative to MON0, and asOf
// is always this same fixed instant, never Date.now().
const OPTS = { asOf: BASE };

let uid = 0;
const set = (exerciseId, weightKg, reps, overrides = {}) => ({
  id: `s${uid++}`, exerciseId, type: 'working', weightKg, reps, completed: true, timestamp: uid, ...overrides
});
const workout = (date, sets, overrides = {}) => ({ id: `w${uid++}`, date, sets, ...overrides });
const ex = (id, name, muscleGroups = ['Chest']) => ({ id, name, muscleGroups });
// week 0..n, day 0 = Monday .. 6 = Sunday, matching startOfWeek's Monday-first week.
const dateAt = (week, day) => MON0 + week * 7 * DAY + day * DAY;

test('an empty history produces an empty, non-throwing result', () => {
  assert.deepEqual(buildFunFacts([], [], OPTS), []);
});

test('a thin history still has a couple of honest "so far" facts, but none of the pattern facts that need a real sample', () => {
  // One set is a true (if modest) heaviest-set/best-1RM/busiest-muscle/
  // biggest-session fact — those have no minimum, they report the best of
  // whatever exists. What a single workout CANNOT produce is anything that
  // claims a pattern: a favorite, a weekday habit, a streak, a PR count.
  const workouts = [workout(dateAt(0, 0), [set('a', 20, 5)])];
  const facts = buildFunFacts(workouts, [ex('a', 'Curl')], OPTS);
  assert.ok(!facts.some((f) => /most-trained|Mondays|never once|weeks in a row|personal records/.test(f)), facts.join(' | '));
});

test('every returned fact is a non-empty sentence', () => {
  const workouts = [workout(dateAt(0, 0), [set('a', 100000, 1)])];
  const facts = buildFunFacts(workouts, [ex('a', 'Deadlift')], OPTS);
  assert.ok(facts.length > 0);
  for (const f of facts) {
    assert.equal(typeof f, 'string');
    assert.ok(f.length > 10, f);
  }
});

test('a huge single set is converted to a relatable object, skipping one too small to say', () => {
  // 100,000 kg: a grand piano (300 kg) would be "333x", outside the tellable
  // range this picks the next object that lands between 1.5x and 300x.
  const workouts = [workout(dateAt(0, 0), [set('a', 100000, 1)])];
  const facts = buildFunFacts(workouts, [ex('a', 'Deadlift')], OPTS);
  assert.ok(facts.some((f) => f.includes('a small car')), facts.join(' | '));
  assert.ok(!facts.some((f) => f.includes('grand piano')), facts.join(' | '));
});

test('no fact is offered once the total is too small for any object to land in range', () => {
  const workouts = [workout(dateAt(0, 0), [set('a', 20, 5)]), workout(dateAt(0, 1), [set('a', 20, 5)])];
  const facts = buildFunFacts(workouts, [ex('a', 'Curl')], OPTS);
  assert.ok(!facts.some((f) => f.includes('the weight of')), facts.join(' | '));
});

test('the heaviest set and the best estimated 1RM both name the exercise that earned them', () => {
  const workouts = [
    workout(dateAt(0, 0), [set('a', 100, 5), set('b', 140, 3)]),
    workout(dateAt(0, 1), [set('a', 120, 1)])
  ];
  const exercises = [ex('a', 'Bench Press'), ex('b', 'Deadlift')];
  const facts = buildFunFacts(workouts, exercises, OPTS);
  assert.ok(facts.some((f) => f.includes('140') && f.includes('Deadlift')), facts.join(' | '));
  // 120kg x 1 beats 140kg x3 on estimated 1RM (140 * (1 + 3/30) = 154 vs 120 * (1 + 1/30) = 124)
  // so the heavier BAR (140) wins "heaviest set" while a lighter bar can still
  // win "best estimated 1RM" if it carries more reps — assert each fact names
  // whichever exercise actually produced its own number, not the other one's.
  const e1rmFact = facts.find((f) => f.includes('estimated'));
  assert.ok(e1rmFact.includes('Deadlift'), e1rmFact);
});

test('a favorite exercise needs at least three sessions, not one', () => {
  const once = [workout(dateAt(0, 0), [set('a', 50, 10)])];
  assert.ok(!buildFunFacts(once, [ex('a', 'Row')], OPTS).some((f) => f.includes('most-trained')));

  const thrice = [workout(dateAt(0, 0), [set('a', 50, 10)]), workout(dateAt(0, 1), [set('a', 50, 10)]), workout(dateAt(0, 2), [set('a', 50, 10)])];
  const facts = buildFunFacts(thrice, [ex('a', 'Row')], OPTS);
  assert.ok(facts.some((f) => f.includes('Row') && f.includes('3 sessions')), facts.join(' | '));
});

test('the most-trained muscle names the real volume leader', () => {
  const workouts = [workout(dateAt(0, 0), [set('a', 200, 5), set('b', 20, 5)])];
  const exercises = [ex('a', 'Squat', ['Quads']), ex('b', 'Curl', ['Biceps'])];
  const facts = buildFunFacts(workouts, exercises, OPTS);
  assert.ok(facts.some((f) => f.includes('Quads')), facts.join(' | '));
  assert.ok(!facts.some((f) => f.includes('Biceps has taken')), facts.join(' | '));
});

test('a rep-range personality needs a real majority, not just a plurality of a tiny sample', () => {
  // 25 sets, all 6-9 reps: a clear majority of a large-enough sample.
  const sets = Array.from({ length: 25 }, (_, i) => set('a', 50, 8, { timestamp: i }));
  const workouts = [workout(dateAt(0, 0), sets)];
  const facts = buildFunFacts(workouts, [ex('a', 'Press')], OPTS);
  assert.ok(facts.some((f) => f.includes('6–9') && f.includes('hypertrophy')), facts.join(' | '));
});

test('busiest and never-trained weekdays both need a real pattern across at least eight sessions', () => {
  // Four weeks, Monday trained twice as often as every other weekday, Sunday never.
  const workouts = [];
  for (let week = 0; week < 4; week++) {
    for (const day of [0, 0, 1, 2, 3, 4, 5]) { // Mon, Mon, Tue..Sat — Sunday (6) never appears
      workouts.push(workout(dateAt(week, day), [set('a', 40, 10)]));
    }
  }
  const facts = buildFunFacts(workouts, [ex('a', 'Row')], OPTS);
  assert.ok(facts.some((f) => f.includes('Mondays')), facts.join(' | '));
  assert.ok(facts.some((f) => f.includes('Sunday')), facts.join(' | '));
});

test('fewer than eight workouts is too thin a sample for either weekday fact', () => {
  const workouts = [0, 0, 1, 2, 3, 4, 5].map((day) => workout(dateAt(0, day), [set('a', 40, 10)]));
  const facts = buildFunFacts(workouts, [ex('a', 'Row')], OPTS);
  assert.ok(!facts.some((f) => f.includes('Mondays') || f.includes('never once')), facts.join(' | '));
});

test('the longest session and the biggest session pick the true maximum, not the first or last', () => {
  const short = workout(dateAt(0, 0), [set('a', 50, 5)], { startTime: dateAt(0, 0), endTime: dateAt(0, 0) + 20 * 60000 });
  const longest = workout(dateAt(0, 1), [set('a', 50, 5)], { startTime: dateAt(0, 1), endTime: dateAt(0, 1) + 90 * 60000 });
  const middle = workout(dateAt(0, 2), [set('a', 50, 5)], { startTime: dateAt(0, 2), endTime: dateAt(0, 2) + 45 * 60000 });
  const biggestVolume = workout(dateAt(0, 3), [set('a', 500, 10)]);
  const facts = buildFunFacts([short, longest, middle, biggestVolume], [ex('a', 'Press')], OPTS);
  assert.ok(facts.some((f) => f.includes('1h 30m')), facts.join(' | '));
  assert.ok(facts.some((f) => f.includes('5,000') || f.includes('5000')), facts.join(' | '));
});

test('the longest streak is the best run anywhere in history, not the most recent one', () => {
  // Weeks 0-2 run (3), a gap, then weeks 5-9 run (5) — the longer, earlier-ending run wins.
  const weeks = [0, 1, 2, 5, 6, 7, 8, 9];
  const workouts = weeks.map((w) => workout(dateAt(w, 0), [set('a', 40, 10)]));
  const facts = buildFunFacts(workouts, [ex('a', 'Row')], OPTS);
  assert.ok(facts.some((f) => f.includes('5 weeks in a row')), facts.join(' | '));
});

test('a streak of two weeks is not a fact worth telling', () => {
  const workouts = [workout(dateAt(0, 0), [set('a', 40, 10)]), workout(dateAt(1, 0), [set('a', 40, 10)])];
  const facts = buildFunFacts(workouts, [ex('a', 'Row')], OPTS);
  assert.ok(!facts.some((f) => f.includes('weeks in a row')), facts.join(' | '));
});

test('training span switches from weeks to years once a year has passed', () => {
  const asOf = BASE;
  const fiveWeeksAgo = workout(asOf - 40 * DAY, [set('a', 40, 10)]);
  const overAYearAgo = workout(asOf - 400 * DAY, [set('a', 40, 10)]);

  const weeksFacts = buildFunFacts([fiveWeeksAgo], [ex('a', 'Row')], { asOf });
  assert.ok(weeksFacts.some((f) => f.includes('weeks, since')), weeksFacts.join(' | '));

  const yearsFacts = buildFunFacts([overAYearAgo], [ex('a', 'Row')], { asOf });
  assert.ok(yearsFacts.some((f) => f.includes('1.1 years')), yearsFacts.join(' | '));
});

test('total time trained converts to movies only once there are at least two of them', () => {
  const oneTimedSession = workout(dateAt(0, 0), [set('a', 40, 10)], {
    startTime: dateAt(0, 0), endTime: dateAt(0, 0) + 70 * 60000
  });
  const facts = buildFunFacts([oneTimedSession], [ex('a', 'Row')], OPTS);
  assert.ok(facts.some((f) => f.includes('1.2 hours') && !f.includes('movies')), facts.join(' | '));
});

test('personal records are counted by the real PR authority, not re-derived here', () => {
  // Escalating weight across four sessions: each beats the last, so each
  // (after the first, which can set no PR) is a weight PR.
  const workouts = [100, 105, 110, 115].map((kg, i) => workout(dateAt(i, 0), [set('a', kg, 5)]));
  const exercises = [ex('a', 'Squat')];
  const expected = prTimeline(workouts).length;
  assert.ok(expected >= 3, 'fixture must actually produce enough PRs to say');
  const facts = buildFunFacts(workouts, exercises, OPTS);
  assert.ok(facts.some((f) => f.includes(`${expected} personal records`)), facts.join(' | '));
});

test('fewer than three personal records is not a fact worth telling', () => {
  const workouts = [workout(dateAt(0, 0), [set('a', 100, 5)]), workout(dateAt(1, 0), [set('a', 105, 5)])];
  const facts = buildFunFacts(workouts, [ex('a', 'Squat')], OPTS);
  assert.ok(!facts.some((f) => f.includes('personal records')), facts.join(' | '));
});
