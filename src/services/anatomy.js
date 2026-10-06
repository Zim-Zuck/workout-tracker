import { isWorking } from './calculations.js';
import { DEFAULT_EXERCISES } from '../data/defaultExercises.js';

// MUSCLE GROUPS → ANATOMY.
//
// The app stores muscles as the 12 names in MUSCLE_GROUPS. The figure draws 15
// anatomical regions across two views. This file is the only translation between
// them, so neither side has to know about the other: defaultExercises.js never
// mentions `rhomboids`, and BodyMap never mentions `Back`.
//
// THE CROP IS WHAT MAKES A PORTHOLE WORK. A porthole is not a small body — it is
// a magnified window onto one region, so every group needs a viewBox framing it.
// Two of these came from the design handoff (`24 24 52 52` upper back,
// `6 44 40 40` arm); the other ten I authored to match their logic, which is
// that a crop includes the joint above the muscle for orientation — an arm crop
// that is only an arm could be anybody's arm. They are pending design review.
//
// `view` is the side a group reads best from, and it is a judgement, not a fact:
// Traps and Calves exist on both views and are framed from behind because that
// is where their shape is. Core is the one genuinely split group — abs and
// obliques at the front, lower back behind — and defaults to front.
export const MUSCLE_ANATOMY = {
  Chest:      { front: ['chest'],          back: [],              view: 'front', box: '24 21 52 52' },
  Back:       { front: [],                 back: ['lats', 'rhomboids'], view: 'back', box: '24 24 52 52' },
  Shoulders:  { front: ['delts'],          back: ['delts'],       view: 'front', box: '18 16 64 64' },
  Biceps:     { front: ['biceps'],         back: [],              view: 'front', box: '6 44 40 40' },
  Triceps:    { front: [],                 back: ['triceps'],     view: 'back',  box: '6 50 40 40' },
  Quads:      { front: ['quads'],          back: [],              view: 'front', box: '20 95 60 60' },
  Hamstrings: { front: [],                 back: ['hamstrings'],  view: 'back',  box: '20 100 60 60' },
  Glutes:     { front: [],                 back: ['glutes'],      view: 'back',  box: '24 82 52 52' },
  Calves:     { front: ['calves'],         back: ['calves'],      view: 'back',  box: '26 142 48 48' },
  Core:       { front: ['abs', 'obliques'], back: ['lower_back'], view: 'front', box: '24 51 52 52' },
  Traps:      { front: ['traps'],          back: ['traps'],       view: 'back',  box: '26 10 48 48' },
  Forearms:   { front: ['forearms'],       back: ['forearms'],    view: 'front', box: '4 72 40 40' }
};

// A whole-body view, for the session pair and the finish plate.
export const FULL_BOX = '8 0 84 200';

// The library's own ranking, keyed by id, read from the module rather than from
// the database. See tiersFor() for why that distinction matters.
const BUILTIN_TIERS = new Map(
  DEFAULT_EXERCISES
    .filter((e) => Array.isArray(e.primary) && e.primary.length > 0)
    .map((e) => [e.id, { primary: e.primary, secondary: e.secondary || [], groups: e.muscleGroups || [] }])
);

// WHICH MUSCLES AN EXERCISE WORKS HARDEST.
//
// Built-in exercises carry explicit `primary` and `secondary` rankings, because
// the ordering of `muscleGroups` alone gets compounds wrong — a deadlift listed
// as Back/Hamstrings/Glutes is not a back exercise with two footnotes.
//
// THOSE RANKINGS ARE READ FROM THE MODULE, NOT FROM THE EXERCISE ROW, AND
// NOTHING IS MIGRATED. The library is seeded into IndexedDB once on first launch
// and ensureInitialized() then only tops up ids that are missing — it leaves
// existing rows alone on purpose, because a user may have edited a builtin and
// an app update must not overwrite that. Which means a device that launched
// before this change has rows with no `primary` field and will never be sent
// one. Backfilling them would mean a write pass over every exercise in the only
// copy of the user's data, to populate a field used for nothing but drawing a
// picture. So this reads the ranking from the shipped module at render time
// instead: no migration, no write, and correct on an install from 2024 on its
// first frame. (weeklyRecap.js already treats the module as the authority for
// builtins in exactly this way.)
//
// A USER'S OWN RETAGGING STILL WINS. If the stored row's muscleGroups no longer
// match what the library ships, the user has changed what this exercise is for,
// and the library's ranking is about a different exercise. Their list is used
// instead, through the same fallback custom exercises get.
//
// Custom exercises have no ranking and never will: the create sheet asks which
// muscles, not which matter most, and it is not going to start asking. They fall
// back to "the first one you picked is the one you meant" — the honest reading of
// that input, and what the picker's own ordering already implies.
export function tiersFor(exercise) {
  const groups = Array.isArray(exercise?.muscleGroups) ? exercise.muscleGroups.filter(known) : [];

  // A row that carries its own ranking (a future seed, a restored backup taken
  // after this change) is believed over the module.
  const own = Array.isArray(exercise?.primary) ? exercise.primary.filter(known) : [];
  if (own.length > 0) return tiers(own, exercise.secondary);

  const builtin = BUILTIN_TIERS.get(exercise?.id);
  if (builtin && sameGroups(builtin.groups, exercise?.muscleGroups)) {
    return tiers(builtin.primary.filter(known), builtin.secondary);
  }

  if (groups.length === 0) return { primary: [], secondary: [] };
  return { primary: [groups[0]], secondary: unique(groups.slice(1)) };
}

