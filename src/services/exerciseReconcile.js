// RECONCILING THE EXERCISE LIBRARY WITH THE EXERCISES PEOPLE MADE THEMSELVES.
//
// The problem this exists for: the library gained ~40 exercises, and some users
// had already created custom exercises for lifts that are now built in. One
// person's history is split across "Bayesian Cable Curl" (theirs) and
// "Bayesian Cable Curls" (ours) — same lift, two PR charts, two progression
// targets, two rows in the picker.
//
// THREE RULES THIS MODULE IS BUILT AROUND.
//
//   1. NOTHING IS DELETED. A merge sets `mergedInto` on the custom exercise and
//      leaves the record, its name and its id exactly where they were. Every
//      set ever logged against it still points at it. That is what makes a
//      merge reversible, and it is why no history is ever rewritten.
//
//   2. IT WORKS OFFLINE. Everything here is IndexedDB. There is no server
//      involved in deciding what is a duplicate, and reconciliation completes
//      in aeroplane mode exactly as it does on wifi.
//
//   3. ONLY CERTAINTY IS AUTOMATIC. Identical normalized names merge without
//      asking. Anything merely similar becomes a suggestion the user answers,
//      and a "keep separate" answer is remembered forever so the same question
//      is never asked twice.
import {
  getAllExercises, getAllWorkouts, saveExercise, getMeta, setMeta
} from '../db/database.js';
import { LIBRARY_VERSION } from '../data/defaultExercises.js';
import {
  normalizeName, identityNames, classifyPair, similarity, bestMatch,
  TIER, SIMILAR_THRESHOLD
} from './exerciseIdentity.js';

export { LIBRARY_VERSION, SIMILAR_THRESHOLD };

// ---- Where the reconciliation state lives (all in the `meta` store) -------

// The library version this device has already reconciled against.
export const LAST_RECONCILED_KEY = 'lastReconciledVersion';
// The library version this device has already de-duplicated at.
export const LIBRARY_DEDUPED_KEY = 'libraryDedupedVersion';
// Outstanding Tier-2 suggestions: [{ customId, libraryId, score, createdAt }]
export const SUGGESTIONS_KEY = 'mergeSuggestions';
// Pairs the user said to leave alone: ['customId|libraryId', ...]
export const KEEP_SEPARATE_KEY = 'keepSeparatePairs';

// HOW LONG A MERGE CAN BE TAKEN BACK.
//
// 30 days, matching the automatic pre-upgrade snapshot in database.js — the
// same reasoning applies: long enough for somebody who trains twice a month to
// notice their chart looks wrong, and to still have the undo available when
// they go looking for it. After that the merge is permanent in the sense that
// the UI stops offering to reverse it; the `mergedInto` field and the original
// record are still there, so nothing is actually unrecoverable.
export const MERGE_UNDO_DAYS = 30;
const DAY_MS = 86400000;

function pairKey(customId, libraryId) {
  return `${customId}|${libraryId}`;
}

export async function getKeepSeparate() {
  return new Set((await getMeta(KEEP_SEPARATE_KEY)) || []);
}

export async function getSuggestions() {
  return (await getMeta(SUGGESTIONS_KEY)) || [];
}

// ---------------------------------------------------------------------------
// TASK 3A — library deduplication
// ---------------------------------------------------------------------------

// How many logged sets reference each exercise id. Used to pick the canonical
// record: the id the user's history already leans on is the one to keep, because
// keeping it means fewer redirects to follow.
export function referenceCounts(workouts) {
  const counts = new Map();
  for (const w of workouts || []) {
    for (const s of w.sets || []) {
      counts.set(s.exerciseId, (counts.get(s.exerciseId) || 0) + 1);
    }
    for (const id of w.exercises || []) {
      if (!counts.has(id)) counts.set(id, 0);
    }
  }
  return counts;
}

// WHICH OF TWO DUPLICATES SURVIVES.
//
// Deterministic, and in this order:
//   1. a built-in beats a custom — the library record is the shared identity,
//      and it is the one a future app update will keep touching;
//   2. more logged sets beats fewer — follow the history, not the calendar;
//   3. richer metadata beats thinner;
//   4. lower id, alphabetically, so the answer never depends on array order.
export function chooseCanonical(a, b, counts = new Map()) {
  const score = (e) => [
    e.builtin ? 1 : 0,
    counts.get(e.id) || 0,
    (e.muscleGroups || []).length + (e.equipment ? 1 : 0) + (e.defaultReps ? 1 : 0)
  ];
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i] ? a : b;
  }
  return a.id <= b.id ? a : b;
}

