import { Trophy, Dumbbell, Target, Flame, Swords, Medal, UserPlus, TrendingUp } from 'lucide-react';

// EVENT TYPE → ICON, TONE, PROMINENCE.
//
// The feed's extension point. Adding an event type later is one entry here plus
// one sentence in services/communityEvents.js — no component changes, no new
// colour, no new card shape. Types this build does not know about render with
// the `fallback` entry rather than leaving a hole in the list.
//
// TONE IS NOT DECORATION. It resolves to exactly one of the semantic colours:
//   'pr'      → the PR colour. ONLY for `pr` events. Nothing else may claim it.
//   'done'    → green. Completed work and streaks — the same meaning a ticked
//               set has, applied to a whole session.
//   'neutral' → ink. Everything else, which is most things.
//
// PROMINENCE decides card treatment, not colour:
//   'normal'  → a row on the page.
//   'raised'  → a bordered glass card. Milestones and streaks only: they are
//               rare by construction, so they can afford to be louder.
export const EVENT_REGISTRY = {
  pr:                 { icon: Trophy,     tone: 'pr',      prominence: 'normal' },
  workout:            { icon: Dumbbell,   tone: 'neutral', prominence: 'normal' },
  workout_milestone:  { icon: Target,     tone: 'done',    prominence: 'raised' },
  streak:             { icon: Flame,      tone: 'done',    prominence: 'raised' },
  challenge_created:  { icon: Swords,     tone: 'neutral', prominence: 'normal' },
  challenge_completed:{ icon: Medal,      tone: 'neutral', prominence: 'normal' },

  // Not emitted by this build. Declared so the day the server starts sending
  // them the client already renders them correctly, with no release coupling.
  friend_accepted:    { icon: UserPlus,   tone: 'neutral', prominence: 'normal' },
  rank_change:        { icon: TrendingUp, tone: 'neutral', prominence: 'normal' },

  fallback:           { icon: Dumbbell,   tone: 'neutral', prominence: 'normal' }
};

export function eventStyle(type) {
  return EVENT_REGISTRY[type] || EVENT_REGISTRY.fallback;
}

export const TONE_CLASS = {
  pr: 'text-pr',
  done: 'text-done',
  neutral: 'text-ink-secondary'
};
