// EXERCISE RECONCILIATION.
//
// The three tiers, the merge mechanics, the redirects every lookup has to
// resolve through, and the promises the feature makes: nothing is deleted,
// nothing is asked twice, nothing needs a connection, and a merge can be taken
// back.
//
// Everything here runs against the REAL services and fake-indexeddb. There is
// no network in this file at all, which is also the offline test: if any part of
// reconciliation reached for a server, none of this could pass.
import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyDb, upgradeTo, deleteDatabase, tally } from './helpers.mjs';

const db = await import('../src/db/database.js');
const id = await import('../src/services/exerciseIdentity.js');
const rec = await import('../src/services/exerciseReconcile.js');
const { DEFAULT_EXERCISES, LIBRARY_VERSION } = await import('../src/data/defaultExercises.js');
const { searchExercises } = await import('../src/services/exerciseSearch.js');
const prs = await import('../src/services/prs.js');
const calc = await import('../src/services/calculations.js');

const NAME = db.DB_NAME_FOR_TESTS;

const LIB_BAYESIAN = DEFAULT_EXERCISES.find((e) => e.id === 'ex_bayesian_cable_curl');
const LIB_CABLE_CURL = DEFAULT_EXERCISES.find((e) => e.id === 'ex_cable_curl');
const LIB_SQUAT = DEFAULT_EXERCISES.find((e) => e.id === 'ex_squat');

