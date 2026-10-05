// SEARCHING THE EXERCISE LIBRARY.
//
// Driven against the REAL shipped library (src/data/defaultExercises.js), not a
// fixture, so a search that stops working because somebody renamed an exercise
// fails here rather than in somebody's gym.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_EXERCISES } = await import('../src/data/defaultExercises.js');
const { searchExercises, queryTokens, searchHaystack, matchesQuery } =
  await import('../src/services/exerciseSearch.js');
const { normalizeName, singularize } = await import('../src/services/exerciseIdentity.js');

const LIB = DEFAULT_EXERCISES;
const names = (list) => list.map((e) => e.name);

// ---- Normalization -------------------------------------------------------

test('normalizeName lowercases', () => {
  assert.equal(normalizeName('CABLE CURL'), 'cable curl');
  assert.equal(normalizeName('Cable Curl'), 'cable curl');
});

test('normalizeName strips punctuation of every kind', () => {
  assert.equal(normalizeName('cable-curl'), 'cable curl');
  assert.equal(normalizeName('Cable_Curl'), 'cable curl');
  assert.equal(normalizeName('Cable.Curl!'), 'cable curl');
  assert.equal(normalizeName('Pec Deck (Machine Fly)'), 'pec deck machine fly');
  assert.equal(normalizeName("Farmer's Carry"), 'farmer carry');
  assert.equal(normalizeName('Close-Grip Bench'), 'close grip bench');
});

test('normalizeName collapses extra whitespace', () => {
  assert.equal(normalizeName('   cable    curl  '), 'cable curl');
  assert.equal(normalizeName('cable\n\tcurl'), 'cable curl');
});

test('normalizeName removes plurals where it should, and not where it should not', () => {
  assert.equal(normalizeName('Cable Curls'), 'cable curl');
  assert.equal(normalizeName('Bayesian Cable Curls'), 'bayesian cable curl');
  assert.equal(normalizeName('Cable Crunches'), 'cable crunch');
  assert.equal(normalizeName('Cable Flies'), 'cable fly');
  // Words whose s is not a plural must survive intact, or 'press' becomes
  // 'pres' and stops matching itself.
  assert.equal(normalizeName('Bench Press'), 'bench press');
  assert.equal(normalizeName('Triceps Pushdown'), 'triceps pushdown');
  assert.equal(normalizeName('Dips'), 'dips');
  assert.equal(normalizeName('Abs'), 'abs');
  assert.equal(singularize('press'), 'press');
  assert.equal(singularize('curls'), 'curl');
});

test('normalizeName expands gym abbreviations', () => {
  assert.equal(normalizeName('DB Press'), 'dumbbell press');
  assert.equal(normalizeName('Incline db curl'), 'incline dumbbell curl');
  assert.equal(normalizeName('BB Row'), 'barbell row');
  assert.equal(normalizeName('EZ Curl'), 'ez bar curl');
  assert.equal(normalizeName('KB Swing'), 'kettlebell swing');
  // And an expansion still gets singularized afterwards.
  assert.equal(normalizeName('DB Curls'), 'dumbbell curl');
});

test('normalizeName removes filler words', () => {
  assert.equal(normalizeName('Curl with the Cable'), 'curl cable');
  assert.equal(normalizeName('Row with Dumbbell'), 'row dumbbell');
});

test('normalizeName is idempotent and total', () => {
  for (const ex of LIB) {
    const once = normalizeName(ex.name);
    assert.equal(normalizeName(once), once, `not idempotent for ${ex.name}`);
    assert.ok(once.length > 0, `empty normalization for ${ex.name}`);
  }
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName(''), '');
});

// ---- The required examples ----------------------------------------------

test('"cable curl" finds Cable Curl', () => {
  assert.ok(names(searchExercises(LIB, 'cable curl')).includes('Cable Curl'));
});

test('"cable-curl" finds Cable Curl', () => {
  const found = names(searchExercises(LIB, 'cable-curl'));
  assert.ok(found.includes('Cable Curl'));
  assert.equal(found[0], 'Cable Curl', 'the exact match ranks first');
});

test('"bayesian cable curls" finds Bayesian Cable Curl', () => {
  const found = names(searchExercises(LIB, 'bayesian cable curls'));
  assert.equal(found[0], 'Bayesian Cable Curl');
});

// ---- The four fields ----------------------------------------------------

test('search matches the exercise name', () => {
  assert.ok(names(searchExercises(LIB, 'deadlift')).includes('Deadlift'));
  assert.ok(names(searchExercises(LIB, 'bulgarian')).includes('Bulgarian Split Squat'));
});

