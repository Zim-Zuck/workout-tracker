// EXERCISE IDENTITY: when are two exercise names the same lift?
//
// This is the one place in the app that answers that question, and three
// features depend on it agreeing with itself:
//
//   SEARCH         typing "cable-curls" must find "Cable Curl"
//   RECONCILIATION a custom "Bayesian Cable Curl" must recognise the library's
//                  "Bayesian Cable Curls" as the same thing
//   PREVENTION     creating "DB Shoulder Press" must offer "Dumbbell Shoulder
//                  Press" before a duplicate exists at all
//
// Everything here is PURE and DETERMINISTIC. No dates, no randomness, no I/O.
// The same two exercises always produce the same similarity score, which is
// what makes a merge decision reviewable and a threshold testable.

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// Lifting shorthand, expanded so "DB" and "Dumbbell" compare equal. Deliberately
// short: an abbreviation table is a list of things that can go wrong, and every
// entry has to be unambiguous in a gym. "ez" expands to two tokens ("ez bar")
// because that is how the full name reads.
const ABBREVIATIONS = {
  db: 'dumbbell',
  bb: 'barbell',
  ez: 'ez bar',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  bw: 'bodyweight',
  ext: 'extension'
};

// Words that carry no identifying information in an exercise name. Kept tiny on
// purpose: dropping "close" from "Close-Grip Bench" would be a disaster, and
// the only safe members of this list are words that never distinguish one lift
// from another.
// 's' is in here because stripping the apostrophe out of "Farmer's Carry"
// leaves it behind as a token of its own.
const FILLER = new Set(['the', 'with', 'a', 'an', 'and', 'of', 's']);

// Words whose trailing "s" is part of the word, not a plural. Without this
// list, "press" becomes "pres", "triceps" and "biceps" lose their s
// inconsistently, and "lats" stops matching itself.
const NEVER_SINGULAR = new Set([
  'press', 'cross', 'abs', 'lats', 'delts', 'glutes', 'triceps', 'biceps',
  'quads', 'calves', 'hamstrings', 'traps', 'forearms', 'ropes', 'dips',
  'plus', 'bus', 'gas'
]);

// Strip a plural from ONE word.
//
// This is not English morphology, and it does not need to be. Both sides of
// every comparison go through the same function, so what matters is that it is
// consistent: "curls" and "curl" must land on the same string, whatever that
// string is.
export function singularize(word) {
  if (NEVER_SINGULAR.has(word)) return word;
  if (word.length <= 3) return word;              // 'abs', 'legs' stay as typed
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;   // flies → fly
  if (/(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2); // crunches → crunch
  if (word.endsWith('ss')) return word;           // press, cross
  if (word.endsWith('s') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);                     // curls → curl
  }
  return word;
}

// THE normalizer. Lowercase, punctuation-free, abbreviation-expanded,
// filler-free, singular, single-spaced.
//
//   normalizeName('Cable-Curl')             → 'cable curl'
//   normalizeName('Bayesian Cable Curls')   → 'bayesian cable curl'
//   normalizeName('Incline DB Press')       → 'incline dumbbell press'
//   normalizeName("Farmer's Carry")         → 'farmer carry'
export function normalizeName(raw) {
  if (raw == null) return '';
  return String(raw)
    .toLowerCase()
    // Everything that is not a letter or a digit becomes a space. Hyphens,
    // apostrophes, parentheses and periods all mean "word boundary" in an
    // exercise name, and treating them as one rule is why "pec deck (machine
    // fly)" and "Pec Deck - Machine Fly" normalize alike. Unicode-aware so
    // accented names are not shredded.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Expansion first: an abbreviation may expand into filler-free multi-word
    // text that then needs its own singularizing pass.
    .flatMap((w) => (ABBREVIATIONS[w] ? ABBREVIATIONS[w].split(' ') : [w]))
    .filter((w) => !FILLER.has(w))
    .map(singularize)
    .join(' ');
}