function tiers(primaryList, secondaryList) {
  const primary = unique(primaryList);
  const secondary = unique(Array.isArray(secondaryList) ? secondaryList.filter(known) : [])
    .filter((g) => !primary.includes(g));
  return { primary, secondary };
}

// Set equality, because order is not meaning here — a user who reorders the tags
// without adding or removing one has not retagged anything.
function sameGroups(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  if (x.length !== y.length) return false;
  const set = new Set(x);
  return y.every((g) => set.has(g));
}

// The porthole for one exercise: which view, which crop, which regions at which
// tier. The view and crop follow the PRIMARY group — a bench press is framed on
// the chest even though it also lights triceps and delts.
export function anatomyForExercise(exercise) {
  const { primary, secondary } = tiersFor(exercise);
  const lead = MUSCLE_ANATOMY[primary[0]] || MUSCLE_ANATOMY[secondary[0]];
  const view = lead?.view || 'front';

  return {
    view,
    box: lead?.box || FULL_BOX,
    primary: regionsFor(primary, view),
    secondary: regionsFor(secondary, view)
  };
}

// Region ids for a set of groups, on one view. A group contributes nothing to a
// view it does not appear on — Quads on the back view is correctly empty, which
// is why the back figure of a leg-extension session stays dark.
export function regionsFor(groups, view) {
  const out = [];
  for (const g of groups || []) {
    for (const id of MUSCLE_ANATOMY[g]?.[view] || []) {
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

// WHAT A WHOLE SESSION LIT UP.
//
// Both figures, both tiers, plus sets per muscle group for the finish plate's
// bars. Counts only completed working sets: a warm-up is not a thing you trained
// and an unchecked set is not a thing you did. That makes this honest to use
// mid-session — the figure fills in as you log, which is the whole idea — and it
// is why an untouched session renders the designed "nothing trained yet" state
// rather than a body pre-lit with your intentions.
//
// A group counts once per completed set of any exercise that works it, at
// whichever tier that exercise assigns. Primary anywhere wins: a muscle that was
// the main event of one lift does not get demoted because a later lift only
// brushed it.
export function sessionAnatomy(sets, exerciseById) {
  const lookup = typeof exerciseById === 'function'
    ? exerciseById
    : (id) => exerciseById?.get?.(id) ?? exerciseById?.[id];

  const primaryGroups = new Set();
  const secondaryGroups = new Set();
  const tally = new Map();   // group -> { direct, assisted }
  let done = 0;
  let planned = 0;

  const add = (group, key) => {
    const row = tally.get(group) || { direct: 0, assisted: 0 };
    row[key] += 1;
    tally.set(group, row);
  };

  for (const s of sets || []) {
    if (!s || s.type === 'warmup') continue;
    planned += 1;
    if (!isWorking(s)) continue;
    done += 1;

    const ex = lookup(s.exerciseId);
    if (!ex) continue;
    const { primary, secondary } = tiersFor(ex);
    for (const g of primary) { primaryGroups.add(g); add(g, 'direct'); }
    for (const g of secondary) { secondaryGroups.add(g); add(g, 'assisted'); }
  }

  const prim = [...primaryGroups];
  const sec = [...secondaryGroups].filter((g) => !primaryGroups.has(g));
  const maxDirect = Math.max(1, ...[...tally.values()].map((r) => r.direct));

  return {
    done,
    planned,
    // Used as BodyMap's `intensity`, which moves opacity inside a tier. A
    // session with nothing planned is 0, not NaN.
    intensity: planned > 0 ? done / planned : 0,
    front: { primary: regionsFor(prim, 'front'), secondary: regionsFor(sec, 'front') },
    back: { primary: regionsFor(prim, 'back'), secondary: regionsFor(sec, 'back') },
    // DIRECT AND ASSISTED ARE COUNTED SEPARATELY, AND ONLY DIRECT IS A NUMBER.
    //
    // Counting both as one figure is how a push session ends up claiming ten
    // triceps sets when three of them were triceps work and seven were a bench
    // press and an overhead press. "Sets" in every other part of this app, and
    // in every programme a user has ever followed, means sets of that thing.
    // So `sets` is direct work, assistance is kept beside it for anyone who
    // wants it, and the bars render the number that means what it says.
    //
    // Labels are the app's own muscle groups, not the figure's 15 regions. The
    // mock labels one bar "Rear delts", which the data cannot support — an
    // exercise tagged Shoulders does not record which head — and putting that
    // distinction on screen would be inventing it.
    groups: [...tally.entries()]
      .map(([group, row]) => ({
        group,
        sets: row.direct,
        assisted: row.assisted,
        fraction: row.direct / maxDirect,
        tier: primaryGroups.has(group) ? 'primary' : 'secondary'
      }))
      .sort((a, b) => b.sets - a.sets || b.assisted - a.assisted || a.group.localeCompare(b.group))
  };
}

// Named muscle groups only. A typo'd or retired group name is dropped rather
// than drawn as nothing in particular.
function known(group) {
  return typeof group === 'string' && Object.hasOwn(MUSCLE_ANATOMY, group);
}

function unique(list) {
  return [...new Set(list)];
}
