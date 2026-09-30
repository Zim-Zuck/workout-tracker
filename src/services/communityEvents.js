// Turning a community_events row into a line of English.
//
// Pure functions over the payload get_community_feed() returns. No React, no
// I/O. Sibling of weeklyRecap.js, and written to the same rule: this file
// decides what an event SAYS, the component decides what it looks like.
//
// The feed is deliberately terse. Every event is one headline and at most one
// supporting figure, because a feed people actually read on a phone between sets
// is one they can take in without stopping. This is a training app with a
// community in it, not a timeline.
import { DEFAULT_EXERCISES } from '../data/defaultExercises.js';
import { formatWeight } from '../utils/units.js';

const BUILTIN_NAMES = new Map(DEFAULT_EXERCISES.map((e) => [e.id, e.name]));

// Community events only ever carry built-in exercise ids — socialSummary.js
// refuses to publish anything else, and the subject CHECK in migration 010
// agrees — so the built-in table is always enough. A caller's own map is
// preferred anyway, so somebody who renamed "Overhead Press" to "Press" on their
// device reads their own name for it.
function exerciseName(id, exNames) {
  if (!id) return null;
  return exNames?.get(id) || BUILTIN_NAMES.get(id) || null;
}

function actorName(ev) {
  return ev.actor_display_name || ev.actor_username || 'Someone';
}

// A lift reads as a weight and reps, unless the bar was empty — pull-ups, dips
// and planks are logged at bodyweight, and "0 kg × 12" is not how anybody says
// that. Same rule the profile and challenge cards already use.
function liftLine(weightKg, reps) {
  const w = Number(weightKg) || 0;
  const r = Number(reps) || 0;
  if (w <= 0) return r ? `${r} reps` : null;
  return `${formatWeight(w)} × ${r}`;
}

// Returns { emoji, headline, detail, tone } — or null for an event type this
// build does not know about.
//
// Returning null rather than a placeholder is deliberate: a client that has not
// been updated should quietly skip an event type a newer server started emitting,
// not render an empty card asking the user what happened.
export function describeEvent(ev, exNames) {
  if (!ev?.event_type) return null;

  const who = actorName(ev);
  const meta = ev.metadata || {};
  const exercise = exerciseName(ev.subject, exNames);
  const opponent = meta.opponent_display_name || meta.opponent_username || null;

  switch (ev.event_type) {
    case 'pr':
      return {
        emoji: '🏆',
        headline: exercise
          ? `${who} hit a new ${exercise} PR`
          : `${who} hit a new PR`,
        detail: liftLine(meta.weight_kg, meta.reps),
        tone: 'accent'
      };

    case 'workout':
      return {
        emoji: '💪',
        headline: `${who} completed a workout`,
        detail: null,
        tone: 'muted'
      };

    case 'workout_milestone':
      return {
        emoji: '🎯',
        headline: `${who} reached ${meta.total} workouts`,
        detail: null,
        tone: 'success'
      };

    case 'streak':
      return {
        emoji: '🔥',
        headline: `${who} is on a ${meta.weeks}-week streak`,
        detail: null,
        tone: 'warn'
      };

    case 'challenge_created':
      return {
        emoji: '⚔️',
        // The opponent is named only when they have community sharing on
        // (migration 014). Somebody who opted out does not get pulled onto the
        // feed by another person's action.
        headline: opponent ? `${who} challenged ${opponent}` : `${who} started a challenge`,
        detail: exercise,
        tone: 'accent'
      };

    case 'challenge_completed':
      return {
        emoji: '🏅',
        headline: opponent ? `${who} beat ${opponent}` : `${who} won a challenge`,
        detail: exercise,
        tone: 'warn'
      };

    default:
      return null;
  }
}

// Events this build can render. Used so an unknown type never leaves a gap in
// the list or an off-by-one in a "no activity yet" check.
export function renderableEvents(events, exNames) {
  return (events || [])
    .map((ev) => ({ ev, described: describeEvent(ev, exNames) }))
    .filter((x) => x.described);
}

// The three reactions, in the order they are offered. Kept here rather than in a
// component so the set matches the database CHECK constraint in one place.
export const REACTIONS = [
  { kind: 'like',   emoji: '👏', label: 'Respect' },
  { kind: 'strong', emoji: '💪', label: 'Strong' },
  { kind: 'fire',   emoji: '🔥', label: 'Fire' }
];

export function reactionEmoji(kind) {
  return REACTIONS.find((r) => r.kind === kind)?.emoji || null;
}
