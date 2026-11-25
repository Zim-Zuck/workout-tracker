// RONNIE'S WEEKLY-PACE LINES — the Weekly Volume card's reaction to where the
// current week actually stands, from weeklyPaceState() in
// src/services/weeklyVolumeProjection.js.
//
// A sibling pool to src/data/ronnieLines.js, not an extension of it: the
// "mood" here is a pace STATE (not_started/behind/on_pace/ahead/done_above/
// done_below), a different axis from the Today row's hype/sleepy/roast/
// impressed/smug, so mixing the two pools would make one mood key mean two
// unrelated things depending on which screen read it. Interpreted by the same
// generic machinery in src/services/ronnieLines.js (eligibleLines, nextLine,
// resolveLineText, applyIntensity) — nothing screen-specific lives there.
//
// Unlike ronnieLines.js, each line here is written FOR exactly one intensity
// tier rather than shared across tiers with `loud` as a render-time shout —
// the brief supplied distinct wording per tier, so `tiers` is always a single
// element here. `loud` lines are written already shouting; applyIntensity
// still runs over them (harmless — it only upper-cases and swaps a trailing
// "." for "!") so the render pipeline stays identical to the Today pool's.
//
// Tokens: {done} and {total} (tonnes, one decimal, trimmed — see
// src/components/WeeklyPaceRonnie.jsx) and {weekday} (today's full weekday
// name). Same voice rules as ronnieLines.js: confrontational, never
// motivational-poster, no profanity, never about the body.
export const WEEKLY_PACE_LINES = [
  { id: 'wk-not_started-1', expression: 'flat', mood: 'not_started', text: '{weekday}. Zero tons. I’m just noting it.', tiers: ['cold'] },
  { id: 'wk-not_started-2', expression: 'worried', mood: 'not_started', text: 'Nothing logged. The bar’s still empty.', tiers: ['cold'] },
  { id: 'wk-not_started-3', expression: 'worried', mood: 'not_started', text: 'Midweek and you haven’t touched a weight. Explain.', tiers: ['doghouse'] },
  { id: 'wk-not_started-4', expression: 'shouting', mood: 'not_started', text: 'The week started without you. Catch up.', tiers: ['doghouse'] },
  { id: 'wk-not_started-5', expression: 'shouting', mood: 'not_started', text: 'GET. IN. THE. GYM.', tiers: ['loud'] },

  { id: 'wk-behind-1', expression: 'flat', mood: 'behind', text: 'You’re behind. I did the math so you didn’t have to.', tiers: ['cold'] },
  { id: 'wk-behind-2', expression: 'worried', mood: 'behind', text: '{done} t. You’re capable of more than that.', tiers: ['cold'] },
  { id: 'wk-behind-3', expression: 'flat', mood: 'behind', text: 'Behind pace. Your usual self would be embarrassed.', tiers: ['doghouse'] },
  { id: 'wk-behind-4', expression: 'worried', mood: 'behind', text: 'At this rate you finish a session short. Fix it.', tiers: ['doghouse'] },
  { id: 'wk-behind-5', expression: 'shouting', mood: 'behind', text: 'MOVE! THE WEEK ISN’T WAITING!', tiers: ['loud'] },

  { id: 'wk-on_pace-1', expression: 'smug', mood: 'on_pace', text: 'On pace. Don’t get comfortable.', tiers: ['cold'] },
  { id: 'wk-on_pace-2', expression: 'flat', mood: 'on_pace', text: 'Fine. Keep going.', tiers: ['cold'] },
  { id: 'wk-on_pace-3', expression: 'flat', mood: 'on_pace', text: 'On track. That’s the minimum, not a win.', tiers: ['doghouse'] },
  { id: 'wk-on_pace-4', expression: 'smug', mood: 'on_pace', text: 'Same as usual. Usual doesn’t build anything new.', tiers: ['doghouse'] },
  { id: 'wk-on_pace-5', expression: 'shouting', mood: 'on_pace', text: 'ON PACE! NOW BEAT IT!', tiers: ['loud'] },

  { id: 'wk-ahead-1', expression: 'smug', mood: 'ahead', text: 'Ahead of pace. Noted.', tiers: ['cold'] },
  { id: 'wk-ahead-2', expression: 'shocked', mood: 'ahead', text: 'Good week so far. Don’t ruin it.', tiers: ['cold'] },
  { id: 'wk-ahead-3', expression: 'shocked', mood: 'ahead', text: 'Ahead of your average. Don’t coast now.', tiers: ['doghouse'] },
  { id: 'wk-ahead-4', expression: 'smug', mood: 'ahead', text: 'Look at you, actually earning it.', tiers: ['doghouse'] },
  { id: 'wk-ahead-5', expression: 'shouting', mood: 'ahead', text: 'AHEAD OF PACE! DON’T YOU DARE STOP!', tiers: ['loud'] },

  { id: 'wk-done_above-1', expression: 'smug', mood: 'done_above', text: 'Week done. Above average. Acceptable.', tiers: ['cold'] },
  { id: 'wk-done_above-2', expression: 'shocked', mood: 'done_above', text: '{total} t. Respectable. Rest, then repeat.', tiers: ['cold'] },
  { id: 'wk-done_above-3', expression: 'shocked', mood: 'done_above', text: 'Beat your average. Now do it again.', tiers: ['doghouse'] },
  { id: 'wk-done_above-4', expression: 'hype', mood: 'done_above', text: 'Strong week. Don’t make me say it twice.', tiers: ['doghouse'] },
  { id: 'wk-done_above-5', expression: 'hype', mood: 'done_above', text: 'THAT’S HOW YOU DO A WEEK!', tiers: ['loud'] },

  { id: 'wk-done_below-1', expression: 'flat', mood: 'done_below', text: 'Week’s over. Below average. We’ll talk.', tiers: ['cold'] },
  { id: 'wk-done_below-2', expression: 'worried', mood: 'done_below', text: '{total} t. You know that’s not your best.', tiers: ['cold'] },
  { id: 'wk-done_below-3', expression: 'worried', mood: 'done_below', text: 'Short week. Monday’s a clean slate. Use it.', tiers: ['doghouse'] },
  { id: 'wk-done_below-4', expression: 'flat', mood: 'done_below', text: 'You left tons on the table. Go get them back.', tiers: ['doghouse'] },
  { id: 'wk-done_below-5', expression: 'shouting', mood: 'done_below', text: 'NEVER AGAIN! MONDAY, FIRST THING!', tiers: ['loud'] }
];
