// MUSCLE GROUPS → ANATOMY.
//
// Driven against the REAL shipped library (src/data/defaultExercises.js) rather
// than fixtures, because the failure this file exists to catch is a muscle group
// that nothing on the figure can draw — a new exercise tagged with a group that
// has no regions renders a blank porthole, and nothing else in the app notices.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_EXERCISES, MUSCLE_GROUPS } = await import('../src/data/defaultExercises.js');
const { MUSCLE_ANATOMY, tiersFor, anatomyForExercise, regionsFor, sessionAnatomy } =
  await import('../src/services/anatomy.js');

const byId = new Map(DEFAULT_EXERCISES.map((e) => [e.id, e]));
const ex = (id) => byId.get(id);

// ---- The mapping covers the app's vocabulary -----------------------------

test('every muscle group the app offers can be drawn', () => {
  for (const g of MUSCLE_GROUPS) {
    const entry = MUSCLE_ANATOMY[g];
    assert.ok(entry, `${g} has no anatomy mapping`);
    assert.ok(
      entry.front.length + entry.back.length > 0,
      `${g} maps to no regions on either view`
    );
    assert.match(entry.box, /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/, `${g} has a malformed crop`);
  }
});

test('a group is framed on a view it actually appears on', () => {
  for (const g of MUSCLE_GROUPS) {
    const entry = MUSCLE_ANATOMY[g];
    assert.ok(
      entry[entry.view].length > 0,
      `${g} is framed on the ${entry.view} view but has no regions there`
    );
  }
});

test('every builtin exercise resolves to something drawable', () => {
  for (const e of DEFAULT_EXERCISES) {
    const a = anatomyForExercise(e);
    assert.ok(a.primary.length > 0, `${e.name} lights no primary region`);
    assert.ok(a.box, `${e.name} has no crop`);
  }
});

// ---- Tiers ----------------------------------------------------------------

test('a compound ranks its real movers, not just the first tag', () => {
  // The case the flat muscleGroups array gets wrong: a deadlift is not a back
  // exercise with two footnotes.
  const t = tiersFor(ex('ex_deadlift'));
  assert.deepEqual(t.primary, ['Back', 'Hamstrings']);
  assert.ok(t.secondary.includes('Glutes'));
});

test('a custom exercise falls back to "the first one you picked"', () => {
  const custom = { id: 'custom_1', name: 'My Lift', muscleGroups: ['Quads', 'Glutes', 'Core'] };
  assert.deepEqual(tiersFor(custom), { primary: ['Quads'], secondary: ['Glutes', 'Core'] });
});

test('a muscle is never primary and secondary at once', () => {
  for (const e of DEFAULT_EXERCISES) {
    const { primary, secondary } = tiersFor(e);
    for (const g of secondary) {
      assert.ok(!primary.includes(g), `${e.name} lists ${g} in both tiers`);
    }
  }
});

test('unknown muscle groups are dropped rather than drawn as nothing', () => {
  const t = tiersFor({ id: 'x', muscleGroups: ['Chest', 'Gills', 'Tail'] });
  assert.deepEqual(t, { primary: ['Chest'], secondary: [] });
});

// ---- Builtin rankings are read from the module, not the stored row --------

test('a builtin row seeded before this feature still ranks correctly', () => {
  // What is actually in IndexedDB on a device that launched a year ago: the
  // exercise as it shipped then, with no primary/secondary fields at all.
  const stored = { id: 'ex_bench_press', name: 'Bench Press', muscleGroups: ['Chest', 'Triceps', 'Shoulders'] };
  assert.deepEqual(tiersFor(stored).primary, ['Chest']);
  assert.ok(tiersFor(stored).secondary.includes('Triceps'));
});

test("a user's own retagging of a builtin wins over the library", () => {
  const retagged = { id: 'ex_bench_press', name: 'Bench Press', muscleGroups: ['Shoulders'] };
  assert.deepEqual(tiersFor(retagged), { primary: ['Shoulders'], secondary: [] });
});

test('reordering the tags is not retagging', () => {
  const reordered = { id: 'ex_bench_press', name: 'Bench Press', muscleGroups: ['Shoulders', 'Chest', 'Triceps'] };
  assert.deepEqual(tiersFor(reordered).primary, ['Chest']);
});

// ---- Views ----------------------------------------------------------------

test('a group contributes nothing to a view it does not appear on', () => {
  assert.deepEqual(regionsFor(['Quads'], 'back'), []);
  assert.deepEqual(regionsFor(['Lats'], 'front'), []);
  assert.ok(regionsFor(['Back'], 'back').includes('lats'));
});

test('Core spans both views', () => {
  assert.ok(regionsFor(['Core'], 'front').includes('abs'));
  assert.ok(regionsFor(['Core'], 'back').includes('lower_back'));
});

// ---- Sessions -------------------------------------------------------------