// PROPOSE, DON'T PERFORM.
//
// Returns the merge list for review — `[{ fromId, fromName, intoId, intoName,
// reason, score }]` — and performs nothing. dedupeLibrary() below runs this,
// validates the result, and only then applies it. A data fix that cannot be
// printed before it runs is a data fix nobody can check.
//
// Only IDENTICAL normalized names are proposed here. Near-duplicates inside the
// library are deliberately left alone: "Standing Calf Raise" and "Seated Calf
// Raise" score 0.63 and are different lifts, and an automatic merge of
// shipped-library entries is not something a user can be asked about.
export function proposeLibraryMerges(exercises, workouts = []) {
  const counts = referenceCounts(workouts);
  const byName = new Map();   // normalized name -> surviving exercise
  const proposals = [];

  // Stable iteration order, so the proposal list is reproducible.
  const sorted = [...exercises].sort((a, b) => a.id.localeCompare(b.id));

  for (const ex of sorted) {
    if (ex.mergedInto) continue;              // already merged away
    const names = identityNames(ex);
    const hit = names.map((n) => byName.get(n)).find(Boolean);
    if (!hit) {
      for (const n of names) if (!byName.has(n)) byName.set(n, ex);
      continue;
    }
    const keep = chooseCanonical(hit, ex, counts);
    const drop = keep === hit ? ex : hit;
    proposals.push({
      fromId: drop.id,
      fromName: drop.name,
      intoId: keep.id,
      intoName: keep.name,
      reason: 'identical-name',
      score: 1
    });
    // Whichever survived now owns every one of those names.
    for (const n of identityNames(keep)) byName.set(n, keep);
    for (const n of identityNames(drop)) byName.set(n, keep);
  }

  return proposals;
}

// REVIEWING THE PROPOSALS PROGRAMMATICALLY, BEFORE ANYTHING IS WRITTEN.
//
// Every one of these checks is a way a merge list could destroy data if it were
// applied blind. They are cheap, and they run every time.
export function validateMergeProposals(proposals, exercises) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const errors = [];
  const targets = new Map();   // fromId -> intoId

  for (const p of proposals) {
    if (!byId.has(p.fromId)) errors.push(`merge source ${p.fromId} does not exist`);
    if (!byId.has(p.intoId)) errors.push(`merge target ${p.intoId} does not exist`);
    if (p.fromId === p.intoId) errors.push(`${p.fromId} would be merged into itself`);
    if (targets.has(p.fromId)) errors.push(`${p.fromId} is merged twice, into ${targets.get(p.fromId)} and ${p.intoId}`);
    targets.set(p.fromId, p.intoId);
  }

  // No target may itself be a source: that is a chain the user did not ask for,
  // and it is one step from a cycle.
  for (const [from, into] of targets) {
    if (targets.has(into)) {
      errors.push(`${from} → ${into} → ${targets.get(into)}: a merge target must not also be merged away`);
    }
  }

  // No cycles, even indirect ones.
  for (const start of targets.keys()) {
    const seen = new Set([start]);
    let at = targets.get(start);
    while (at && targets.has(at)) {
      if (seen.has(at)) { errors.push(`merge cycle involving ${start}`); break; }
      seen.add(at);
      at = targets.get(at);
    }
  }

  // The identity being dropped must be preserved on the survivor, or searching
  // for the old name after the merge finds nothing.
  for (const p of proposals) {
    const from = byId.get(p.fromId);
    const into = byId.get(p.intoId);
    if (!from || !into) continue;
    const preserved = new Set([
      ...identityNames(into),
      ...(into.aliases || []).map(normalizeName),
      normalizeName(from.name),
      ...(from.aliases || []).map(normalizeName)
    ]);
    if (!preserved.has(normalizeName(from.name))) {
      errors.push(`${p.fromName} would lose its name — it must survive as an alias of ${p.intoName}`);
    }
  }

  // A built-in must never be merged away into a custom exercise: the next app
  // update would re-seed it and the merge would silently come undone.
  for (const p of proposals) {
    const from = byId.get(p.fromId);
    const into = byId.get(p.intoId);
    if (from?.builtin && into && !into.builtin) {
      errors.push(`${p.fromName} is built in and must not be merged into the custom ${p.intoName}`);
    }
  }

  return { ok: errors.length === 0, errors, count: proposals.length };
}