function custom(name, over = {}) {
  return {
    id: over.id || `ex_custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name,
    muscleGroups: over.muscleGroups || ['Biceps'],
    equipment: over.equipment || 'Cable',
    defaultReps: [10, 15],
    defaultRestSec: 60,
    builtin: false,
    ...over
  };
}

// A workout logging `sets` sets against one exercise id.
function workoutFor(exerciseId, { id: woId = 'wo_1', date = 1_700_000_000_000, weights = [20, 22.5, 25] } = {}) {
  return {
    id: woId,
    clientId: woId,
    date,
    startTime: date,
    endTime: date + 3_600_000,
    split: 'pull',
    name: 'Pull',
    exercises: [exerciseId],
    sets: weights.map((w, i) => ({
      id: `${woId}_s${i}`,
      exerciseId,
      type: 'working',
      weightKg: w,
      reps: 10,
      order: i,
      timestamp: date + i,
      completedAt: date + i,
      completed: true
    })),
    skipped: [],
    notes: '',
    isActive: 0,
    status: 'finished',
    synced: true
  };
}

async function freshDb({ exercises = [], workouts = [], meta = [] } = {}) {
  await db.closeDB();
  await deleteDatabase(NAME);
  await buildLegacyDb(NAME, 2, {});
  const conn = await upgradeTo(NAME, db.CURRENT_DB_VERSION, db.applyUpgrades);
  conn.close();
  await db.closeDB();
  if (exercises.length) await db.bulkPut('exercises', exercises);
  for (const w of workouts) await db.saveWorkout(w);
  for (const m of meta) await db.setMeta(m.key, m.value);
}

beforeEach(async () => { await freshDb(); });

// ===========================================================================
// TASK 3B — the normalizer and the similarity function
// ===========================================================================

test('similarity is deterministic and symmetric', () => {
  const a = custom('Bayesian Cable Curl', { id: 'A' });
  const b = { ...LIB_BAYESIAN, id: 'B' };
  const s1 = id.similarity(a, b);
  const s2 = id.similarity(b, a);
  assert.equal(s1, s2);
  assert.equal(id.similarity(a, b), s1, 'calling twice gives the same answer');
  assert.ok(s1 > 0 && s1 <= 1);
});

test('similarity rewards matching equipment', () => {
  const base = { id: 'A', name: 'Zottman Curl', muscleGroups: ['Biceps'], equipment: 'Cable' };
  const same = { id: 'B', name: 'Zottman Curls', muscleGroups: ['Biceps'], equipment: 'Cable' };
  const other = { id: 'C', name: 'Zottman Curls', muscleGroups: ['Biceps'], equipment: 'Barbell' };
  // Names are identical after normalization, so classifyPair calls both Tier 1.
  // The RAW score is where the equipment bonus shows.
  assert.ok(id.similarity(base, same) > id.similarity(base, other));
  assert.ok(
    Math.abs((id.similarity(base, same) - id.similarity(base, other)) - id.WEIGHTS.equipment) < 1e-9,
    'the whole of the difference is the equipment bonus'
  );
});

test('similarity rewards matching muscle group', () => {
  const base = { id: 'A', name: 'Zottman Curl', muscleGroups: ['Biceps'], equipment: 'Cable' };
  const same = { id: 'B', name: 'Zottman Hold', muscleGroups: ['Biceps'], equipment: 'Cable' };
  const other = { id: 'C', name: 'Zottman Hold', muscleGroups: ['Calves'], equipment: 'Cable' };
  assert.ok(id.similarity(base, same) > id.similarity(base, other));
});

test('similarity sees through an alias', () => {
  const withAlias = { ...LIB_BAYESIAN, id: 'B', aliases: ['Bayesian Curl'] };
  const typed = custom('Bayesian Curl', { id: 'A' });
  const res = id.classifyPair(typed, withAlias);
  assert.equal(res.tier, id.TIER.IDENTICAL, 'an alias is a name for identity purposes');
});

test('an exercise is never similar to itself by id', () => {
  const res = id.classifyPair(LIB_BAYESIAN, LIB_BAYESIAN);
  assert.equal(res.tier, id.TIER.UNRELATED);
});

// ===========================================================================
// The three tiers — the exact cases the brief names
// ===========================================================================

test('TIER 1: "Bayesian Cable Curl" vs "Bayesian Cable Curls" is identical', () => {
  const res = id.classifyPair(custom('Bayesian Cable Curl', { id: 'A' }), { ...LIB_BAYESIAN, id: 'B', name: 'Bayesian Cable Curls' });
  assert.equal(res.tier, id.TIER.IDENTICAL);
  assert.equal(res.score, 1);
});

test('TIER 2: "Cable Bayesian Curl" is similar, not identical', () => {
  const res = id.classifyPair(custom('Cable Bayesian Curl', { id: 'A' }), { ...LIB_BAYESIAN, id: 'B' });
  assert.equal(res.tier, id.TIER.SIMILAR);
  assert.ok(res.score >= id.SIMILAR_THRESHOLD, `${res.score} should clear ${id.SIMILAR_THRESHOLD}`);
  assert.ok(res.score < 1, 'a reordering is not an identity');
});

test('TIER 3: an unrelated exercise is left alone', () => {
  const res = id.classifyPair(custom('Back Squat', { id: 'A', equipment: 'Barbell', muscleGroups: ['Quads'] }), { ...LIB_BAYESIAN, id: 'B' });
  assert.equal(res.tier, id.TIER.UNRELATED);
  assert.ok(res.score < id.SIMILAR_THRESHOLD);
});

test('TIER 3 holds for the hard case: a qualifier is not noise', () => {
  // "Cable Curl" and "Bayesian Cable Curl" are different lifts. This is the
  // pair the threshold exists to keep apart, and it is the one that would do
  // real damage if it merged.
  const res = id.classifyPair(custom('Cable Curl', { id: 'A' }), { ...LIB_BAYESIAN, id: 'B' });
  assert.equal(res.tier, id.TIER.UNRELATED);
});

test('the threshold separates every library pair correctly', () => {
  // No two shipped exercises may be classified as the same lift.
  for (let i = 0; i < DEFAULT_EXERCISES.length; i++) {
    for (let j = i + 1; j < DEFAULT_EXERCISES.length; j++) {
      const res = id.classifyPair(DEFAULT_EXERCISES[i], DEFAULT_EXERCISES[j]);
      assert.equal(
        res.tier, id.TIER.UNRELATED,
        `${DEFAULT_EXERCISES[i].name} and ${DEFAULT_EXERCISES[j].name} scored ${res.score} (${res.tier})`
      );
    }
  }
});

// ===========================================================================
// TASK 3A — library deduplication
// ===========================================================================

test('the shipped library contains no duplicates to merge', async () => {
  await freshDb({ exercises: DEFAULT_EXERCISES });
  const { proposals, review, applied } = await rec.dedupeLibrary();
  assert.deepEqual(proposals, [], 'a clean library proposes nothing');
  assert.equal(review.ok, true);
  assert.equal(applied, 0);
});

test('duplicate library entries are proposed before anything is applied', async () => {
  const dupeOne = { ...LIB_CABLE_CURL, id: 'ex_cable_curl_1', name: 'Cable Curl' };
  const dupeTwo = { ...LIB_CABLE_CURL, id: 'ex_cable_curl_2', name: 'Cable Curls' };
  const plural = { ...LIB_BAYESIAN, id: 'ex_bayesian_cable_curls', name: 'Bayesian Cable Curls' };
  const exercises = [LIB_BAYESIAN, plural, dupeOne, dupeTwo, LIB_SQUAT];
  await freshDb({ exercises });

  // DRY RUN FIRST: the proposal list is produced and reviewed, and nothing is
  // written. This is the step that makes the data fix checkable.
  const dry = await rec.dedupeLibrary({ apply: false });
  assert.equal(dry.applied, 0);
  assert.equal(dry.review.ok, true, dry.review.errors.join('; '));
  assert.equal(dry.proposals.length, 2);
  const labels = dry.proposals.map((p) => `${p.fromName} → ${p.intoName}`).sort();
  assert.deepEqual(labels, ['Bayesian Cable Curls → Bayesian Cable Curl', 'Cable Curls → Cable Curl']);
  // Nothing on disk changed.
  assert.ok((await db.getAllExercises()).every((e) => !e.mergedInto));

  const applied = await rec.dedupeLibrary();
  assert.equal(applied.applied, 2);

  const after = await db.getAllExercises();
  assert.equal(after.length, 5, 'NOTHING was deleted');
  const survivors = after.filter((e) => !e.mergedInto);
  assert.equal(survivors.length, 3);
  // The dropped name survives as an alias, so searching for it still works.
  const canonical = after.find((e) => e.id === 'ex_bayesian_cable_curl');
  assert.ok(canonical.aliases.includes('Bayesian Cable Curls'));
});

test('deduplication re-points every reference, with no orphans left', async () => {
  const plural = { ...LIB_BAYESIAN, id: 'ex_bayesian_cable_curls', name: 'Bayesian Cable Curls' };
  await freshDb({
    exercises: [LIB_BAYESIAN, plural],
    // History split across both ids — exactly the damage duplicates cause.
    workouts: [
      workoutFor('ex_bayesian_cable_curl', { id: 'wo_a', date: 1000 }),
      workoutFor('ex_bayesian_cable_curls', { id: 'wo_b', date: 2000, weights: [27.5, 30] })
    ]
  });
  const before = tally(await db.getAllWorkouts());

  await rec.dedupeLibrary();

  const exercises = await db.getAllExercises();
  const index = id.buildMergeIndex(exercises);
  const projected = id.projectWorkouts(await db.getAllWorkouts(), index);

  // Every reference in the projected view points at a VISIBLE exercise.
  const visible = new Set(id.visibleExercises(exercises).map((e) => e.id));
  for (const w of projected) {
    for (const ref of w.exercises) assert.ok(visible.has(ref), `orphaned exercise ref ${ref}`);
    for (const s of w.sets) assert.ok(visible.has(s.exerciseId), `orphaned set ref ${s.exerciseId}`);
  }
  // And they all point at the ONE canonical id.
  const ids = new Set(projected.flatMap((w) => w.sets.map((s) => s.exerciseId)));
  assert.deepEqual([...ids], ['ex_bayesian_cable_curl']);
  // Not one set, rep or kilogram moved.
  assert.deepEqual(tally(projected), before);
});

test('the canonical record is chosen deterministically, built-in first', async () => {
  const counts = new Map([['ex_c', 50]]);
  const builtin = { id: 'ex_b', name: 'Cable Curl', builtin: true, muscleGroups: ['Biceps'] };
  const customWithHistory = { id: 'ex_c', name: 'Cable Curls', builtin: false, muscleGroups: ['Biceps'] };
  // Built-in wins even against a custom record with far more logged sets.
  assert.equal(rec.chooseCanonical(builtin, customWithHistory, counts).id, 'ex_b');
  assert.equal(rec.chooseCanonical(customWithHistory, builtin, counts).id, 'ex_b');

  // Between two customs, the one the history leans on wins.
  const c1 = { id: 'ex_x', name: 'Cable Curl', builtin: false };
  const c2 = { id: 'ex_y', name: 'Cable Curls', builtin: false };
  assert.equal(rec.chooseCanonical(c1, c2, new Map([['ex_y', 10]])).id, 'ex_y');
  // And with nothing to separate them, the lower id — never array order.
  assert.equal(rec.chooseCanonical(c1, c2).id, 'ex_x');
  assert.equal(rec.chooseCanonical(c2, c1).id, 'ex_x');
});

test('proposals that would lose or corrupt data are refused, not applied', () => {
  const a = { id: 'ex_a', name: 'Cable Curl', builtin: true };
  const b = { id: 'ex_b', name: 'Cable Curls', builtin: false };
  const c = { id: 'ex_c', name: 'Cable Curling', builtin: false };
  const exercises = [a, b, c];

  const ok = rec.validateMergeProposals(
    [{ fromId: 'ex_b', fromName: 'Cable Curls', intoId: 'ex_a', intoName: 'Cable Curl' }], exercises
  );
  assert.equal(ok.ok, true, ok.errors.join('; '));

  const missing = rec.validateMergeProposals(
    [{ fromId: 'ex_zz', fromName: 'Ghost', intoId: 'ex_a', intoName: 'Cable Curl' }], exercises
  );
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /does not exist/);

  const selfMerge = rec.validateMergeProposals(
    [{ fromId: 'ex_a', fromName: 'Cable Curl', intoId: 'ex_a', intoName: 'Cable Curl' }], exercises
  );
  assert.equal(selfMerge.ok, false);

  const chain = rec.validateMergeProposals([
    { fromId: 'ex_c', fromName: 'Cable Curling', intoId: 'ex_b', intoName: 'Cable Curls' },
    { fromId: 'ex_b', fromName: 'Cable Curls', intoId: 'ex_a', intoName: 'Cable Curl' }
  ], exercises);
  assert.equal(chain.ok, false, 'a merge target must not also be merged away');

  const cycle = rec.validateMergeProposals([
    { fromId: 'ex_b', fromName: 'b', intoId: 'ex_c', intoName: 'c' },
    { fromId: 'ex_c', fromName: 'c', intoId: 'ex_b', intoName: 'b' }
  ], exercises);
  assert.equal(cycle.ok, false);

  const builtinAway = rec.validateMergeProposals(
    [{ fromId: 'ex_a', fromName: 'Cable Curl', intoId: 'ex_b', intoName: 'Cable Curls' }], exercises
  );
  assert.equal(builtinAway.ok, false, 'a built-in must never be merged into a custom');
});

test('a failed review stops the whole fix — no half-applied merge', async () => {
  await freshDb({ exercises: [LIB_BAYESIAN] });
  const bad = [{ fromId: 'ex_nope', fromName: 'x', intoId: 'ex_bayesian_cable_curl', intoName: 'y' }];
  const review = rec.validateMergeProposals(bad, await db.getAllExercises());
  assert.equal(review.ok, false);
  // And applyMerge itself refuses a source that does not exist.
  assert.equal(await rec.applyMerge('ex_nope', 'ex_bayesian_cable_curl'), null);
});

// ===========================================================================
// TASK 3C — versioned, offline reconciliation of custom exercises
// ===========================================================================

test('Tier 1 merges automatically, with no question asked', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });

  const res = await rec.reconcileCustomExercises();
  assert.equal(res.merged.length, 1);
  assert.equal(res.merged[0].intoId, 'ex_bayesian_cable_curl');
  assert.equal(res.suggestions.length, 0, 'an identical name needs no suggestion');

  const stored = (await db.getAllExercises()).find((e) => e.id === mine.id);
  assert.equal(stored.mergedInto, 'ex_bayesian_cable_curl');
  assert.ok(stored.mergedAt > 0);
  assert.equal(stored.name, 'Bayesian Cable Curls', 'the original record is untouched apart from the redirect');
});

test('Tier 2 creates a suggestion and merges nothing', async () => {
  const mine = custom('Cable Bayesian Curl');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });

  const res = await rec.reconcileCustomExercises();
  assert.equal(res.merged.length, 0, 'a similar name must never merge on its own');
  assert.equal(res.suggestions.length, 1);
  assert.equal(res.suggestions[0].customId, mine.id);
  assert.equal(res.suggestions[0].libraryId, 'ex_bayesian_cable_curl');
  assert.ok(res.suggestions[0].score >= id.SIMILAR_THRESHOLD);

  const stored = (await db.getAllExercises()).find((e) => e.id === mine.id);
  assert.equal(stored.mergedInto, undefined);
  // And it is still in the picker, because it is still its own exercise.
  assert.ok(id.visibleExercises(await db.getAllExercises()).some((e) => e.id === mine.id));
});

test('Tier 3 is left completely alone', async () => {
  const mine = custom('Reverse Nordic Hamstring Hold', { equipment: 'Bodyweight', muscleGroups: ['Quads'] });
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });

  const res = await rec.reconcileCustomExercises();
  assert.equal(res.merged.length, 0);
  assert.equal(res.suggestions.length, 0);
  assert.equal(res.untouched, 1);
  const stored = (await db.getAllExercises()).find((e) => e.id === mine.id);
  assert.deepEqual(stored, { ...mine });
});

test('reconciliation runs only when the library version has moved', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({
    exercises: [...DEFAULT_EXERCISES, mine],
    meta: [
      { key: rec.LAST_RECONCILED_KEY, value: LIBRARY_VERSION },
      { key: rec.LIBRARY_DEDUPED_KEY, value: LIBRARY_VERSION }
    ]
  });

  const skipped = await rec.reconcileOnLaunch();
  assert.equal(skipped.skipped, true);
  assert.equal(
    (await db.getAllExercises()).find((e) => e.id === mine.id).mergedInto, undefined,
    'an up-to-date device does no work and changes nothing'
  );
});

test('a device behind the library version reconciles, then records the version', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({
    exercises: [...DEFAULT_EXERCISES, mine],
    meta: [{ key: rec.LAST_RECONCILED_KEY, value: LIBRARY_VERSION - 1 }]
  });

  const res = await rec.reconcileOnLaunch();
  assert.equal(res.skipped, false);
  assert.equal(res.custom.merged.length, 1);
  assert.equal(await db.getMeta(rec.LAST_RECONCILED_KEY), LIBRARY_VERSION);
  assert.equal(await db.getMeta(rec.LIBRARY_DEDUPED_KEY), LIBRARY_VERSION);

  // The second launch is a no-op.
  const second = await rec.reconcileOnLaunch();
  assert.equal(second.skipped, true);
});

test('reconciling repeatedly is idempotent', async () => {
  const mine = custom('Bayesian Cable Curls');
  const similar = custom('Cable Bayesian Curl', { id: 'ex_custom_cbc' });
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine, similar] });

  const first = await rec.reconcileCustomExercises();
  const second = await rec.reconcileCustomExercises();
  const third = await rec.reconcileCustomExercises();

  assert.equal(first.merged.length, 1);
  assert.equal(second.merged.length, 0, 'nothing left to merge the second time');
  assert.equal(third.merged.length, 0);
  // The suggestion is not duplicated, and keeps its original timestamp.
  assert.equal(third.suggestions.length, 1);
  assert.equal(third.suggestions[0].createdAt, first.suggestions[0].createdAt);

  const all = await db.getAllExercises();
  assert.equal(all.filter((e) => e.mergedInto).length, 1);
});

test('reconciliation completes offline — it touches no network at all', async () => {
  // There is no fetch, no Supabase client and no `navigator.onLine` in this
  // process. If any part of the path reached for one, this would throw.
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('reconciliation must not use the network'); };
  try {
    const mine = custom('Bayesian Cable Curls');
    await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });
    const res = await rec.reconcileOnLaunch();
    assert.equal(res.custom.merged.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ===========================================================================
// Keep separate
// ===========================================================================

test('"Keep separate" is remembered permanently for that pair', async () => {
  const mine = custom('Cable Bayesian Curl');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });

  const first = await rec.reconcileCustomExercises();
  assert.equal(first.suggestions.length, 1);

  await rec.keepSeparate(mine.id, 'ex_bayesian_cable_curl');
  assert.deepEqual(await rec.getSuggestions(), [], 'the card goes away immediately');

  // Every future reconciliation, forever.
  for (let i = 0; i < 5; i++) {
    const again = await rec.reconcileCustomExercises();
    assert.equal(again.suggestions.length, 0, 'the same question must never be asked twice');
    assert.equal(again.merged.length, 0);
  }
  const stored = (await db.getAllExercises()).find((e) => e.id === mine.id);
  assert.equal(stored.mergedInto, undefined);
});

test('"Keep separate" is per pair, not per exercise', async () => {
  // Kept apart from Bayesian Cable Curl, this custom must still be offered the
  // plain Cable Curl if that is a better match later on.
  const mine = custom('Cable Bayesian Curl');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });
  await rec.keepSeparate(mine.id, 'ex_bayesian_cable_curl');

  const set = await rec.getKeepSeparate();
  assert.ok(set.has(`${mine.id}|ex_bayesian_cable_curl`));
  assert.ok(!set.has(`${mine.id}|ex_cable_curl`));
});

test('accepting a suggestion merges it and clears the card', async () => {
  const mine = custom('Cable Bayesian Curl');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });
  await rec.reconcileCustomExercises();

  await rec.acceptSuggestion(mine.id, 'ex_bayesian_cable_curl');
  assert.deepEqual(await rec.getSuggestions(), []);
  assert.equal((await db.getAllExercises()).find((e) => e.id === mine.id).mergedInto, 'ex_bayesian_cable_curl');
});

// ===========================================================================
// TASK 3D — merge mechanics and the redirects
// ===========================================================================

test('a merge never rewrites history on disk', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({
    exercises: [...DEFAULT_EXERCISES, mine],
    workouts: [workoutFor(mine.id)]
  });
  const beforeWorkout = await db.getWorkout('wo_1');

  await rec.reconcileCustomExercises();

  const afterWorkout = await db.getWorkout('wo_1');
  assert.deepEqual(afterWorkout, beforeWorkout, 'not one byte of the workout changed');
  assert.ok(afterWorkout.sets.every((s) => s.exerciseId === mine.id));
});

test('every lookup resolves through the redirect', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({
    exercises: [...DEFAULT_EXERCISES, mine],
    workouts: [
      workoutFor(mine.id, { id: 'wo_old', date: 1000, weights: [20, 22.5] }),
      workoutFor('ex_bayesian_cable_curl', { id: 'wo_new', date: 2000, weights: [25, 27.5] })
    ]
  });
  await rec.reconcileCustomExercises();

  const exercises = await db.getAllExercises();
  const index = id.buildMergeIndex(exercises);
  const projected = id.projectWorkouts(await db.getAllWorkouts(), index);

  // resolveExerciseId — the primitive every other lookup is built on.
  assert.equal(id.resolveExerciseId(index, mine.id), 'ex_bayesian_cable_curl');

  // WORKOUT HISTORY: both sessions now read as the same lift.
  const refs = new Set(projected.flatMap((w) => w.sets.map((s) => s.exerciseId)));
  assert.deepEqual([...refs], ['ex_bayesian_cable_curl']);

  // PR CALCULATION: the 27.5 kg set is a PR over the merged 22.5 kg history,
  // which it could not be if the two ids were still separate.
  const history = projected.filter((w) => w.id !== 'wo_new');
  const newSession = projected.find((w) => w.id === 'wo_new');
  const pr = prs.sessionPRForExercise('ex_bayesian_cable_curl', newSession.sets, history);
  assert.ok(pr, 'the merged history is what the PR is measured against');
  assert.equal(pr.kind, 'weight');

  // CHARTS / STATISTICS: volume for the canonical id covers both sessions.
  const allSets = projected.flatMap((w) => w.sets);
  const forCanonical = allSets.filter((s) => s.exerciseId === 'ex_bayesian_cable_curl');
  assert.equal(forCanonical.length, 4, 'all four sets count toward the one exercise');
  assert.ok(calc.workingVolume(forCanonical) > 0);

  // PREVIOUS-SET SUGGESTIONS: the most recent performance is found by the
  // canonical id, across the merge boundary.
  const prev = calc.previousPerformance('ex_bayesian_cable_curl', projected);
  assert.ok(prev, 'previous performance resolves through the redirect');

  // THE PICKER and SEARCH: the merged custom is gone from both.
  const visible = id.visibleExercises(exercises);
  assert.ok(!visible.some((e) => e.id === mine.id), 'a merged exercise leaves the picker');
  assert.ok(!searchExercises(visible, 'Bayesian Cable Curls').some((e) => e.id === mine.id));
  // But its name still finds the canonical exercise, because it became an alias.
  const found = searchExercises(visible, 'Bayesian Cable Curls');
  assert.equal(found[0].id, 'ex_bayesian_cable_curl');
});

test('a merged exercise disappears from the picker and the library list', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });

  assert.ok(id.visibleExercises(await db.getAllExercises()).some((e) => e.id === mine.id));
  await rec.reconcileCustomExercises();

  const after = await db.getAllExercises();
  assert.ok(after.some((e) => e.id === mine.id), 'the record still exists');
  assert.ok(!id.visibleExercises(after).some((e) => e.id === mine.id), 'but it is not offered');
});

test('projection de-duplicates an exercise list that collapses onto one lift', () => {
  const index = new Map([['ex_mine', 'ex_lib']]);
  const w = {
    id: 'w', exercises: ['ex_mine', 'ex_lib'], skipped: ['ex_mine'],
    sets: [
      { id: 's1', exerciseId: 'ex_mine', weightKg: 20, reps: 10 },
      { id: 's2', exerciseId: 'ex_lib', weightKg: 25, reps: 10 }
    ]
  };
  const p = id.projectWorkout(w, index);
  assert.deepEqual(p.exercises, ['ex_lib'], 'one card, not two');
  assert.deepEqual(p.skipped, ['ex_lib']);
  assert.ok(p.sets.every((s) => s.exerciseId === 'ex_lib'));
});

test('un-projecting restores exactly what was on disk', () => {
  const index = new Map([['ex_mine', 'ex_lib']]);
  const original = {
    id: 'w', exercises: ['ex_mine'], skipped: [],
    sets: [{ id: 's1', exerciseId: 'ex_mine', weightKg: 20, reps: 10 }]
  };
  const projected = id.projectWorkout(original, index);
  assert.equal(projected.sets[0].exerciseId, 'ex_lib');

  const back = id.unprojectWorkout(projected);
  assert.deepEqual(back, original, 'a write cannot persist the projection');
  assert.ok(!('_mergeOrigin' in back));

  // A set added AFTER the merge keeps the canonical id, which is correct — it
  // was logged against the canonical exercise.
  const edited = {
    ...projected,
    sets: [...projected.sets, { id: 's2', exerciseId: 'ex_lib', weightKg: 25, reps: 8 }]
  };
  const backEdited = id.unprojectWorkout(edited);
  assert.equal(backEdited.sets[0].exerciseId, 'ex_mine');
  assert.equal(backEdited.sets[1].exerciseId, 'ex_lib');
});

test('a workout with nothing merged is passed through untouched', () => {
  const w = workoutFor('ex_bayesian_cable_curl');
  assert.equal(id.projectWorkout(w, new Map()), w, 'same object, no copy');
  assert.equal(id.unprojectWorkout(w), w);
});

test('merge chains collapse and cycles cannot hang the resolver', () => {
  const chained = id.buildMergeIndex([
    { id: 'a', mergedInto: 'b' },
    { id: 'b', mergedInto: 'c' },
    { id: 'c' }
  ]);
  assert.equal(id.resolveExerciseId(chained, 'a'), 'c', 'A → B → C resolves straight to C');

  const cyclic = id.buildMergeIndex([
    { id: 'x', mergedInto: 'y' },
    { id: 'y', mergedInto: 'x' }
  ]);
  // The only requirement is that it terminates and returns something real.
  assert.ok(['x', 'y'].includes(id.resolveExerciseId(cyclic, 'x')));
});

test('applyMerge refuses to create a chain', async () => {
  await freshDb({
    exercises: [
      { id: 'ex_a', name: 'A', builtin: false },
      { id: 'ex_b', name: 'B', builtin: false, mergedInto: 'ex_c' },
      { id: 'ex_c', name: 'C', builtin: true }
    ]
  });
  assert.equal(await rec.applyMerge('ex_a', 'ex_b'), null, 'cannot merge into something already merged away');
});

// ===========================================================================
// Reversibility
// ===========================================================================

test('a merge is reversible, and reversing it restores the exercise exactly', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({
    exercises: [...DEFAULT_EXERCISES, mine],
    workouts: [workoutFor(mine.id)]
  });
  await rec.reconcileCustomExercises();

  const restored = await rec.undoMerge(mine.id);
  assert.equal(restored.mergedInto, undefined);
  assert.equal(restored.mergedAt, undefined);
  assert.deepEqual({ ...restored }, { ...mine }, 'the record is byte-identical to before the merge');

  // The canonical exercise no longer claims the name.
  const canonical = (await db.getAllExercises()).find((e) => e.id === 'ex_bayesian_cable_curl');
  assert.ok(!(canonical.aliases || []).includes('Bayesian Cable Curls'));

  // And history is attributed to it again.
  const index = id.buildMergeIndex(await db.getAllExercises());
  assert.equal(index.size, 0);
  const projected = id.projectWorkouts(await db.getAllWorkouts(), index);
  assert.ok(projected[0].sets.every((s) => s.exerciseId === mine.id));
});

test('undo also records "keep separate", so the next launch does not re-merge', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });
  await rec.reconcileCustomExercises();

  await rec.undoMergeAndKeepSeparate(mine.id);
  // Without the keep-separate record, this Tier-1 pair would merge straight
  // back — undo would be a button that does nothing for more than a second.
  const again = await rec.reconcileCustomExercises();
  assert.equal(again.merged.length, 0);
  assert.equal((await db.getAllExercises()).find((e) => e.id === mine.id).mergedInto, undefined);
});

test('merges are listed as reversible for 30 days, and not after', async () => {
  const mine = custom('Bayesian Cable Curls');
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });
  const mergedAt = 1_700_000_000_000;
  await rec.reconcileCustomExercises({ now: mergedAt });

  const sameDay = await rec.listReversibleMerges({ now: mergedAt });
  assert.equal(sameDay.length, 1);
  assert.equal(sameDay[0].customName, 'Bayesian Cable Curls');
  assert.equal(sameDay[0].intoName, 'Bayesian Cable Curl');
  assert.equal(sameDay[0].daysLeft, rec.MERGE_UNDO_DAYS);

  const day29 = await rec.listReversibleMerges({ now: mergedAt + 29 * 86400000 });
  assert.equal(day29.length, 1);
  assert.equal(day29[0].daysLeft, 1);

  const day31 = await rec.listReversibleMerges({ now: mergedAt + 31 * 86400000 });
  assert.equal(day31.length, 0, 'past the window it stops being offered');

  // It stops being OFFERED, but nothing was destroyed: the record and the
  // redirect are both still there, so the data is still recoverable.
  const stored = (await db.getAllExercises()).find((e) => e.id === mine.id);
  assert.equal(stored.mergedInto, 'ex_bayesian_cable_curl');
  assert.equal(stored.name, 'Bayesian Cable Curls');
});

// ===========================================================================
// Metadata preservation
// ===========================================================================

test('a merge preserves useful metadata and loses no names', async () => {
  const mine = custom('Bayesian Cable Curls', {
    aliases: ['Bayesian Curls', 'Behind-the-Body Cable Curl'],
    weightIncrement: 1.25
  });
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });
  await rec.reconcileCustomExercises();

  const canonical = (await db.getAllExercises()).find((e) => e.id === 'ex_bayesian_cable_curl');
  // The dropped name AND every alias it carried move onto the survivor.
  assert.ok(canonical.aliases.includes('Bayesian Cable Curls'));
  assert.ok(canonical.aliases.includes('Bayesian Curls'));
  assert.ok(canonical.aliases.includes('Behind-the-Body Cable Curl'));
  // The user's own per-exercise preference carries across.
  assert.equal(canonical.weightIncrement, 1.25);
  // The library's own metadata is NOT overwritten by the custom's.
  assert.deepEqual(canonical.muscleGroups, LIB_BAYESIAN.muscleGroups);
  assert.equal(canonical.equipment, LIB_BAYESIAN.equipment);

  // And all of those names are searchable again.
  const visible = id.visibleExercises(await db.getAllExercises());
  for (const q of ['Bayesian Curls', 'behind the body cable curl', 'bayesian cable curls']) {
    assert.equal(searchExercises(visible, q)[0]?.id, 'ex_bayesian_cable_curl', `"${q}" should find it`);
  }
});

test('an alias never duplicates the canonical name', async () => {
  const mine = custom('Bayesian Cable Curl');   // normalizes identically
  await freshDb({ exercises: [...DEFAULT_EXERCISES, mine] });
  await rec.reconcileCustomExercises();
  const canonical = (await db.getAllExercises()).find((e) => e.id === 'ex_bayesian_cable_curl');
  assert.deepEqual(canonical.aliases, [], 'an exact repeat of the canonical name is not stored');
});

test('reconciliation leaves a user with no custom exercises completely alone', async () => {
  await freshDb({ exercises: DEFAULT_EXERCISES, workouts: [workoutFor('ex_squat')] });
  const before = await db.getAllExercises();
  const beforeTally = tally(await db.getAllWorkouts());

  await rec.reconcileOnLaunch();

  const after = await db.getAllExercises();
  assert.equal(after.length, before.length);
  assert.ok(after.every((e) => !e.mergedInto));
  assert.deepEqual(tally(await db.getAllWorkouts()), beforeTally);
});