test('search matches equipment', () => {
  const kettlebell = names(searchExercises(LIB, 'kettlebell'));
  assert.ok(kettlebell.includes('Kettlebell Swing'));
  assert.ok(kettlebell.includes("Farmer's Carry"), 'matched on its equipment, not its name');
  const machine = searchExercises(LIB, 'machine');
  assert.ok(machine.length > 3);
  assert.ok(machine.every((e) => searchHaystack(e).includes('machine')));
});

test('search matches muscle group', () => {
  const calves = names(searchExercises(LIB, 'calves'));
  assert.ok(calves.includes('Standing Calf Raise'));
  assert.ok(calves.includes('Donkey Calf Raise'));
  assert.ok(names(searchExercises(LIB, 'hamstrings')).includes('Nordic Curl'));
});

test('search matches aliases', () => {
  const withAlias = [
    ...LIB,
    { id: 'ex_x', name: 'Overhead Press', aliases: ['Military Press', 'Standing Press'], equipment: 'Barbell', muscleGroups: ['Shoulders'] }
  ];
  const found = searchExercises(withAlias, 'military press');
  assert.ok(found.some((e) => e.id === 'ex_x'), 'an alias is as searchable as a name');
  // And the alias normalizes like a name does.
  assert.ok(searchExercises(withAlias, 'MILITARY-PRESSES').some((e) => e.id === 'ex_x'));
});

test('every query token must match — the search is AND, not OR', () => {
  const found = names(searchExercises(LIB, 'cable curl'));
  assert.ok(found.includes('Cable Curl'));
  assert.ok(!found.includes('Barbell Curl'), 'a curl that is not a cable must not match');
  assert.ok(!found.includes('Cable Fly'), 'a cable that is not a curl must not match');
});

test('partial words match while you are still typing', () => {
  assert.ok(names(searchExercises(LIB, 'bay')).includes('Bayesian Cable Curl'));
  assert.ok(names(searchExercises(LIB, 'bulg')).includes('Bulgarian Split Squat'));
  assert.ok(names(searchExercises(LIB, 'pulld')).includes('Lat Pulldown'));
});

test('an empty query returns everything, alphabetically', () => {
  const all = searchExercises(LIB, '');
  assert.equal(all.length, LIB.length);
  const sorted = [...names(all)].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names(all), sorted);
  assert.deepEqual(names(searchExercises(LIB, '   ')), sorted);
});

test('nonsense returns nothing, which is what drives the empty state', () => {
  assert.equal(searchExercises(LIB, 'zzzqqq').length, 0);
  assert.equal(searchExercises(LIB, 'rowing machine erg sprint').length, 0);
});

test('results are ranked: exact, then prefix, then contains, then metadata', () => {
  const found = names(searchExercises(LIB, 'curl'));
  // Every result genuinely contains the token somewhere searchable.
  assert.ok(found.length > 5);
  for (const e of searchExercises(LIB, 'curl')) {
    assert.ok(searchHaystack(e).includes('curl'), `${e.name} matched nothing`);
  }
  // "Leg Curl" (name contains) must outrank nothing-but-metadata matches.
  const exact = names(searchExercises(LIB, 'leg curl'));
  assert.equal(exact[0], 'Leg Curl');
});

test('ordering is stable and does not depend on input order', () => {
  const a = names(searchExercises(LIB, 'press'));
  const b = names(searchExercises([...LIB].reverse(), 'press'));
  assert.deepEqual(a, b);
});

test('extraRank is applied before relevance, for the split-first picker', () => {
  const pinned = new Set(['ex_cable_curl']);
  const found = searchExercises(LIB, 'curl', { extraRank: (e) => (pinned.has(e.id) ? 0 : 1) });
  assert.equal(found[0].id, 'ex_cable_curl');
});

test('queryTokens and matchesQuery are usable on their own', () => {
  const t = queryTokens('Cable-Curls');
  assert.deepEqual(t, ['cable', 'curl']);
  const cableCurl = LIB.find((e) => e.id === 'ex_cable_curl');
  assert.equal(matchesQuery(cableCurl, t), true);
  assert.equal(matchesQuery(LIB.find((e) => e.id === 'ex_squat'), t), false);
});

test('search stays responsive at many times the current library size', () => {
  // 72 exercises today. 10,000 is far past anything a person will ever have,
  // and it must still feel instant under a keystroke.
  const big = [];
  for (let i = 0; i < 10000; i++) {
    const base = LIB[i % LIB.length];
    big.push({ ...base, id: `${base.id}_${i}`, name: `${base.name} ${i}` });
  }
  const t0 = performance.now();
  for (const q of ['c', 'ca', 'cab', 'cabl', 'cable', 'cable c', 'cable cu', 'cable curl']) {
    searchExercises(big, q);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `eight keystrokes over 10,000 exercises took ${ms.toFixed(0)}ms`);
});