const set = (exerciseId, completed, type = 'working') => ({ exerciseId, completed, type });

test('nothing logged means nothing lit', () => {
  const a = sessionAnatomy(
    [set('ex_bench_press', false), set('ex_bench_press', false)],
    byId
  );
  assert.equal(a.done, 0);
  assert.equal(a.planned, 2);
  assert.equal(a.intensity, 0);
  assert.deepEqual(a.front.primary, []);
  assert.deepEqual(a.groups, []);
});

test('warm-ups are not training', () => {
  const a = sessionAnatomy(
    [set('ex_bench_press', true, 'warmup'), set('ex_bench_press', true)],
    byId
  );
  assert.equal(a.planned, 1);
  assert.equal(a.done, 1);
  assert.equal(a.groups.find((g) => g.group === 'Chest').sets, 1);
});

test('assistance is counted apart from direct work', () => {
  // Three bench sets: three DIRECT chest sets, three sets of assisted triceps.
  // Counting them as one number is how a push day claims ten triceps sets.
  const a = sessionAnatomy([set('ex_bench_press', true), set('ex_bench_press', true), set('ex_bench_press', true)], byId);
  const chest = a.groups.find((g) => g.group === 'Chest');
  const triceps = a.groups.find((g) => g.group === 'Triceps');
  assert.deepEqual([chest.sets, chest.assisted], [3, 0]);
  assert.deepEqual([triceps.sets, triceps.assisted], [0, 3]);
});

test('primary anywhere beats secondary elsewhere', () => {
  // Triceps assist the bench and are the point of the pushdown. They should not
  // be demoted to the dim tier because one lift only brushed them.
  const a = sessionAnatomy([set('ex_bench_press', true), set('ex_tricep_pushdown', true)], byId);
  assert.ok(a.back.primary.includes('triceps'));
  assert.ok(!a.back.secondary.includes('triceps'));
});

test('intensity is progress through the session, and never NaN', () => {
  assert.equal(sessionAnatomy([], byId).intensity, 0);
  const half = sessionAnatomy([set('ex_squat', true), set('ex_squat', false)], byId);
  assert.equal(half.intensity, 0.5);
});

test('a session of deleted exercises does not throw', () => {
  const a = sessionAnatomy([set('ex_gone_forever', true)], byId);
  assert.equal(a.done, 1);
  assert.deepEqual(a.groups, []);
});

test('bars are ordered by direct work', () => {
  const a = sessionAnatomy(
    [set('ex_tricep_pushdown', true), set('ex_tricep_pushdown', true), set('ex_bench_press', true)],
    byId
  );
  assert.equal(a.groups[0].group, 'Triceps');
  assert.equal(a.groups[0].sets, 2);
});

// ---- The set ring ---------------------------------------------------------
//
// Geometry the design mock never had to solve, because its example was always
// exactly three sets.

const { ringSegments, MAX_SEGMENTS } = await import('../src/ui/setRing.js');

const sweepOf = (d) => Number(d.match(/A\d+(?:\.\d+)? \d+(?:\.\d+)? 0 (\d)/)[1]);

test('no sets means no ring at all', () => {
  assert.deepEqual(ringSegments(0, 0), []);
});

test('a one-set exercise draws a full ring, not a stub', () => {
  // The design helper hardcodes the SVG large-arc flag to 0, which silently
  // turns a 350° segment into a 10° tick. A plank or a single AMRAP set is a
  // real card, so the flag has to be computed.
  const [seg] = ringSegments(1, 0);
  assert.equal(ringSegments(1, 0).length, 1);
  assert.equal(sweepOf(seg.d), 1, 'a 350° segment must set the large-arc flag');
});

test('a two-set ring stays on the short arc', () => {
  for (const seg of ringSegments(2, 0)) assert.equal(sweepOf(seg.d), 0);
});

test('segments fill in order and stop at the number done', () => {
  const segs = ringSegments(5, 2);
  assert.deepEqual(segs.map((s) => s.done), [true, true, false, false, false]);
});

test('more sets logged than planned cannot overfill the ring', () => {
  assert.equal(ringSegments(3, 99).filter((s) => s.done).length, 3);
  assert.equal(ringSegments(3, -5).filter((s) => s.done).length, 0);
});

test('past the cap the ring becomes one continuous arc', () => {
  // Twenty dashes is a texture, not a number.
  const segs = ringSegments(MAX_SEGMENTS + 1, 7);
  assert.equal(segs.length, 2, 'a track and a progress arc');
  assert.equal(segs.filter((s) => s.done).length, 1);
});

test('a capped ring with nothing done draws only the track', () => {
  const segs = ringSegments(20, 0);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].done, false);
});

test('at the cap it is still counting individual sets', () => {
  assert.equal(ringSegments(MAX_SEGMENTS, 4).length, MAX_SEGMENTS);
});