// Apply ONE merge. Writes two records and nothing else:
//   - the survivor gains the loser's name (and aliases) as aliases, and any
//     metadata it was missing;
//   - the loser gains `mergedInto` and a timestamp, and keeps everything else.
//
// Returns the two written records, or null when the merge was refused.
export async function applyMerge(fromId, intoId, { now = Date.now(), exercises = null } = {}) {
  const all = exercises || await getAllExercises();
  const from = all.find((e) => e.id === fromId);
  const into = all.find((e) => e.id === intoId);
  if (!from || !into || fromId === intoId) return null;
  // Refuse to build a chain or a cycle. buildMergeIndex() can survive one, but
  // creating one is always a bug.
  if (into.mergedInto) return null;
  if (from.mergedInto === intoId) return { from, into, alreadyMerged: true };

  // The dropped name becomes an alias of the survivor. Only an EXACT repeat of
  // the survivor's own name is dropped: "Bayesian Cable Curls" is kept even
  // though it normalizes the same as "Bayesian Cable Curl", because a person
  // reading the record should be able to see which names were folded in — and
  // because search normalizes aliases anyway, keeping it costs nothing.
  const sameAs = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const aliases = [...new Set([
    ...(into.aliases || []),
    ...(from.aliases || []),
    from.name
  ])].filter((a) => a && !sameAs(a, into.name));

  const canonical = {
    ...into,
    aliases,
    // Metadata is topped up, never overwritten: the library's own values win,
    // and anything it is missing is taken from the record being merged away.
    muscleGroups: (into.muscleGroups || []).length ? into.muscleGroups : (from.muscleGroups || []),
    equipment: into.equipment || from.equipment || null,
    defaultReps: into.defaultReps || from.defaultReps || null,
    defaultRestSec: into.defaultRestSec ?? from.defaultRestSec ?? null,
    // A per-user preference is the user's, so it carries across when the
    // survivor has none of its own.
    weightIncrement: into.weightIncrement ?? from.weightIncrement
  };

  const merged = { ...from, mergedInto: intoId, mergedAt: now };

  await saveExercise(canonical);
  await saveExercise(merged);
  return { from: merged, into: canonical };
}

// Reverse a merge: drop `mergedInto`, and take the name back off the survivor's
// alias list so search stops pointing both ways.
export async function undoMerge(customId, { exercises = null } = {}) {
  const all = exercises || await getAllExercises();
  const from = all.find((e) => e.id === customId);
  if (!from || !from.mergedInto) return null;
  const into = all.find((e) => e.id === from.mergedInto);

  const restored = { ...from };
  delete restored.mergedInto;
  delete restored.mergedAt;
  await saveExercise(restored);

  if (into) {
    // Removes every alias that came from the record being restored: its own
    // name and any alias it carried in.
    const returning = new Set(
      [from.name, ...(from.aliases || [])].map((a) => String(a).trim().toLowerCase())
    );
    const aliases = (into.aliases || []).filter(
      (a) => !returning.has(String(a).trim().toLowerCase())
    );
    await saveExercise({ ...into, aliases });
  }
  return restored;
}

// Merges that are still inside the undo window, newest first.
export async function listReversibleMerges({ now = Date.now(), exercises = null } = {}) {
  const all = exercises || await getAllExercises();
  const byId = new Map(all.map((e) => [e.id, e]));
  return all
    .filter((e) => e.mergedInto && (now - (e.mergedAt || 0)) <= MERGE_UNDO_DAYS * DAY_MS)
    .map((e) => ({
      customId: e.id,
      customName: e.name,
      intoId: e.mergedInto,
      intoName: byId.get(e.mergedInto)?.name || 'Unknown exercise',
      mergedAt: e.mergedAt || 0,
      daysLeft: Math.max(0, Math.ceil(MERGE_UNDO_DAYS - (now - (e.mergedAt || 0)) / DAY_MS))
    }))
    .sort((a, b) => b.mergedAt - a.mergedAt);
}

