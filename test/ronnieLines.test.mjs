// RONNIE'S LINES — token substitution, `requires` filtering, fallback, and the
// shuffle-bag's no-immediate-repeat guarantee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLineText, requirementMet, eligibleLines, shuffleLines, nextLine, formatClockToken,
  applyIntensity, normalizeIntensity, RONNIE_INTENSITIES, DEFAULT_INTENSITY
} from '../src/services/ronnieLines.js';
import { RONNIE_LINES } from '../src/data/ronnieLines.js';

// Deterministic "random": a counter rather than Math.random, so shuffle order
// is reproducible across runs.
function seqRng() {
  let i = 0;
  const seq = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.0];
  return () => seq[i++ % seq.length];
}

test('resolveLineText substitutes every known token', () => {
  const line = { id: 'x', mood: 'sleepy', text: "It's {time} and {workout} is waiting." };
  const text = resolveLineText(line, { time: '4am', workout: 'Push' });
  assert.equal(text, "It's 4am and Push is waiting.");
});

test('resolveLineText returns null rather than a raw {token} on a missing value', () => {
  const line = { id: 'x', mood: 'impressed', text: '{streak} weeks straight.' };
  assert.equal(resolveLineText(line, {}), null);
  assert.equal(resolveLineText(line, { streak: undefined }), null);
  assert.equal(resolveLineText(line, { streak: null }), null);
});

test('resolveLineText with no tokens never needs context', () => {
  const line = { id: 'x', mood: 'smug', text: 'Open the workout. I will wait.' };
  assert.equal(resolveLineText(line, {}), 'Open the workout. I will wait.');
});

test('requirementMet: bare identifier is a truthiness check', () => {
  assert.equal(requirementMet('hasHistory', { hasHistory: true }), true);
  assert.equal(requirementMet('hasHistory', { hasHistory: false }), false);
  assert.equal(requirementMet('newPR', {}), false);
});

test('requirementMet: comparison operators', () => {
  assert.equal(requirementMet('sessionsThisWeek == 0', { sessionsThisWeek: 0 }), true);
  assert.equal(requirementMet('sessionsThisWeek == 0', { sessionsThisWeek: 1 }), false);
  assert.equal(requirementMet('daysSince >= 3', { daysSince: 3 }), true);
  assert.equal(requirementMet('daysSince >= 3', { daysSince: 2 }), false);
  assert.equal(requirementMet('streak >= 2', { streak: 2 }), true);
});

test('requirementMet: missing value for a comparison fails rather than throwing', () => {
  assert.equal(requirementMet('daysSince >= 3', {}), false);
});

test('requirementMet: no requires is always met', () => {
  assert.equal(requirementMet(undefined, {}), true);
  assert.equal(requirementMet(null, {}), true);
});

test('requirementMet: an unrecognised expression fails closed', () => {
  assert.equal(requirementMet('daysSince >= 3 && streak >= 1', { daysSince: 10, streak: 5 }), false);
});

const lines = [
  { id: 'a', mood: 'roast', text: 'Zero sessions.', requires: 'sessionsThisWeek == 0' },
  { id: 'b', mood: 'roast', text: 'History exists.', requires: 'hasHistory' },
  { id: 'c', mood: 'roast', text: 'Unconditional roast.' },
  { id: 'd', mood: 'smug', text: 'Smug line.' }
];

test('eligibleLines filters by mood and requires', () => {
  const eligible = eligibleLines('roast', { sessionsThisWeek: 0, hasHistory: false }, { lines });
  assert.deepEqual(eligible.map((l) => l.id).sort(), ['a', 'c']);
});

test('eligibleLines falls back to unconditional lines when nothing conditional qualifies', () => {
  const eligible = eligibleLines('roast', { sessionsThisWeek: 2, hasHistory: false }, { lines });
  // 'a' requires sessionsThisWeek==0 (false), 'b' requires hasHistory (false) —
  // neither qualifies, so the pool falls back to 'c', the only unconditional line.
  assert.deepEqual(eligible.map((l) => l.id), ['c']);
});

test('eligibleLines drops a line whose token cannot resolve, even if requires is met', () => {
  const withToken = [...lines, { id: 'e', mood: 'roast', text: '{daysSince} days.', requires: 'sessionsThisWeek == 0' }];
  const eligible = eligibleLines('roast', { sessionsThisWeek: 0, hasHistory: false }, { lines: withToken });
  assert.ok(!eligible.some((l) => l.id === 'e'));
});

test('shuffleLines is a permutation (same elements, order determined by rng)', () => {
  const input = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const shuffled = shuffleLines(input, seqRng());
  assert.deepEqual(shuffled.map((x) => x.id).sort(), [1, 2, 3, 4]);
});

test('nextLine never immediately repeats the last shown id across many draws', () => {
  const eligible = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  let queue = [];
  let lastId = null;
  const rng = seqRng();
  for (let i = 0; i < 50; i++) {
    const result = nextLine({ eligible, queue, lastId, rng });
    assert.notEqual(result.line.id, lastId);
    lastId = result.line.id;
    queue = result.queue;
  }
});

test('nextLine with a single eligible line has no choice but to repeat it', () => {
  const eligible = [{ id: 'only' }];
  const first = nextLine({ eligible, queue: [], lastId: null });
  assert.equal(first.line.id, 'only');
  const second = nextLine({ eligible, queue: first.queue, lastId: first.line.id });
  assert.equal(second.line.id, 'only');
});

