// Turning raw community_events rows into the list the feed renders.
//
// Three jobs, none of which belong in a component:
//   1. A human sentence per event (delegated to communityEvents.describeEvent,
//      which already owns the wording).
//   2. Grouping and rate-limiting, so a small community reads as lively rather
//      than as one person's Tuesday repeated four times.
//   3. Folding the user's OWN achievements in from local data, so their PRs
//      appear in their feed even before a publish has gone out.
//
// NOTHING HERE NEEDS A NEW EVENT TYPE, TABLE OR COLUMN. It works entirely off
// the six types migration 010 already emits.
import { describeEvent } from './communityEvents.js';
import { eventStyle } from '../ui/feedRegistry.js';
import { prTimeline } from './prs.js';
import { computeTotals } from '../hooks/useWorkoutTotals.js';
import { formatWeight } from '../utils/units.js';
import { workoutTitle } from './splits.js';
import { formatDuration } from '../utils/date.js';

// Short relative time. A feed row has one line and a timestamp; "2h" earns its
// space, "2 hours ago" does not.
export function shortAgo(iso) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (7 * 86400))}w`;
}

function actorOf(ev) {
  return {
    id: ev.actor_id,
    display_name: ev.actor_display_name,
    username: ev.actor_username,
    avatar_url: ev.actor_avatar_url
  };
}

// A richer detail line than describeEvent alone produces, using metadata the
// server already writes. Completing a workout reads better as
// "Push · 54m · 22 sets" than as a bare "completed a workout".
function detailFor(ev, described) {
  const m = ev.metadata || {};
  if (ev.event_type === 'workout') {
    const bits = [
      m.split && String(m.split).replace(/^./, (c) => c.toUpperCase()),
      m.duration_ms ? formatDuration(m.duration_ms) : null,
      m.sets ? `${m.sets} sets` : null,
      m.top_lift || null
    ].filter(Boolean);
    return bits.length ? bits.join(' · ') : null;
  }
  return described.detail || null;
}

// ---------------------------------------------------------------------------
// The user's own achievements, from local history
// ---------------------------------------------------------------------------

// Synthesised rows that look exactly like server rows to everything downstream,
// with a `local: true` marker and a negative id so they can never collide with a
// real bigint identity. They carry no reactions — you cannot cheer yourself, and
// a cheer button on your own unpublished PR would be a button that does nothing.
export function ownAchievements(workouts, exercises, profile, limit = 6) {
  if (!profile) return [];
  const exName = new Map(exercises.map((e) => [e.id, e.name]));
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const me = {
    actor_id: profile.id,
    actor_display_name: profile.display_name,
    actor_username: profile.username,
    actor_avatar_url: profile.avatar_url
  };
  const rows = [];
  let seq = -1;

  for (const pr of prTimeline(workouts).slice(0, limit)) {
    rows.push({
      ...me, id: seq--, local: true, own: true,
      event_type: 'pr',
      subject: pr.exerciseId,
      created_at: new Date(pr.date).toISOString(),
      reaction_count: 0,
      metadata: {
        weight_kg: pr.unit === 'kg' ? pr.value : undefined,
        reps: pr.unit === 'reps' ? pr.value : undefined,
        pr_kind: pr.kind,
        pr_label: pr.label,
        exercise_name: exName.get(pr.exerciseId)
      }
    });
  }

  // Milestones the person has actually crossed, from the one totals source.
  const totals = computeTotals(workouts);
  const last = workouts[0];
  for (const n of [100, 50, 25]) {
    if (totals.total >= n) {
      rows.push({
        ...me, id: seq--, local: true, own: true,
        event_type: 'workout_milestone',
        subject: `workouts_${n}`,
        created_at: new Date(last?.date || Date.now()).toISOString(),
        reaction_count: 0,
        metadata: { total: n }
      });
      break;
    }
  }
  for (const n of [12, 8, 4]) {
    if (totals.streakWeeks >= n) {
      rows.push({
        ...me, id: seq--, local: true, own: true,
        event_type: 'streak',
        subject: `streak_${n}`,
        created_at: new Date(last?.date || Date.now()).toISOString(),
        reaction_count: 0,
        metadata: { weeks: totals.streakWeeks }
      });
      break;
    }
  }

  // The most recent session, so the feed has something in it for somebody who
  // has just trained and knows nobody yet.
  if (last) {
    rows.push({
      ...me, id: seq--, local: true, own: true,
      event_type: 'workout',
      subject: null,
      created_at: new Date(last.date).toISOString(),
      reaction_count: 0,
      metadata: {
        split: workoutTitle(last, exMap),
        duration_ms: last.endTime ? last.endTime - last.startTime : null,
        sets: (last.sets || []).filter((s) => s.completed && s.type !== 'warmup').length
      }
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Grouping and rate limiting
// ---------------------------------------------------------------------------

// Only the low-signal types collapse. A PR, a milestone, a streak or a challenge
// is the reason somebody opened the feed; "trained today" is weather.
const GROUPABLE = new Set(['workout']);
const GROUP_WINDOW_MS = 12 * 3600000;
// Above this many ordinary events from one person in one window, the extras are
// dropped rather than shown. Somebody logging six sessions in a day is either
// testing the app or having a very unusual day, and the feed should not become
// their diary either way.
const PER_ACTOR_LIMIT = 2;

export function presentFeed(events, { exNames, myId } = {}) {
  const rows = [];
  const perActor = new Map();
  // Groups keyed by type + window, so two clusters of "trained" on different
  // days stay two lines rather than merging into one meaningless total.
  const groups = new Map();

  for (const ev of events) {
    const described = describeEvent(ev, exNames);
    // An event type this build does not know renders as nothing rather than as
    // an empty card asking the user what happened.
    if (!described) continue;

    const ts = Date.parse(ev.created_at) || 0;
    const style = eventStyle(ev.event_type);

    if (GROUPABLE.has(ev.event_type)) {
      const bucket = Math.floor(ts / GROUP_WINDOW_MS);
      const key = `${ev.event_type}:${bucket}`;
      const seen = perActor.get(`${ev.actor_id}:${bucket}`) || 0;
      perActor.set(`${ev.actor_id}:${bucket}`, seen + 1);
      if (seen >= PER_ACTOR_LIMIT) continue;

      if (!groups.has(key)) {
        const entry = { kind: 'group', key, type: ev.event_type, ts, members: [] };
        groups.set(key, entry);
        rows.push(entry);
      }
      groups.get(key).members.push({ ev, described, style, actor: actorOf(ev) });
      continue;
    }

    rows.push({
      kind: 'item',
      key: String(ev.id),
      ev,
      style,
      actor: actorOf(ev),
      headline: described.headline,
      detail: detailFor(ev, described),
      timestamp: shortAgo(ev.created_at),
      ts,
      // Only a challenge aimed at YOU offers an inline Accept, and only while it
      // is still pending. reference_id is the challenge; metadata names the
      // target. Anything ambiguous shows no button rather than a guess.
      acceptable: ev.event_type === 'challenge_created'
        && !!ev.reference_id
        && !!myId
        && ev.metadata?.opponent_id === myId
    });
  }

  // A group of one is just an event. Unwrap it rather than printing
  // "1 person trained today", which is both odd and less informative.
  const flat = rows.flatMap((r) => {
    if (r.kind !== 'group') return [r];
    if (r.members.length === 1) {
      const { ev, described, style, actor } = r.members[0];
      return [{
        kind: 'item', key: String(ev.id), ev, style, actor,
        headline: described.headline,
        detail: detailFor(ev, described),
        timestamp: shortAgo(ev.created_at),
        ts: r.ts, acceptable: false
      }];
    }
    const names = [...new Map(r.members.map((m) => [m.actor.id, m.actor])).values()];
    return [{
      kind: 'group',
      key: r.key,
      type: r.type,
      style: eventStyle(r.type),
      actors: names,
      headline: `${names.length} ${names.length === 1 ? 'person' : 'people'} trained`,
      timestamp: shortAgo(r.ts),
      ts: r.ts,
      members: r.members
    }];
  });

  return flat.sort((a, b) => b.ts - a.ts);
}

// Merge server events with the user's own local achievements, newest first,
// dropping a local row whose server twin has already arrived so a published PR
// does not appear twice.
export function mergeOwn(serverEvents, localEvents) {
  const published = new Set(
    serverEvents
      .filter((e) => e.own || e.mine)
      .map((e) => `${e.event_type}:${e.subject}`)
  );
  return [
    ...serverEvents,
    ...localEvents.filter((e) => !published.has(`${e.event_type}:${e.subject}`))
  ];
}

// A one-line summary for the PR events the presenter produces locally, where
// metadata carries our own richer shape.
export function localPrDetail(ev) {
  const m = ev.metadata || {};
  if (m.weight_kg != null) return formatWeight(m.weight_kg);
  if (m.reps != null) return `${m.reps} reps`;
  return null;
}
