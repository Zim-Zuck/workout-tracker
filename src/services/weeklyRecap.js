// The weekly recap statistic engine.
//
// Pure functions over the payload get_weekly_recap() returns. No React, no I/O,
// no formatting decisions that belong to a card.
//
// THE PROBLEM THIS FILE EXISTS TO SOLVE
// A recap that shows Most Volume, Most Workouts and Most PRs every single week
// is a leaderboard with extra steps, and nobody opens a leaderboard twice. So
// nothing here has a fixed slot. Every possible statistic is scored against the
// group's ACTUAL week — how lopsided the result was, how unusual it is against
// that group's own recent form, how many people it actually involves, and
// whether it was already used recently — and only the highest-scoring ones make
// it onto a card. A week where one person moved double everyone else tells a
// different story from a week where three people finished within 2% of each
// other, and the recap should say so.
//
// The one rule that outranks all of the above: the underlying number must be
// true. A statistic is never shown because it is funny. It is shown because it
// happened, and sometimes it happens to be funny.
import { formatWeight } from '../utils/units.js';
import { DEFAULT_EXERCISES } from '../data/defaultExercises.js';
import { weekKeyToMs, WEEK_MS } from './weeklySummary.js';

const EX_BY_ID = new Map(DEFAULT_EXERCISES.map((e) => [e.id, e]));
const LEG_MUSCLES = new Set(['Quads', 'Hamstrings', 'Glutes', 'Calves']);

// Families exist so a card never shows two versions of the same idea. "Most
// volume" and "biggest improvement in volume" are one story, not two.
const FAMILY = {
  volume: 'volume', improvement: 'volume',
  workouts: 'consistency', active_days: 'consistency', duration: 'consistency',
  prs: 'strength',
  sets: 'effort', reps: 'effort'
};

// ---------------------------------------------------------------------------
// Categories — every comparable weekly number, in one list.
//
// `value` returns null, not 0, when a member has nothing to contribute. The
// difference matters: a friend who did not train has no improvement figure at
// all, and showing them as "0% improvement" would rank them against people who
// actually have one.
// ---------------------------------------------------------------------------
const CATEGORIES = [
  {
    id: 'volume', label: 'Most volume', emoji: '🏆',
    value: (m) => (m.week?.volume_kg > 0 ? m.week.volume_kg : null),
    // Grouped: a week's volume runs to five or six digits, and this number is
    // set large enough on card one that "48200 kg" is hard to read at a glance.
    format: (v, unit) => formatWeight(v, unit, { group: true }),
    // Typical hard week for one person, used to normalise "is this big".
    reference: 20000
  },
  {
    id: 'workouts', label: 'Most sessions', emoji: '🏋️',
    value: (m) => (m.week?.workouts > 0 ? m.week.workouts : null),
    format: (v) => `${v}`,
    reference: 4
  },
  {
    id: 'prs', label: 'Most personal records', emoji: '📈',
    value: (m) => (m.week?.prs > 0 ? m.week.prs : null),
    format: (v) => `${v}`,
    reference: 3
  },
  {
    id: 'sets', label: 'Most working sets', emoji: '🔥',
    value: (m) => (m.week?.sets > 0 ? m.week.sets : null),
    format: (v) => `${v}`,
    reference: 60
  },
  {
    id: 'reps', label: 'Most reps', emoji: '📊',
    value: (m) => (m.week?.reps > 0 ? m.week.reps : null),
    format: (v) => `${v}`,
    reference: 500
  },
  {
    id: 'active_days', label: 'Most days trained', emoji: '📅',
    value: (m) => (m.week?.active_days > 0 ? m.week.active_days : null),
    format: (v) => `${v}`,
    reference: 4
  },
  {
    id: 'duration', label: 'Most time under the bar', emoji: '⏱️',
    // Null whenever the device could not measure every session in the week —
    // see weeklySummary.js. An incomplete total would rank someone last for
    // having imported their history.
    value: (m) => (m.week?.duration_min > 0 ? m.week.duration_min : null),
    format: (v) => (v >= 60 ? `${Math.floor(v / 60)}h ${v % 60}m` : `${v}m`),
    reference: 300
  },
  {
    id: 'improvement', label: 'Biggest jump', emoji: '🚀',
    // Percentage above their OWN four-week average, not above anyone else. This
    // is the one category a smaller lifter can win, which is the point of it.
    value: (m) => {
      const w = m.week;
      if (!w || !w.volume_kg || !w.baseline_volume_kg) return null;
      const pct = (w.volume_kg / w.baseline_volume_kg - 1) * 100;
      return pct >= 10 ? Math.round(pct) : null;
    },
    format: (v) => `+${v}%`,
    reference: 40
  }
];

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

