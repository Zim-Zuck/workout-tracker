# Phase 3 status

Resume point for a new session: read this file, start at the first step marked
**remaining**.

## Baseline (recorded before any Phase 3 work, at aad595d)
- Tests: 393 total, 392 pass, 1 skipped, 0 fail.
- Bundle: `index-B40KbBrV.js` 625.79 kB (gzip 182.07 kB), vendor
  `index-8IuOJL3e.js` 228.79 kB (gzip 59.36 kB), CSS 34.03 kB (gzip 7.64 kB).

## Steps

### 1. Share card date fix — **done**
Tests after: 396 total, 395 pass, 1 skipped, 0 fail.

Decisions made:
- `localDayBounds` and `customRange` **moved** from `trainingEvolution.js` to
  `timeframes.js`. The timeframe registry already owns `resolveRange`/`rangeFor`,
  so range construction now lives in one module. Importers updated
  (`TrainingEvolution.jsx`, `trainingEvolution.test.mjs`); no re-export left
  behind, so there is one import path, not two.
- `resolveRange`'s `custom` argument now takes a `{start, end}` range — the shape
  `customRange()` returns and the shape `resolveRange()` itself returns. Before,
  callers had to translate to `{from, to}`. One range shape in the codebase now.
  Two existing tests updated for the new shape (no assertions weakened).
- `ProgressShareCard.jsx` no longer parses its two date inputs with
  `new Date('YYYY-MM-DD')` (UTC midnight); it calls `customRange()`.
- `weeklySummary.weekKeyToMs` had its own hand-rolled local-midnight parser.
  Pointed at `localDayBounds`; malformed keys still give `NaN`.
- Grep for other `new Date('YYYY-MM-DD')` parsing: those two were the only ones.
  Both `type="date"` input pairs in the app (share card, Evolution screen) now go
  through `customRange`.

### 2. Milestones — **remaining**
### 3a. Performance (lazy-load, memoise, bundle report) — **remaining**
### 3b. Accessibility — **remaining**
### 3c. Property/fuzz tests — **remaining**
### 3d. Consistency audit — **remaining**
### 3e. ARCHITECTURE.md for the Progress area — **remaining**
### Browser verification (after steps 1 and 2) — **remaining**
### Final report — **remaining**