test('formatClockToken drops the minutes on the hour and never zero-pads the hour', () => {
  assert.equal(formatClockToken(new Date(2025, 0, 1, 4, 0).getTime()), '4am');
  assert.equal(formatClockToken(new Date(2025, 0, 1, 23, 30).getTime()), '11:30pm');
  assert.equal(formatClockToken(new Date(2025, 0, 1, 0, 5).getTime()), '12:05am');
  assert.equal(formatClockToken(new Date(2025, 0, 1, 12, 0).getTime()), '12pm');
});

test('nextLine with no eligible lines returns null rather than throwing', () => {
  const result = nextLine({ eligible: [], queue: [], lastId: null });
  assert.equal(result.line, null);
});

test('nextLine cycles through every eligible line before repeating (shuffle-bag)', () => {
  const eligible = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  let queue = [];
  let lastId = null;
  const seen = [];
  const rng = seqRng();
  for (let i = 0; i < 3; i++) {
    const result = nextLine({ eligible, queue, lastId, rng });
    seen.push(result.line.id);
    lastId = result.line.id;
    queue = result.queue;
  }
  assert.deepEqual(seen.sort(), ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// Intensity
// ---------------------------------------------------------------------------
const tiered = [
  { id: 'q', mood: 'hype', text: 'There it is.', tiers: ['cold'] },
  { id: 'l', mood: 'hype', text: 'THERE IT IS!', tiers: ['doghouse', 'loud'] },
  { id: 'd', mood: 'smug', text: 'Doghouse only.', tiers: ['doghouse'] }
];

test('eligibleLines filters by intensity tier', () => {
  assert.deepEqual(eligibleLines('hype', {}, { intensity: 'cold', lines: tiered }).map((l) => l.id), ['q']);
  assert.deepEqual(eligibleLines('hype', {}, { intensity: 'loud', lines: tiered }).map((l) => l.id), ['l']);
});

test('eligibleLines falls back to the doghouse tier when the chosen tier is empty', () => {
  // 'smug' has no cold-tagged line in this pool, so cold borrows doghouse's.
  assert.deepEqual(eligibleLines('smug', {}, { intensity: 'cold', lines: tiered }).map((l) => l.id), ['d']);
});

test('eligibleLines treats a line with no tiers as eligible at every level', () => {
  const untagged = [{ id: 'u', mood: 'smug', text: 'Untagged.' }];
  for (const intensity of RONNIE_INTENSITIES) {
    assert.deepEqual(eligibleLines('smug', {}, { intensity, lines: untagged }).map((l) => l.id), ['u']);
  }
});

test('normalizeIntensity falls back to doghouse for anything unrecognised', () => {
  assert.equal(normalizeIntensity('loud'), 'loud');
  assert.equal(normalizeIntensity(undefined), DEFAULT_INTENSITY);
  assert.equal(normalizeIntensity('screaming'), DEFAULT_INTENSITY);
});

test('applyIntensity shouts at loud and turns a trailing full stop into an exclamation', () => {
  assert.equal(applyIntensity('Now that\'s work.', 'loud'), "NOW THAT'S WORK!");
  assert.equal(applyIntensity('You done looking at the screen?', 'loud'), 'YOU DONE LOOKING AT THE SCREEN?');
});

test('applyIntensity leaves cold and doghouse text exactly as written', () => {
  for (const intensity of ['cold', 'doghouse', undefined]) {
    assert.equal(applyIntensity('There it is.', intensity), 'There it is.');
  }
});

test('applyIntensity passes null through rather than shouting at nothing', () => {
  assert.equal(applyIntensity(null, 'loud'), null);
});

// ---------------------------------------------------------------------------
// The shipped pool itself
// ---------------------------------------------------------------------------
test('every shipped line is within the length Ronnie can say in one bubble', () => {
  for (const line of RONNIE_LINES) {
    assert.ok(line.text.length <= 70, `${line.id} is ${line.text.length} chars`);
  }
});

test('every mood has something to say at every intensity, with every token present', () => {
  const context = { daysSince: 9, time: '11:30pm', workout: 'Push' };
  for (const mood of ['smug', 'roast', 'hype', 'impressed', 'sleepy']) {
    for (const intensity of RONNIE_INTENSITIES) {
      const eligible = eligibleLines(mood, context, { intensity });
      assert.ok(eligible.length, `${mood} has no line at ${intensity}`);
      for (const line of eligible) {
        const text = applyIntensity(resolveLineText(line, context), intensity);
        assert.ok(text && !text.includes('{'), `${line.id} rendered a raw token: ${text}`);
      }
    }
  }
});

test('every mood still has a line when no token has a value (brand new user)', () => {
  for (const mood of ['smug', 'roast', 'hype', 'impressed', 'sleepy']) {
    for (const intensity of RONNIE_INTENSITIES) {
      const eligible = eligibleLines(mood, {}, { intensity });
      assert.ok(eligible.length, `${mood} goes mute at ${intensity} with no context`);
      assert.ok(!eligible.some((l) => l.text.includes('{')), `${mood} kept a tokenised line with no values`);
    }
  }
});

test('every shipped line declares at least one valid tier', () => {
  for (const line of RONNIE_LINES) {
    assert.ok(Array.isArray(line.tiers) && line.tiers.length, `${line.id} has no tiers`);
    for (const tier of line.tiers) {
      assert.ok(RONNIE_INTENSITIES.includes(tier), `${line.id} declares unknown tier ${tier}`);
    }
  }
});