// The normalized name plus every normalized alias, as one list. This is what
// identity comparisons and search both match against, so an alias is a
// first-class name rather than a second-rate one.
export function identityNames(exercise) {
  if (!exercise) return [];
  const names = [exercise.name, ...(exercise.aliases || [])];
  const out = [];
  for (const n of names) {
    const norm = normalizeName(n);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out;
}

export function tokens(normalized) {
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

// Classic Levenshtein, two rows rather than a full matrix. Exercise names are
// short; this is called at most (customs × library) times, once per launch.
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

// Jaccard over token SETS. Order-insensitive by construction, which is the
// point: "Cable Bayesian Curl" and "Bayesian Cable Curl" score 1.0 here even
// though their edit distance is large.
export function tokenSetOverlap(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

// THE WEIGHTS, AND WHY THEY ARE THESE WEIGHTS.
//
// Token overlap dominates because a MISSING WORD is the signal that matters
// most. "Cable Curl" and "Bayesian Cable Curl" share two of three tokens and
// are genuinely different lifts; "Cable Bayesian Curl" and "Bayesian Cable
// Curl" share all three and are the same lift typed in a different order.
// Letting edit distance lead would invert that — the reordering looks far more
// different character-by-character than the missing qualifier does.
//
// Edit distance is kept as a small term so that near-misses the tokenizer
// cannot see ("bayesien" for "bayesian") still score above unrelated names.
//
// Equipment and muscle group are small, equal bonuses. They are corroboration,
// never evidence on their own: every cable exercise in the library would
// otherwise start life 10% similar to every other.
export const WEIGHTS = { tokens: 0.65, edit: 0.15, equipment: 0.10, muscle: 0.10 };

function muscleOverlap(a, b) {
  const sa = new Set((a || []).map((m) => String(m).toLowerCase()));
  const sb = new Set((b || []).map((m) => String(m).toLowerCase()));
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const m of sa) if (sb.has(m)) shared += 1;
  return shared / Math.max(sa.size, sb.size);
}

// How alike two exercises are, in [0, 1].
//
// Compares every (name, alias) pairing and keeps the best, so an exercise whose
// ALIAS matches scores as highly as one whose primary name does.
export function similarity(a, b) {
  if (!a || !b) return 0;
  const aNames = identityNames(a);
  const bNames = identityNames(b);
  if (!aNames.length || !bNames.length) return 0;

  const equipmentBonus =
    a.equipment && b.equipment && String(a.equipment).toLowerCase() === String(b.equipment).toLowerCase()
      ? WEIGHTS.equipment
      : 0;
  const muscleBonus = WEIGHTS.muscle * muscleOverlap(a.muscleGroups, b.muscleGroups);

  let best = 0;
  for (const an of aNames) {
    for (const bn of bNames) {
      const overlap = tokenSetOverlap(tokens(an), tokens(bn));
      const maxLen = Math.max(an.length, bn.length) || 1;
      const edit = 1 - Math.min(1, editDistance(an, bn) / maxLen);
      const score = WEIGHTS.tokens * overlap + WEIGHTS.edit * edit + equipmentBonus + muscleBonus;
      if (score > best) best = score;
    }
  }
  return Math.min(1, Math.round(best * 1e6) / 1e6);
}

// ---------------------------------------------------------------------------
// The three tiers
// ---------------------------------------------------------------------------

// THE THRESHOLD, AND HOW IT WAS CHOSEN.
//
// It has to sit above the worst case of "same lift, words reordered" and below
// the best case of "one name is the other plus a qualifier". Against this
// library those two cases are:
//
//   Cable Bayesian Curl  vs  Bayesian Cable Curl   0.905   same lift
//   Cable Curl           vs  Bayesian Cable Curl   0.720   DIFFERENT lifts
//
// 0.82 sits between them with room on both sides. Exercises below it are left
// completely alone; exercises above it are only ever SUGGESTED, never merged
// without being asked — the automatic tier is normalized-name equality, which
// needs no threshold at all.
export const SIMILAR_THRESHOLD = 0.82;

// A lower bar, used only to ASK "did you mean?" while somebody is typing a new
// exercise name. Being offered the library's Cable Curl while creating
// "Bayesian Cable Curl" is useful; being offered nothing is how the duplicate
// gets created in the first place. There is always a "keep creating" option, so
// the cost of a wrong guess here is one extra tap.
export const DID_YOU_MEAN_THRESHOLD = 0.72;

export const TIER = { IDENTICAL: 'identical', SIMILAR: 'similar', UNRELATED: 'unrelated' };

// Which tier a (custom, library) pairing falls into.
//
//   IDENTICAL  normalized names (or aliases) match exactly → safe to merge
//              without asking. "Bayesian Cable Curl" / "Bayesian Cable Curls".
//   SIMILAR    above the threshold → suggest the merge, never perform it.
//              "Cable Bayesian Curl" / "Bayesian Cable Curl".
//   UNRELATED  below it → leave the exercise completely alone.
export function classifyPair(a, b) {
  if (!a || !b || a.id === b.id) return { tier: TIER.UNRELATED, score: 0 };
  const aNames = identityNames(a);
  const bNames = identityNames(b);
  if (aNames.some((n) => bNames.includes(n))) {
    return { tier: TIER.IDENTICAL, score: 1 };
  }
  const score = similarity(a, b);
  return { tier: score >= SIMILAR_THRESHOLD ? TIER.SIMILAR : TIER.UNRELATED, score };
}

// The best candidate for one exercise out of a list, with its tier. Ties are
// broken by id so the result does not depend on array order.
export function bestMatch(exercise, candidates) {
  let best = null;
  for (const c of candidates) {
    const res = classifyPair(exercise, c);
    if (res.tier === TIER.UNRELATED) continue;
    if (!best
      || res.score > best.score
      || (res.score === best.score && c.id < best.exercise.id)) {
      best = { exercise: c, ...res };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Resolving a merged exercise's id
// ---------------------------------------------------------------------------

// Map of every merged-away id → the id it resolves to, with chains collapsed
// (A merged into B, B later merged into C, so A resolves straight to C) and
// cycles broken rather than hung on.
export function buildMergeIndex(exercises) {
  const direct = new Map();
  for (const ex of exercises || []) {
    if (ex?.mergedInto && ex.mergedInto !== ex.id) direct.set(ex.id, ex.mergedInto);
  }
  const resolved = new Map();
  for (const start of direct.keys()) {
    const seen = new Set([start]);
    let at = direct.get(start);
    while (direct.has(at) && !seen.has(at)) {
      seen.add(at);
      at = direct.get(at);
    }
    // A cycle (which should be impossible — applyMerge refuses to create one)
    // resolves to itself rather than looping forever.
    resolved.set(start, seen.has(at) && at !== start ? at : at);
  }
  return resolved;
}

export function resolveExerciseId(index, id) {
  if (!index || !id) return id;
  return index.get(id) || id;
}

// The exercises the picker, the library list and search are allowed to show: a
// merged custom exercise behaves AS the library exercise everywhere, which means
// it must not also appear as itself.
export function visibleExercises(exercises) {
  return (exercises || []).filter((e) => !e.mergedInto);
}

// ---------------------------------------------------------------------------
// Projecting history through the redirects
// ---------------------------------------------------------------------------
//
// HISTORICAL DATA IS NEVER REWRITTEN ON DISK. A merged custom exercise keeps
// its record and its id, and every set ever logged against it keeps pointing at
// it. What changes is what the APP sees: workouts are projected through the
// merge index as they are read, so PRs, charts, previous-set suggestions,
// templates, statistics and search all resolve to the canonical exercise
// without a single one of them knowing merges exist.
//
// `_mergeOrigin` records what was rewritten, so unprojectWorkout() can put the
// original ids back before anything is written to disk. It is the only reason a
// merge is reversible: the truth is still in the record.

export function projectWorkout(workout, index) {
  if (!workout || !index || !index.size) return workout;
  let changed = false;
  const origin = { exercises: workout.exercises || [], sets: {} };

  const exercisesOut = (workout.exercises || []).map((id) => {
    const to = resolveExerciseId(index, id);
    if (to !== id) changed = true;
    return to;
  });

  const setsOut = (workout.sets || []).map((s) => {
    const to = resolveExerciseId(index, s.exerciseId);
    if (to === s.exerciseId) return s;
    changed = true;
    origin.sets[s.id] = s.exerciseId;
    return { ...s, exerciseId: to };
  });

  if (!changed) return workout;

  // De-duplicate the exercise list: two separate entries that now resolve to
  // the same lift must become one, or the session renders the same card twice.
  const seen = new Set();
  const deduped = [];
  for (const id of exercisesOut) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }

  return {
    ...workout,
    exercises: deduped,
    sets: setsOut,
    skipped: [...new Set((workout.skipped || []).map((id) => resolveExerciseId(index, id)))],
    _mergeOrigin: origin
  };
}

export function projectWorkouts(workouts, index) {
  if (!index || !index.size) return workouts || [];
  return (workouts || []).map((w) => projectWorkout(w, index));
}

// Put the original ids back, so a write never persists the projection.
// Sets added AFTER a merge have no origin entry and keep their canonical id,
// which is correct — they were logged against the canonical exercise.
export function unprojectWorkout(workout) {
  if (!workout || !workout._mergeOrigin) return workout;
  const { exercises, sets } = workout._mergeOrigin;
  const out = {
    ...workout,
    exercises,
    sets: (workout.sets || []).map((s) => (
      sets[s.id] ? { ...s, exerciseId: sets[s.id] } : s
    ))
  };
  delete out._mergeOrigin;
  return out;
}
