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
// Tokens, substituted at render time by resolveLineText(): {daysSince} (whole
// days since the last workout), {time} (local time, "4am" / "11:30pm") and
// {workout} (today's suggested workout name). A line whose token resolves to
// null/undefined is dropped from the eligible pool rather than ever rendering a
// raw "{token}".
export const RONNIE_LINES = [
  { id: 'smug-1', mood: 'smug', text: 'You came to train or you came to visit?', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'smug-2', mood: 'smug', text: 'Everybody wants results. Nobody wants the work.', tiers: ['doghouse', 'loud'] },
  { id: 'smug-3', mood: 'smug', text: 'You done looking at the screen?', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'smug-4', mood: 'smug', text: "All that talking. Let's see what you can actually do.", tiers: ['doghouse', 'loud'] },
  { id: 'smug-5', mood: 'smug', text: "You want respect? The weights don't know your name.", tiers: ['doghouse', 'loud'] },
  { id: 'smug-6', mood: 'smug', text: "The bar doesn't care about your reputation.", tiers: ['cold', 'doghouse', 'loud'] },

  { id: 'roast-1', mood: 'roast', text: 'You still train? Just checking.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'roast-2', mood: 'roast', text: 'That gym membership getting lonely.', tiers: ['doghouse', 'loud'] },
  { id: 'roast-3', mood: 'roast', text: "You've been talking about getting serious for a minute now.", tiers: ['doghouse', 'loud'] },
  { id: 'roast-4', mood: 'roast', text: 'The weights are right where you left them.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'roast-5', mood: 'roast', text: "{daysSince} days gone. What's the plan?", requires: 'daysSince >= 3', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'roast-6', mood: 'roast', text: 'You can explain it to me, or you can go train.', tiers: ['doghouse', 'loud'] },

  { id: 'hype-1', mood: 'hype', text: "THAT'S WHAT I'M TALKING ABOUT!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-2', mood: 'hype', text: "THERE'S THE DOG! THERE HE IS!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-3', mood: 'hype', text: "NOW WE'RE TALKING!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-4', mood: 'hype', text: 'YOU SEE WHAT HAPPENS WHEN YOU PUT THE WORK IN?!', tiers: ['doghouse', 'loud'] },
  { id: 'hype-5', mood: 'hype', text: "THAT'S A DIFFERENT ANIMAL RIGHT THERE!", tiers: ['doghouse', 'loud'] },
  { id: 'hype-6', mood: 'hype', text: "THE NUMBERS DON'T LIE!", tiers: ['doghouse', 'loud'] },
  // Even hype is understated at `cold` — these exist so the quiet setting
  // never has to shout, and are the reason hype has no cold-tagged line above.
  { id: 'hype-cold-1', mood: 'hype', text: 'There it is.', tiers: ['cold'] },
  { id: 'hype-cold-2', mood: 'hype', text: "Now that's work.", tiers: ['cold'] },
  { id: 'hype-cold-3', mood: 'hype', text: "The numbers don't lie.", tiers: ['cold'] },

  { id: 'impressed-1', mood: 'impressed', text: "Okay. You're starting to look serious.", tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'impressed-2', mood: 'impressed', text: 'Another week. No speeches necessary.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'impressed-3', mood: 'impressed', text: "That's not motivation anymore. That's discipline.", tiers: ['doghouse', 'loud'] },
  { id: 'impressed-4', mood: 'impressed', text: 'You keep showing up. I respect that.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'impressed-5', mood: 'impressed', text: "Now THAT'S a pattern I can respect.", tiers: ['doghouse', 'loud'] },
  { id: 'impressed-6', mood: 'impressed', text: "You ain't just talking anymore.", tiers: ['doghouse', 'loud'] },

  { id: 'sleepy-1', mood: 'sleepy', text: 'You done for the day? Then go recover.', tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'sleepy-2', mood: 'sleepy', text: "It's {time}. What are we doing here?", tiers: ['doghouse', 'loud'] },
  { id: 'sleepy-3', mood: 'sleepy', text: "Recovery ain't optional. Handle your business.", tiers: ['cold', 'doghouse', 'loud'] },
  { id: 'sleepy-4', mood: 'sleepy', text: 'Go sleep. We got work to do.', tiers: ['doghouse', 'loud'] },
  { id: 'sleepy-5', mood: 'sleepy', text: "You can't train tomorrow on yesterday's sleep.", tiers: ['doghouse', 'loud'] },
  { id: 'sleepy-6', mood: 'sleepy', text: 'Discipline includes knowing when to shut it down.', tiers: ['cold', 'doghouse', 'loud'] }
];
