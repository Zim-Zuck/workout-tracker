// Shaping the community week for display.
//
// Pure functions over the payload get_community_week() returns. The friends
// recap has its own engine (weeklyRecap.js, which ranks a small circle on the
// device); this is deliberately NOT that. The community week arrives
// pre-aggregated from SQL because shipping every user's week to every phone
// stops working somewhere around a few hundred people, and because per-person
// weekly detail is not something the server is willing to hand out (see the
// rules at the top of migration 013).
//
// So this file has no ranking in it. It formats what the server already decided.
import { formatWeight } from '../utils/units.js';
import { weekRangeLabel } from './weeklyRecap.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The headline figures, as [{ id, label, value }]. Anything the server withheld
// is dropped rather than shown as zero — "the community lifted 0 kg" is false,
// and an absent line is honest.
function statLines(totals, floor) {
  const out = [];
  if (num(totals?.people) > 0) {
    out.push({
      id: 'people',
      label: num(totals.people) === 1 ? 'person trained' : 'people trained',
      value: String(num(totals.people))
    });
  }
  if (num(totals?.workouts) > 0) {
    out.push({ id: 'workouts', label: 'workouts logged', value: String(num(totals.workouts)) });
  }
  // Withheld below the anonymity floor: with a handful of contributors a
  // community total minus your own is somebody else's private number.
  if (totals?.volume_kg != null) {
    out.push({
      id: 'volume',
      label: 'lifted together',
      value: formatWeight(num(totals.volume_kg), { group: true })
    });
  }
  if (totals?.sets != null) {
    out.push({ id: 'sets', label: 'working sets', value: String(num(totals.sets)) });
  }
  return { lines: out, volumeWithheld: totals?.volume_kg == null && num(totals?.people) < floor };
}

// The three small boards. Each is dropped entirely when it has no entries, so a
// quiet week shows fewer cards rather than empty ones.
function boardsOf(payload) {
  const boards = [];

  if (payload.top_workouts?.length) {
    boards.push({
      id: 'workouts',
      emoji: '🏋️',
      title: 'Most sessions',
      rows: payload.top_workouts.map((r) => ({ ...r, value: String(num(r.workouts)) }))
    });
  }

  if (payload.top_prs?.length) {
    boards.push({
      id: 'prs',
      emoji: '🏆',
      title: 'Most records',
      rows: payload.top_prs.map((r) => ({
        ...r,
        value: num(r.prs) === 1 ? '1 PR' : `${num(r.prs)} PRs`
      }))
    });
  }

  if (payload.top_streaks?.length) {
    boards.push({
      id: 'streaks',
      emoji: '🔥',
      title: 'Longest streaks',
      rows: payload.top_streaks.map((r) => ({ ...r, value: `${num(r.streak_weeks)}w` }))
    });
  }

  return boards;
}

// Your own week, next to the community's. Null when you did not train — the
// right response to a week off is to say nothing about it, not to render a row
// of zeroes against everyone else's numbers.
function meOf(payload) {
  const m = payload.me;
  if (!m || num(m.workouts) === 0) return null;

  return {
    workouts: num(m.workouts),
    sets: num(m.sets),
    prs: num(m.prs),
    activeDays: num(m.active_days),
    volumeKg: num(m.volume_kg),
    // Supplied by the server, and only when you are actually in the ranking.
    rank: payload.my_rank != null ? Number(payload.my_rank) : null,
    ofPeople: num(payload.totals?.people)
  };
}

export function buildCommunityWeek(payload) {
  if (!payload) return null;

  const floor = num(payload.min_aggregate_users) || 5;
  const totals = payload.totals || {};
  const { lines, volumeWithheld } = statLines(totals, floor);
  const people = num(totals.people);

  return {
    weekKey: payload.week_start,
    rangeLabel: payload.week_start ? weekRangeLabel(payload.week_start) : '',
    // Nobody trained. There is no story, and inventing one from zeroes would be
    // worse than saying so — the same position weeklyRecap.js takes.
    hasData: people > 0,
    people,
    stats: lines,
    // Handed to the UI so it can explain the missing volume line instead of
    // leaving a gap the reader has to account for themselves.
    volumeWithheld,
    minAggregateUsers: floor,
    boards: boardsOf(payload),
    challenges: {
      created: num(payload.challenges?.created),
      completed: num(payload.challenges?.completed)
    },
    me: meOf(payload)
  };
}