// THE ONE-TIME LIBRARY DATA FIX.
//
// Proposes, validates, and only then applies — and returns the proposal list
// either way, so the caller can print exactly what happened (or what it refused
// to do). `apply: false` makes it a pure dry run that writes nothing.
export async function dedupeLibrary({ apply = true, now = Date.now() } = {}) {
  const exercises = await getAllExercises();
  const workouts = await getAllWorkouts();
  // BUILT-INS ONLY.
  //
  // A custom exercise that duplicates a library one is reconciliation's job,
  // not this function's, and the difference matters: reconciliation respects
  // "keep separate", reports what it merged so an undo toast can be shown, and
  // distinguishes Tier 1 from Tier 2. Letting the library fix hoover up customs
  // as well would silently bypass all three.
  const library = exercises.filter((e) => e.builtin);
  const proposals = proposeLibraryMerges(library, workouts);
  const review = validateMergeProposals(proposals, exercises);

  if (!proposals.length) return { proposals, review, applied: 0 };
  if (!review.ok) {
    // Refusing is the correct outcome. A merge list that fails review is a bug
    // in the proposer, and applying half of it is how data gets lost.
    console.warn('Library deduplication refused — proposals failed review:', review.errors);
    return { proposals, review, applied: 0 };
  }
  if (!apply) return { proposals, review, applied: 0 };

  let applied = 0;
  // Re-read between merges is unnecessary: proposals are validated to be
  // non-overlapping, so one snapshot is enough and each applyMerge writes only
  // the two records it owns.
  let snapshot = exercises;
  for (const p of proposals) {
    const res = await applyMerge(p.fromId, p.intoId, { now, exercises: snapshot });
    if (!res) continue;
    applied += 1;
    snapshot = snapshot.map((e) => (
      e.id === res.from.id ? res.from : e.id === res.into.id ? res.into : e
    ));
  }
  return { proposals, review, applied };
}

// ---------------------------------------------------------------------------
// TASK 3C — reconciling the user's custom exercises, offline, once per version
// ---------------------------------------------------------------------------

// Work out what should happen to every custom exercise, without doing any of
// it. Pure apart from the reads its caller already did, so it is the function
// the tests drive directly.
//
// Returns { tier1: [...], tier2: [...], tier3: [...] }.
export function planCustomReconciliation(exercises, { keepSeparate = new Set() } = {}) {
  const customs = exercises.filter((e) => !e.builtin && !e.mergedInto);
  const library = exercises.filter((e) => e.builtin && !e.mergedInto);

  const tier1 = [];
  const tier2 = [];
  const tier3 = [];

  for (const custom of customs) {
    // "Keep separate" is per PAIR, not per exercise: being told to leave a
    // custom curl separate from Cable Curl says nothing about Preacher Curl.
    const candidates = library.filter((lib) => !keepSeparate.has(pairKey(custom.id, lib.id)));
    const match = bestMatch(custom, candidates);
    if (!match) { tier3.push({ custom }); continue; }
    const entry = { custom, library: match.exercise, score: match.score };
    if (match.tier === TIER.IDENTICAL) tier1.push(entry);
    else if (match.tier === TIER.SIMILAR) tier2.push(entry);
    else tier3.push({ custom });
  }

  return { tier1, tier2, tier3 };
}

// Record the Tier-2 suggestions, keeping any the user has not answered yet and
// dropping any whose exercises have since been merged, deleted or kept apart.
async function writeSuggestions(tier2, { now, keepSeparate }) {
  const existing = await getSuggestions();
  const wanted = new Map(tier2.map((t) => [pairKey(t.custom.id, t.library.id), t]));

  const out = [];
  for (const s of existing) {
    const key = pairKey(s.customId, s.libraryId);
    if (keepSeparate.has(key)) continue;
    if (!wanted.has(key)) continue;
    out.push(s);                 // keep the original createdAt
    wanted.delete(key);
  }
  for (const [, t] of wanted) {
    out.push({
      customId: t.custom.id,
      customName: t.custom.name,
      libraryId: t.library.id,
      libraryName: t.library.name,
      score: t.score,
      createdAt: now
    });
  }
  await setMeta(SUGGESTIONS_KEY, out);
  return out;
}

