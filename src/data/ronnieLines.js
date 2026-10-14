// Ronnie's line pool. Data, not component code, so adding or editing a line
// never touches render logic — src/services/ronnieLines.js is what interprets
// this file (tier filtering, token substitution, `requires` filtering,
// fallback, no-repeat, the `loud` render-time transform).
//
// VOICE RULES — enforce these in review of any future addition:
//
// Ronnie is not a motivational speaker. He is the most intimidating training
// partner in the gym. He expects you to work and is not interested in how
// motivated you feel. His power comes from confrontation, authority, disbelief
// and challenging the user's ego. Not every line is shouted; sometimes the
// coldest line is the quietest one.
//
//   - If it sounds like it belongs on a motivational poster, delete it. If
//     someone could yell it across a weight room, keep it.
//   - No "You've got this", no "Be proud of yourself", no inspirational captions.
//   - A ruthless standard, not a bully: challenge complacency and effort only.
//     Never mock the user's body, weight, appearance, ability, age or identity.
//     No profanity.
//   - Never push anyone to train through injury, illness, dehydration or real
//     exhaustion. The `sleepy` mood exists to say recovery is part of the work.
//   - Under 70 characters. All-caps lines wrap sooner — keep those near 50.
//
// `tiers` is which intensity levels a line is eligible at: 'cold' (quiet and
// understated), 'doghouse' (the default, the lines as written) and 'loud'
// (upper-cased at render time, so no separate copies are stored here).
//
// `expression` is which of Ronnie's seven faces he wears while saying this
// line — it is a property of the LINE, not of the mood or the intensity, so
// the face always matches what he is actually saying. Tagged by hand per line;
// there is deliberately no runtime keyword or sentiment guessing. The seven:
//
//   smug      calm, knowing, teasing — the quiet jabs and the earned approval
//   flat      unimpressed — roasts, excuses, low effort, deadpan deflation
//   shouting  commanding or confrontational — ultimatums and direct challenges
//   hype      huge grin, star eyes — finished workouts, PRs, big wins
//   shocked   wide eyes — impressed or surprised, hype's quieter cousin
//   wrecked   spent, droopy — late nights, rest, "shut it down"
//   worried   brows up, dread — stress, concern, "don't quit"
//
// Adding a line without an `expression`, or with one that has no artwork, is a
// test failure (test/ronnieLines.test.mjs).

// Tokens, substituted at render time by resolveLineText(): {daysSince} (whole
// days since the last workout), {time} (local time, "4am" / "11:30pm") and
// {workout} (today's suggested workout name). A line whose token resolves to
// null/undefined is dropped from the eligible pool rather than ever rendering a
// raw "{token}".
export const RONNIE_LINES = [
  { id: 'smug-1', expression: 'smug', mood: 'smug', text: 'You came to train or you came to visit?', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'smug-2', expression: 'flat', mood: 'smug', text: 'Everybody wants results. Nobody wants the work.', tiers: ['doghouse', 'loud'] },
  { id: 'smug-3', expression: 'smug', mood: 'smug', text: 'You done looking at the screen?', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'smug-4', expression: 'smug', mood: 'smug', text: "All that talking. Let's see what you can actually do.", tiers: ['doghouse', 'loud'] },
  { id: 'smug-5', expression: 'shouting', mood: 'smug', text: "You want respect? The weights don't know your name.", tiers: ['doghouse', 'loud'] },
  { id: 'smug-6', expression: 'flat', mood: 'smug', text: "The bar doesn't care about your reputation.", tiers: ['cold', 'doghouse', 'loud'] },

  { id: 'roast-1', expression: 'flat', mood: 'roast', text: 'You still train? Just checking.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'roast-2', expression: 'smug', mood: 'roast', text: 'That gym membership getting lonely.', tiers: ['doghouse', 'loud'] },
  { id: 'roast-3', expression: 'smug', mood: 'roast', text: "You've been talking about getting serious for a minute now.", tiers: ['doghouse', 'loud'] },
  { id: 'roast-4', expression: 'flat', mood: 'roast', text: 'The weights are right where you left them.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'roast-5', expression: 'worried', mood: 'roast', text: "{daysSince} days gone. What's the plan?", requires: 'daysSince >= 3', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'roast-6', expression: 'shouting', mood: 'roast', text: 'You can explain it to me, or you can go train.', tiers: ['doghouse', 'loud'] },

  { id: 'hype-1', expression: 'hype', mood: 'hype', text: "THAT'S WHAT I'M TALKING ABOUT!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-2', expression: 'hype', mood: 'hype', text: "THERE'S THE DOG! THERE HE IS!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-3', expression: 'hype', mood: 'hype', text: "NOW WE'RE TALKING!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-4', expression: 'shouting', mood: 'hype', text: 'YOU SEE WHAT HAPPENS WHEN YOU PUT THE WORK IN?!', tiers: ['doghouse', 'loud'] },
  { id: 'hype-5', expression: 'shocked', mood: 'hype', text: "THAT'S A DIFFERENT ANIMAL RIGHT THERE!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-6', expression: 'smug', mood: 'hype', text: "THE NUMBERS DON'T LIE!", tiers: ['doghouse', 'loud'] },
  // Even hype is understated at `cold` — these exist so the quiet setting
  // never has to shout, and are the reason hype has no cold-tagged line above.
  { id: 'hype-cold-1', expression: 'shocked', mood: 'hype', text: 'There it is.', tiers: ['cold'] },
  { id: 'hype-cold-2', expression: 'smug', mood: 'hype', text: "Now that's work.", tiers: ['cold'] },
  { id: 'hype-cold-3', expression: 'shocked', mood: 'hype', text: "The numbers don't lie.", tiers: ['cold'] },

  { id: 'impressed-1', expression: 'shocked', mood: 'impressed', text: "Okay. You're starting to look serious.", tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'impressed-2', expression: 'smug', mood: 'impressed', text: 'Another week. No speeches necessary.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'impressed-3', expression: 'smug', mood: 'impressed', text: "That's not motivation anymore. That's discipline.", tiers: ['doghouse', 'loud'] },
  { id: 'impressed-4', expression: 'shocked', mood: 'impressed', text: 'You keep showing up. I respect that.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'impressed-5', expression: 'hype', mood: 'impressed', text: "Now THAT'S a pattern I can respect.", tiers: ['doghouse', 'loud'] },
  { id: 'impressed-6', expression: 'smug', mood: 'impressed', text: "You ain't just talking anymore.", tiers: ['doghouse', 'loud'] },

  { id: 'sleepy-1', expression: 'wrecked', mood: 'sleepy', text: 'You done for the day? Then go recover.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'sleepy-2', expression: 'wrecked', mood: 'sleepy', text: "It's {time}. What are we doing here?", tiers: ['doghouse', 'loud'] },
  { id: 'sleepy-3', expression: 'flat', mood: 'sleepy', text: "Recovery ain't optional. Handle your business.", tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'sleepy-4', expression: 'wrecked', mood: 'sleepy', text: 'Go sleep. We got work to do.', tiers: ['doghouse', 'loud'] },
  { id: 'sleepy-5', expression: 'worried', mood: 'sleepy', text: "You can't train tomorrow on yesterday's sleep.", tiers: ['doghouse', 'loud'] },
  { id: 'sleepy-6', expression: 'wrecked', mood: 'sleepy', text: 'Discipline includes knowing when to shut it down.', tiers: ['cold', 'doghouse', 'loud'] }
];
