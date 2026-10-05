// SEARCHING THE EXERCISE LIBRARY.
//
// The search field in the "Add exercise" sheet did nothing useful, for two
// reasons that had nothing to do with each other:
//
//   1. THE FIELD KEPT LOSING FOCUS. BottomSheet's focus-trap effect depended on
//      its `onClose` prop, which the workout screen re-created on every render
//      — and the workout screen re-renders once a second to tick the session
//      clock. So every second the effect tore down and re-ran, and its
//      requestAnimationFrame pulled focus back onto the sheet panel. On a phone
//      that closes the keyboard mid-word. Fixed in BottomSheet.jsx by holding
//      onClose in a ref so the effect depends only on `open`.
//
//   2. THE MATCHER WAS A RAW SUBSTRING TEST on `name` and the joined muscle
//      groups. "cable-curl" matched nothing, "cable curls" matched nothing,
//      equipment was not searched, and aliases did not exist.
//
// This module is only the second half. It matches on normalized text, across
// name, aliases, equipment and muscle group, so punctuation, casing, plurals
// and gym shorthand all stop mattering.
import { normalizeName, identityNames } from './exerciseIdentity.js';

// MEMOISED PER EXERCISE OBJECT.
//
// Normalizing is cheap but not free, and a search field runs the whole library
// through it on every keystroke. Keying the cache on the exercise OBJECT rather
// than its id means an edit (which produces a new object) invalidates itself,
// with no cache-busting logic to get wrong — and a WeakMap holds nothing alive.
const haystackCache = new WeakMap();
const namesCache = new WeakMap();

function cachedNames(ex) {
  let v = namesCache.get(ex);
  if (v === undefined) { v = identityNames(ex); namesCache.set(ex, v); }
  return v;
}

// Everything about one exercise that a person might type, as normalized text:
// its name, its aliases, its equipment and its muscle groups.
export function searchHaystack(ex) {
  let v = haystackCache.get(ex);
  if (v !== undefined) return v;
  const parts = [
    ...cachedNames(ex),
    normalizeName(ex.equipment),
    ...(ex.muscleGroups || []).map((m) => normalizeName(m))
  ];
  v = parts.filter(Boolean).join(' ');
  haystackCache.set(ex, v);
  return v;
}

// Does one exercise match one query?
//
// EVERY query token must appear somewhere in the haystack — AND, not OR. "cable
// curl" should not return every cable exercise plus every curl; it should
// return the things that are both. Matching is substring-per-token, so "curl"
// finds "Preacher Curl" and "bay" finds "Bayesian Cable Curl" while you are
// still typing.
export function matchesQuery(ex, queryTokens, haystack) {
  if (!queryTokens.length) return true;
  const hay = haystack ?? searchHaystack(ex);
  return queryTokens.every((t) => hay.includes(t));
}

export function queryTokens(q) {
  const norm = normalizeName(q);
  return norm ? norm.split(' ').filter(Boolean) : [];
}

// Rank matches so the obvious answer is first.
//
// A whole-name hit beats a name that merely starts with the query, which beats
// a hit anywhere in the name, which beats a hit that was only in the equipment
// or muscle group. Within a rank it is alphabetical, so the list never
// reshuffles for reasons the user cannot see.
function rank(ex, queryTokens, normalizedQuery) {
  const names = cachedNames(ex);
  if (names.includes(normalizedQuery)) return 0;
  if (names.some((n) => n.startsWith(normalizedQuery))) return 1;
  if (names.some((n) => n.includes(normalizedQuery))) return 2;
  if (names.some((n) => queryTokens.every((t) => n.includes(t)))) return 3;
  return 4;
}

// THE search function. `extraRank` lets a caller add its own primary ordering
// (the picker puts the current split's exercises first when nothing is typed)
// without reimplementing any of the matching.
export function searchExercises(exercises, q, { extraRank = null } = {}) {
  const tokens = queryTokens(q);
  const normalizedQuery = tokens.join(' ');

  // Ranks are computed ONCE per exercise, not inside the comparator. A
  // comparator that calls rank() does O(n log n) normalizations instead of
  // O(n), which is the difference between instant and noticeable on a long
  // library.
  const matched = [];
  for (const ex of exercises || []) {
    const hay = searchHaystack(ex);
    if (!matchesQuery(ex, tokens, hay)) continue;
    matched.push({
      ex,
      primary: extraRank ? extraRank(ex) : 0,
      relevance: tokens.length ? rank(ex, tokens, normalizedQuery) : 0
    });
  }

  matched.sort((a, b) => (
    a.primary - b.primary
    || a.relevance - b.relevance
    || a.ex.name.localeCompare(b.ex.name)
  ));
  return matched.map((m) => m.ex);
}