// Ranked groups, ties sharing a place. Returns
// [{ place, value, members: [...] }], best first.
//
// Ties are grouped rather than broken. "Kunashe + Eric — 4" is the true answer;
// picking one of them by user id would be inventing a winner.
export function rankBy(members, valueOf) {
  const scored = [];
  for (const m of members) {
    const v = valueOf(m);
    if (v == null) continue;
    scored.push({ member: m, value: v });
  }
  scored.sort((a, b) => b.value - a.value);

  const groups = [];
  for (const s of scored) {
    const last = groups[groups.length - 1];
    if (last && last.value === s.value) last.members.push(s.member);
    else groups.push({ place: groups.length + 1, value: s.value, members: [s.member] });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// Recently-used statistics are damped, not banned. A genuinely enormous week
// should still lead even if the same category led last week — it just has to
// earn it against a handicap.
function freshness(id, recent) {
  const idx = (recent || []).indexOf(id);
  if (idx === -1) return 1;
  return idx === 0 ? 0.45 : 0.7; // 0 = last week, 1 = the week before
}

function saturate(n) {
  return n <= 0 ? 0 : n / (n + 1);
}

// How lopsided the result was: winner over runner-up, saturating so a 10×
// blowout does not score ten times a 2× one.
function dominanceOf(groups) {
  if (groups.length < 2) return 0.5;
  const top = groups[0].value;
  const next = groups[1].value;
  if (!next) return 1;
  return saturate(top / next - 1) * 2; // 2× runner-up → ~0.67, 1.1× → ~0.18
}

// How tight the race was — the mirror of dominance, and what makes a good
// leaderboard row.
function closenessOf(groups) {
  if (groups.length < 2) return 0;
  const top = groups[0].value;
  const next = groups[1].value;
  if (!top) return 0;
  return Math.max(0, 1 - (top - next) / top);
}

function scoreCategory(cat, groups, memberCount, recent) {
  if (!groups.length) return null;
  const entrants = groups.reduce((a, g) => a + g.members.length, 0);
  const participation = memberCount ? entrants / memberCount : 0;
  const magnitude = saturate(groups[0].value / cat.reference);
  const dominance = dominanceOf(groups);
  const closeness = closenessOf(groups);
  const f = freshness(cat.id, recent);

  // A shared first place is a fine leaderboard row and a poor hero. Card 1 is
  // one name under one enormous number, and "three people tied on 4 sessions"
  // is not that — so ties are damped here and nowhere else.
  const tiePenalty = groups[0].members.length > 1 ? 0.6 : 1;

  return {
    id: cat.id,
    category: cat,
    groups,
    entrants,
    // Card 1 wants the most remarkable single number: big, and clearly ahead.
    heroScore: (0.45 * magnitude + 0.35 * dominance + 0.2 * participation) * f * tiePenalty,
    // Card 2 wants a contest: several people in it, finishing close together.
    boardScore: (0.5 * participation + 0.3 * closeness + 0.2 * magnitude) * f
  };
}

// ---------------------------------------------------------------------------
// Exercise battles
//
// The ONLY cross-person strength comparison this app makes is between the same
// exercise. There is no universal strength score, because there is no
// defensible way to say whether a 100 kg bench beats a 180 kg squat, and
// inventing a coefficient would make every ranking in the app a guess.
//
// A lift only enters a battle when at least two people in the circle trained
// that exact built-in exercise in that week. One person benching alone is not a
// competition and is not shown as one.
// ---------------------------------------------------------------------------
const BATTLE_PRIORITY = ['ex_squat', 'ex_deadlift', 'ex_bench_press', 'ex_ohp', 'ex_barbell_row', 'ex_pullup'];

export function buildBattles(members, exerciseRows, unit, limit = 2) {
  const byMember = new Map(members.map((m) => [m.id, m]));
  const byExercise = new Map();
  for (const r of exerciseRows || []) {
    const m = byMember.get(r.user_id);
    if (!m) continue;
    if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, []);
    byExercise.get(r.exercise_id).push({ member: m, row: r });
  }

  const battles = [];
  for (const [exId, entries] of byExercise) {
    if (entries.length < 2) continue;
    const ex = EX_BY_ID.get(exId);
    if (!ex) continue;

    // Bodyweight movements logged with no added load rank by reps — for a
    // pull-up, the rep count IS the result. Mixed loads (someone hung a plate
    // on) fall back to weight, which is the correct comparison for that week.
    const allBodyweight = entries.every((e) => Number(e.row.top_weight_kg) === 0);

    const rows = entries
      .map((e) => ({
        member: e.member,
        weightKg: Number(e.row.top_weight_kg),
        reps: e.row.top_weight_reps,
        e1rm: Number(e.row.best_e1rm_kg),
        sets: e.row.sets
      }))
      .sort((a, b) =>
        allBodyweight
          ? b.reps - a.reps || b.sets - a.sets
          : b.weightKg - a.weightKg || b.reps - a.reps || b.e1rm - a.e1rm
      );

    const groups = rankBy(rows.map((r) => ({ id: r.member.id, row: r })), (x) =>
      allBodyweight ? x.row.reps : x.row.weightKg
    );

    const top = rows[0];
    const next = rows[1];
    const closeness = allBodyweight
      ? (top.reps ? 1 - (top.reps - next.reps) / top.reps : 0)
      : (top.weightKg ? 1 - (top.weightKg - next.weightKg) / top.weightKg : 0);
    const priority = BATTLE_PRIORITY.indexOf(exId);

    battles.push({
      exerciseId: exId,
      // "BENCH BATTLE", "SQUAT BATTLE" — short enough for a headline.
      title: battleTitle(ex.name),
      exerciseName: ex.name,
      mode: allBodyweight ? 'reps' : 'weight',
      // Ties share a place here too, same as every other ranking.
      places: groups.map((g) => ({
        place: g.place,
        value: g.value,
        display: allBodyweight ? `${g.value} reps` : formatWeight(g.value, unit),
        members: g.members.map((x) => byMember.get(x.id)).filter(Boolean)
      })),
      rows,
      score:
        entries.length * 2 +
        (priority === -1 ? 0 : (BATTLE_PRIORITY.length - priority) * 0.5) +
        Math.max(0, closeness) * 2
    });
  }

  return battles.sort((a, b) => b.score - a.score).slice(0, limit);
}

function battleTitle(name) {
  const short = name
    .replace(/^(Barbell|Dumbbell|Back|Standing|Seated Cable|Seated)\s+/i, '')
    .split(' ')[0]
    .toUpperCase();
  return `${short} BATTLE`;
}

// ---------------------------------------------------------------------------
// Per-member derived metrics
//
// Computed once and shared by every award rule, so no rule re-derives a share
// or a ratio its own way.
// ---------------------------------------------------------------------------
function deriveMembers(members, exerciseRows, weekStartMs) {
  const rowsByMember = new Map();
  for (const r of exerciseRows || []) {
    if (!rowsByMember.has(r.user_id)) rowsByMember.set(r.user_id, []);
    rowsByMember.get(r.user_id).push(r);
  }

  return members.map((m) => {
    const w = m.week;
    const rows = rowsByMember.get(m.id) || [];
    const exVol = rows.reduce((a, r) => a + Number(r.volume_kg), 0);
    const vol = Number(w?.volume_kg || 0);

    // Share claims are only made when built-in exercises account for nearly all
    // of the week's volume. Otherwise "62% of their volume was legs" would be
    // measuring a fraction of an unknown whole, and a person whose training is
    // mostly custom exercises would be described wrongly.
    const shareTrustworthy = vol > 0 && exVol / vol >= 0.9;

    let topExercise = null;
    const muscle = new Map();
    for (const r of rows) {
      const v = Number(r.volume_kg);
      if (!topExercise || v > topExercise.volume) {
        topExercise = { id: r.exercise_id, name: EX_BY_ID.get(r.exercise_id)?.name || 'that lift', volume: v };
      }
      const primary = EX_BY_ID.get(r.exercise_id)?.muscleGroups?.[0];
      if (primary) muscle.set(primary, (muscle.get(primary) || 0) + v);
    }

    const legVol = [...muscle.entries()]
      .filter(([g]) => LEG_MUSCLES.has(g))
      .reduce((a, [, v]) => a + v, 0);

    const joinedMs = m.created_at ? new Date(m.created_at).getTime() : null;

    return {
      ...m,
      trained: (w?.workouts || 0) > 0,
      vol,
      workouts: w?.workouts || 0,
      prs: w?.prs || 0,
      sets: w?.sets || 0,
      reps: w?.reps || 0,
      activeDays: w?.active_days || 0,
      baseline: Number(w?.baseline_volume_kg || 0),
      maxSession: Number(w?.max_session_volume_kg || 0),
      gapDays: w?.days_since_prev_workout ?? null,
      exerciseCount: rows.length,
      topExercise,
      shareTrustworthy,
      topExerciseShare: shareTrustworthy && topExercise && exVol ? topExercise.volume / exVol : null,
      legShare: shareTrustworthy && exVol ? legVol / exVol : null,
      volPerSet: (w?.sets || 0) > 0 ? vol / w.sets : null,
      // Someone whose account was created during this week has not had a full
      // week here. Nothing ranks them down for it; it just unlocks a kinder
      // award and suppresses the ones that assume history.
      isNewcomer: joinedMs != null && joinedMs >= weekStartMs
    };
  });
}

function median(nums) {
  const xs = nums.filter((n) => n != null).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// ---------------------------------------------------------------------------
// The award pool
//
// Each rule is a hard condition over published numbers, with a guard that stops
// it firing on thin data. Nothing here is generated, randomised or inferred —
// if a rule fires, the sentence it produces is arithmetic.
//
// `weight` is how interesting the award is when it does fire; it is multiplied
// by freshness so the same person does not collect the same title every week.
// `family` stops two versions of one observation appearing on the same card.
// ---------------------------------------------------------------------------
const AWARDS = [
  {
    id: 'pr_machine',
    title: 'THE PR MACHINE',
    family: 'strength',
    weight: 1.0,
    test: (ctx) => {
      const ranked = rankBy(ctx.derived, (m) => (m.prs > 0 ? m.prs : null));
      if (!ranked.length) return null;
      const top = ranked[0];
      if (top.value < 3 || top.members.length > 1) return null;
      const runnerUp = ranked[1]?.value || 0;
      if (top.value < runnerUp * 2) return null;
      return {
        members: top.members,
        stat: `${top.value} personal records`,
        line: `${top.value} records in seven days. The rest of the group managed ${runnerUp} between them at best.`
      };
    }
  },
  {
    id: 'volume_merchant',
    title: 'THE VOLUME MERCHANT',
    family: 'volume',
    weight: 0.9,
    test: (ctx) => {
      const ranked = rankBy(ctx.derived, (m) => (m.vol > 0 ? m.vol : null));
      if (ranked.length < 2 || ranked[0].members.length > 1) return null;
      const m = ranked[0].members[0];
      if (m.prs > 1) return null;
      // Winning a battle means they were genuinely the strongest at something,
      // which is a different (and better) story than moving the most weight.
      if (ctx.battleWinnerIds.has(m.id)) return null;
      return {
        members: [m],
        stat: formatWeight(m.vol, ctx.unit, { group: true }),
        line: `Moved more weight than anyone else and set ${m.prs === 0 ? 'no' : 'one'} personal record doing it. Tonnage is its own reward.`
      };
    }
  },
  {
    id: 'bench_merchant',
    title: 'THE BENCH PRESS MERCHANT',
    family: 'specialisation',
    weight: 1.0,
    test: (ctx) => {
      const candidates = ctx.derived.filter(
        (m) =>
          m.topExerciseShare != null &&
          m.exerciseCount >= 3 &&
          m.topExerciseShare >= 0.3 &&
          EX_BY_ID.get(m.topExercise.id)?.muscleGroups?.[0] === 'Chest'
      );
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => b.topExerciseShare - a.topExerciseShare)[0];
      const pct = Math.round(m.topExerciseShare * 100);
      return {
        members: [m],
        stat: `${pct}% ${m.topExercise.name.toLowerCase()}`,
        line: `${pct}% of their week went through the ${m.topExercise.name.toLowerCase()}. It is Monday somewhere.`
      };
    }
  },
  {
    id: 'specialist',
    title: 'THE SPECIALIST',
    family: 'specialisation',
    weight: 0.85,
    test: (ctx) => {
      const candidates = ctx.derived.filter(
        (m) => m.topExerciseShare != null && m.exerciseCount >= 3 && m.topExerciseShare >= 0.4
      );
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => b.topExerciseShare - a.topExerciseShare)[0];
      const pct = Math.round(m.topExerciseShare * 100);
      return {
        members: [m],
        stat: `${pct}% ${m.topExercise.name}`,
        line: `${pct}% of their training volume came from one movement. Depth over breadth.`
      };
    }
  },
  {
    id: 'one_man_leg_day',
    title: 'THE ONE-MAN LEG DAY',
    family: 'specialisation',
    weight: 0.9,
    test: (ctx) => {
      const withShare = ctx.derived.filter((m) => m.legShare != null && m.vol > 0);
      if (withShare.length < 2) return null;
      const med = median(withShare.map((m) => m.legShare));
      const m = withShare.sort((a, b) => b.legShare - a.legShare)[0];
      if (m.legShare < 0.55 || med > 0.35) return null;
      const pct = Math.round(m.legShare * 100);
      return {
        members: [m],
        stat: `${pct}% legs`,
        line: `${pct}% of their volume was below the waist, against a group median of ${Math.round(med * 100)}%. Somebody has to.`
      };
    }
  },
  {
    id: 'the_return',
    title: 'THE RETURN',
    family: 'comeback',
    weight: 1.1,
    test: (ctx) => {
      const candidates = ctx.derived.filter((m) => m.gapDays != null && m.gapDays >= 14 && m.workouts >= 1);
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => b.gapDays - a.gapDays)[0];
      return {
        members: [m],
        stat: `${m.gapDays} days away`,
        line: `${m.gapDays} days without a session, then ${m.workouts} in one week. Welcome back.`
      };
    }
  },
  {
    id: 'heavy_day',
    title: 'THE ONE BIG DAY',
    family: 'distribution',
    weight: 0.8,
    test: (ctx) => {
      const candidates = ctx.derived.filter(
        (m) => m.workouts >= 3 && m.vol > 0 && m.maxSession / m.vol >= 0.5
      );
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => b.maxSession / b.vol - a.maxSession / a.vol)[0];
      const pct = Math.round((m.maxSession / m.vol) * 100);
      return {
        members: [m],
        stat: `${pct}% in one session`,
        line: `${m.workouts} sessions, but ${pct}% of the week's weight moved in a single one.`
      };
    }
  },
  {
    id: 'clockwork',
    title: 'CLOCKWORK',
    family: 'distribution',
    weight: 0.75,
    test: (ctx) => {
      const candidates = ctx.derived.filter(
        (m) => m.workouts >= 4 && m.vol > 0 && m.maxSession / m.vol <= 0.32
      );
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => a.maxSession / a.vol - b.maxSession / b.vol)[0];
      const pct = Math.round((m.maxSession / m.vol) * 100);
      return {
        members: [m],
        stat: `${m.workouts} even sessions`,
        line: `${m.workouts} sessions and not one of them more than ${pct}% of the week. Suspiciously well organised.`
      };
    }
  },
  {
    id: 'the_surprise',
    title: 'THE SURPRISE',
    family: 'form',
    weight: 1.0,
    test: (ctx) => {
      const candidates = ctx.derived.filter(
        (m) => m.baseline > 0 && m.workouts >= 2 && m.vol >= m.baseline * 1.6 && !m.isNewcomer
      );
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => b.vol / b.baseline - a.vol / a.baseline)[0];
      const pct = Math.round((m.vol / m.baseline - 1) * 100);
      return {
        members: [m],
        stat: `+${pct}%`,
        line: `${pct}% above their own four-week average. Something changed.`
      };
    }
  },
  {
    id: 'the_quiet_week',
    title: 'THE QUIET WEEK',
    family: 'form',
    weight: 0.6,
    test: (ctx) => {
      const candidates = ctx.derived.filter(
        (m) => m.baseline > 0 && m.workouts >= 1 && m.vol > 0 && m.vol <= m.baseline * 0.5 && !m.isNewcomer
      );
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => a.vol / a.baseline - b.vol / b.baseline)[0];
      const pct = Math.round((m.vol / m.baseline) * 100);
      return {
        members: [m],
        stat: `${pct}% of usual`,
        line: `Still turned up, at ${pct}% of their normal week. A deload, or a busy one.`
      };
    }
  },
  {
    id: 'understudy',
    title: 'THE UNDERSTUDY',
    family: 'placing',
    weight: 0.85,
    test: (ctx) => {
      if (ctx.derived.length < 3) return null;
      const seconds = new Map(); // memberId -> [labels]
      const firsts = new Set();
      for (const s of ctx.scored) {
        for (const m of s.groups[0]?.members || []) firsts.add(m.id);
        for (const m of s.groups[1]?.members || []) {
          if (!seconds.has(m.id)) seconds.set(m.id, []);
          seconds.get(m.id).push(s.category.label.replace(/^Most /, '').replace(/^Biggest /, ''));
        }
      }
      let best = null;
      for (const [id, labels] of seconds) {
        if (firsts.has(id) || labels.length < 2) continue;
        if (!best || labels.length > best.labels.length) {
          best = { member: ctx.derived.find((m) => m.id === id), labels };
        }
      }
      if (!best?.member) return null;
      const [a, b] = best.labels;
      return {
        members: [best.member],
        stat: `${best.labels.length}× runner-up`,
        line: `Second for ${a}. Second for ${b}. First for nothing. So close it is almost a strategy.`
      };
    }
  },
  {
    id: 'long_game',
    title: 'THE LONG GAME',
    family: 'effort',
    weight: 0.8,
    test: (ctx) => {
      const setRank = rankBy(ctx.derived, (m) => (m.sets > 0 ? m.sets : null));
      if (setRank.length < 2 || setRank[0].members.length > 1) return null;
      const m = setRank[0].members[0];
      const volRank = rankBy(ctx.derived, (m2) => (m2.vol > 0 ? m2.vol : null));
      if (volRank[0]?.members.some((x) => x.id === m.id)) return null;
      const med = median(ctx.derived.map((d) => d.volPerSet));
      if (med == null || m.volPerSet == null || m.volPerSet >= med * 0.75) return null;
      return {
        members: [m],
        stat: `${m.sets} sets`,
        line: `More sets than anyone, at ${Math.round((1 - m.volPerSet / med) * 100)}% less weight per set than the group. Endurance is a choice.`
      };
    }
  },
  {
    id: 'first_week',
    title: 'THE NEW ARRIVAL',
    family: 'welcome',
    weight: 0.95,
    test: (ctx) => {
      const candidates = ctx.derived.filter((m) => m.isNewcomer && m.workouts >= 1);
      if (!candidates.length) return null;
      const m = candidates.sort((a, b) => b.workouts - a.workouts)[0];
      return {
        members: [m],
        stat: `${m.workouts} session${m.workouts === 1 ? '' : 's'}`,
        line: `First week in Kun, ${m.workouts} session${m.workouts === 1 ? '' : 's'} logged. No baseline to beat yet — that starts next week.`
      };
    }
  }
];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function weekRangeLabel(weekKey) {
  const start = weekKeyToMs(weekKey);
  const end = start + WEEK_MS - 86400000;
  const f = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${f(start)} – ${f(end)}`;
}

// Builds the entire recap: the three cards' content, plus the live strip shown
// in the Social tab.
//
// `recentIds` is the list of statistic ids used in the previous weeks, newest
// first. Purely a variety mechanism — see freshness().
export function buildWeeklyRecap({ payload, unit = 'kg', recentIds = [] }) {
  const weekKey = payload?.week_start;
  const rawMembers = payload?.members || [];
  const exerciseRows = payload?.exercises || [];
  const weekStartMs = weekKey ? weekKeyToMs(weekKey) : Date.now();

  const derived = deriveMembers(rawMembers, exerciseRows, weekStartMs);
  const active = derived.filter((m) => m.trained);

  const totals = {
    volume: derived.reduce((a, m) => a + m.vol, 0),
    workouts: derived.reduce((a, m) => a + m.workouts, 0),
    prs: derived.reduce((a, m) => a + m.prs, 0),
    sets: derived.reduce((a, m) => a + m.sets, 0),
    people: active.length,
    members: derived.length
  };

  const base = {
    weekKey,
    rangeLabel: weekKey ? weekRangeLabel(weekKey) : '',
    members: derived,
    totals,
    unit
  };

  // Nobody in the circle trained. There is no story, and inventing one from
  // zeroes would be worse than saying so.
  if (!active.length) {
    return { ...base, hasData: false, hero: null, supports: [], categories: [], battles: [], awards: [], shownIds: [] };
  }

  const scored = CATEGORIES
    .map((cat) => scoreCategory(cat, rankBy(derived, cat.value), derived.length, recentIds))
    .filter(Boolean);

  const battles = buildBattles(derived, exerciseRows, unit);
  const battleWinnerIds = new Set();
  for (const b of battles) for (const m of b.places[0]?.members || []) battleWinnerIds.add(m.id);

  // ---- Card 1: one hero statistic, two quiet supports, different families.
  const byHero = [...scored].sort((a, b) => b.heroScore - a.heroScore);
  const hero = byHero[0] || null;
  const supports = [];
  const usedFamilies = new Set(hero ? [FAMILY[hero.id]] : []);
  for (const s of byHero.slice(1)) {
    if (supports.length >= 2) break;
    if (usedFamilies.has(FAMILY[s.id])) continue;
    usedFamilies.add(FAMILY[s.id]);
    supports.push(s);
  }

  // ---- Card 2: the closest, best-attended contests.
  const byBoard = [...scored].sort((a, b) => b.boardScore - a.boardScore);
  const categories = [];
  const boardFamilies = new Set();
  for (const s of byBoard) {
    if (categories.length >= 3) break;
    // With a two-person circle almost nothing has more than one entrant, so the
    // family rule is relaxed rather than leaving the card near-empty.
    if (derived.length > 2 && boardFamilies.has(FAMILY[s.id])) continue;
    boardFamilies.add(FAMILY[s.id]);
    categories.push(s);
  }

  // ---- Card 3: awards that the data actually supports.
  const ctx = { derived, scored, battles, battleWinnerIds, unit };
  const fired = [];
  for (const rule of AWARDS) {
    let result = null;
    try {
      result = rule.test(ctx);
    } catch {
      // A rule that throws on unusual data must not take the recap down with
      // it. The card simply loses that one award.
      result = null;
    }
    if (!result?.members?.length) continue;
    fired.push({
      id: rule.id,
      title: rule.title,
      family: rule.family,
      score: rule.weight * freshness(rule.id, recentIds),
      ...result
    });
  }

  const awards = [];
  const awardedPeople = new Set();
  const awardedFamilies = new Set();
  for (const a of fired.sort((x, y) => y.score - x.score)) {
    if (awards.length >= 3) break;
    if (a.members.some((m) => awardedPeople.has(m.id))) continue;
    if (awardedFamilies.has(a.family)) continue;
    a.members.forEach((m) => awardedPeople.add(m.id));
    awardedFamilies.add(a.family);
    awards.push(a);
  }

  // A quiet week can fire no rules at all. Rather than an empty third card,
  // fall back to plain superlatives — still true, just less interesting —
  // preferring categories the leaderboard card did not already use.
  if (awards.length < 2) {
    const usedOnBoard = new Set(categories.map((c) => c.id));
    const pool = [...byHero.sort((a, b) => (usedOnBoard.has(a.id) ? 1 : 0) - (usedOnBoard.has(b.id) ? 1 : 0))];
    for (const s of pool) {
      if (awards.length >= 3) break;
      const top = s.groups[0];
      if (!top || top.members.some((m) => awardedPeople.has(m.id))) continue;
      top.members.forEach((m) => awardedPeople.add(m.id));
      awards.push({
        id: `top_${s.id}`,
        title: s.category.label.toUpperCase(),
        family: `fallback_${FAMILY[s.id]}`,
        members: top.members,
        stat: s.category.format(top.value, unit),
        line: null
      });
    }
  }

  const shownIds = [
    ...(hero ? [hero.id] : []),
    ...supports.map((s) => s.id),
    ...categories.map((c) => c.id),
    ...awards.map((a) => a.id)
  ];

  return { ...base, hasData: true, hero, supports, categories, battles, awards, shownIds };
}

// Names for a tie, rendered the same way everywhere: "Kunashe + Eric",
// "Kunashe, Eric + 2 more".
export function namesOf(members, max = 2) {
  const names = members.map((m) => m.display_name || m.username);
  if (names.length <= max) return names.join(' + ');
  return `${names.slice(0, max).join(', ')} + ${names.length - max} more`;
}