// RECONCILE. Idempotent, offline, and safe to call on every launch.
//
// Tier 1 (normalized names identical) merges automatically — there is nothing
// to ask. Tier 2 becomes a suggestion card on Today. Tier 3 is left completely
// alone.
export async function reconcileCustomExercises({ now = Date.now() } = {}) {
  const exercises = await getAllExercises();
  const keepSeparate = await getKeepSeparate();
  const plan = planCustomReconciliation(exercises, { keepSeparate });

  const merged = [];
  let snapshot = exercises;
  for (const t of plan.tier1) {
    const res = await applyMerge(t.custom.id, t.library.id, { now, exercises: snapshot });
    if (!res || res.alreadyMerged) continue;
    merged.push({
      customId: t.custom.id,
      customName: t.custom.name,
      intoId: t.library.id,
      intoName: t.library.name
    });
    snapshot = snapshot.map((e) => (
      e.id === res.from.id ? res.from : e.id === res.into.id ? res.into : e
    ));
  }

  const suggestions = await writeSuggestions(plan.tier2, { now, keepSeparate });
  return { merged, suggestions, untouched: plan.tier3.length };
}

// Answer one suggestion: merge it.
export async function acceptSuggestion(customId, libraryId, { now = Date.now() } = {}) {
  const res = await applyMerge(customId, libraryId, { now });
  await dismissSuggestion(customId, libraryId);
  return res;
}

// Answer one suggestion: leave them separate, FOREVER.
//
// The pair is written to `keepSeparatePairs`, which reconciliation consults
// before it even computes a similarity. Asking somebody the same question every
// time the app starts is how a helpful prompt becomes a nuisance they learn to
// dismiss without reading.
export async function keepSeparate(customId, libraryId) {
  const set = await getKeepSeparate();
  set.add(pairKey(customId, libraryId));
  await setMeta(KEEP_SEPARATE_KEY, [...set]);
  await dismissSuggestion(customId, libraryId);
  return set;
}

export async function dismissSuggestion(customId, libraryId) {
  const list = await getSuggestions();
  const next = list.filter((s) => !(s.customId === customId && s.libraryId === libraryId));
  await setMeta(SUGGESTIONS_KEY, next);
  return next;
}

// Reverse a merge AND stop it being proposed again. Undo means "I did not want
// that", so re-merging it on the next launch would be the worst possible answer.
export async function undoMergeAndKeepSeparate(customId) {
  const all = await getAllExercises();
  const from = all.find((e) => e.id === customId);
  const intoId = from?.mergedInto;
  const restored = await undoMerge(customId, { exercises: all });
  if (restored && intoId) await keepSeparate(customId, intoId);
  return restored;
}

// ---------------------------------------------------------------------------
// The launch hook
// ---------------------------------------------------------------------------

// Called once at boot, after ensureInitialized().
//
//   if LIBRARY_VERSION > lastReconciledVersion:
//       reconcile custom exercises
//       update lastReconciledVersion
//
// Everything inside is local, so this completes with no connection. It never
// throws into boot: a reconciliation that fails leaves the stored version
// alone, so the next launch simply tries again, and in the meantime the app
// works exactly as it did before.
export async function reconcileOnLaunch({ now = Date.now(), force = false } = {}) {
  const lastReconciled = (await getMeta(LAST_RECONCILED_KEY)) || 0;
  const lastDeduped = (await getMeta(LIBRARY_DEDUPED_KEY)) || 0;

  const needsDedupe = force || LIBRARY_VERSION > lastDeduped;
  const needsReconcile = force || LIBRARY_VERSION > lastReconciled;
  if (!needsDedupe && !needsReconcile) {
    return { skipped: true, libraryVersion: LIBRARY_VERSION, lastReconciled };
  }

  const out = { skipped: false, libraryVersion: LIBRARY_VERSION };

  try {
    if (needsDedupe) {
      // The library fix comes FIRST. Reconciling customs against a library that
      // still contains duplicates would point two customs at two records that
      // are about to become one.
      out.dedupe = await dedupeLibrary({ now });
      if (out.dedupe.review.ok) await setMeta(LIBRARY_DEDUPED_KEY, LIBRARY_VERSION);
    }
    if (needsReconcile) {
      out.custom = await reconcileCustomExercises({ now });
      await setMeta(LAST_RECONCILED_KEY, LIBRARY_VERSION);
    }
  } catch (err) {
    // Deliberately swallowed, and deliberately NOT recorded as done. The next
    // launch retries; nothing about the app depends on this having run.
    console.warn('Exercise reconciliation did not complete (it will retry):', err);
    out.error = String(err?.message || err);
  }

  return out;
}

// Exported for the "did you mean" prompt and for tests that want the raw score
// without going through a tier.
export { similarity, classifyPair, TIER };
