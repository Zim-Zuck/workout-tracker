// RONNIE'S WEEKLY-PACE LINES — the sibling pool driven by weeklyPaceState()
// rather than the Today row's hype/sleepy/roast/impressed/smug. Interpreted
// by the same generic machinery as ronnieLines.test.mjs already covers in
// depth (token substitution, tier fallback, the shuffle-bag); this file
// checks the shipped pool's own invariants, mirroring that file's rigor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleLines, applyIntensity, resolveLineText, RONNIE_INTENSITIES } from '../src/services/ronnieLines.js';
import { WEEKLY_PACE_LINES } from '../src/data/weeklyPaceLines.js';
import { RONNIE_EXPRESSIONS } from '../src/data/ronnieExpressions.js';
import { WEEKLY_PACE_STATES } from '../src/services/weeklyVolumeProjection.js';

const CONTEXT = { done: '18.2', total: '41', weekday: 'Wednesday' };

test('every shipped line is within the length Ronnie can say in one bubble', () => {
  for (const line of WEEKLY_PACE_LINES) {
    assert.ok(line.text.length <= 70, `${line.id} is ${line.text.length} chars`);
  }
});

test('every line carries a known expression', () => {
  for (const line of WEEKLY_PACE_LINES) {
    assert.ok(
      RONNIE_EXPRESSIONS.includes(line.expression),
      `line ${line.id} has expression ${JSON.stringify(line.expression)}`
    );
  }
});

test('every line declares exactly one tier, and it is a real one', () => {
  for (const line of WEEKLY_PACE_LINES) {
    assert.ok(Array.isArray(line.tiers) && line.tiers.length === 1, `${line.id} should declare exactly one tier`);
    assert.ok(RONNIE_INTENSITIES.includes(line.tiers[0]), `${line.id} declares unknown tier ${line.tiers[0]}`);
  }
});

test('every state has at least one line at every intensity, with every token present', () => {
  for (const state of WEEKLY_PACE_STATES) {
    for (const intensity of RONNIE_INTENSITIES) {
      const eligible = eligibleLines(state, CONTEXT, { intensity, lines: WEEKLY_PACE_LINES });
      assert.ok(eligible.length, `${state} has no line at ${intensity}`);
      for (const line of eligible) {
        const text = applyIntensity(resolveLineText(line, CONTEXT), intensity);
        assert.ok(text && !text.includes('{'), `${line.id} rendered a raw token: ${text}`);
      }
    }
  }
});

test('the {done}, {total} and {weekday} tokens resolve as expected', () => {
  const done = WEEKLY_PACE_LINES.find((l) => l.text.includes('{done}'));
  const total = WEEKLY_PACE_LINES.find((l) => l.text.includes('{total}'));
  const weekday = WEEKLY_PACE_LINES.find((l) => l.text.includes('{weekday}'));
  assert.ok(done && total && weekday, 'expected all three tokens to appear in the shipped pool');
  assert.ok(resolveLineText(done, CONTEXT).includes('18.2'));
  assert.ok(resolveLineText(total, CONTEXT).includes('41'));
  assert.ok(resolveLineText(weekday, CONTEXT).includes('Wednesday'));
});

test('a line with a token is dropped from the pool when that token has no value', () => {
  // not_started's {weekday} line must not survive with no weekday supplied —
  // it has company at every tier so the state itself still has something
  // to say, just never a raw "{weekday}".
  const eligible = eligibleLines('not_started', {}, { intensity: 'cold', lines: WEEKLY_PACE_LINES });
  assert.ok(eligible.length, 'not_started should still have a cold line with no context');
  assert.ok(!eligible.some((l) => l.text.includes('{')), 'a tokenised line leaked through with no value');
});

test('no state/tier pool of two or more lines is stuck on a single face', () => {
  for (const state of WEEKLY_PACE_STATES) {
    for (const tier of RONNIE_INTENSITIES) {
      const pool = WEEKLY_PACE_LINES.filter((l) => l.mood === state && l.tiers.includes(tier));
      if (pool.length < 2) continue;
      const faces = new Set(pool.map((l) => l.expression));
      assert.ok(faces.size >= 2, `every ${tier} line for "${state}" wears the same face (${[...faces][0]})`);
    }
  }
});

test('every state is actually used', () => {
  const used = new Set(WEEKLY_PACE_LINES.map((l) => l.mood));
  for (const state of WEEKLY_PACE_STATES) {
    assert.ok(used.has(state), `state "${state}" has no lines at all`);
  }
});
