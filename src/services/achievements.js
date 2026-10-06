// Achievements.
//
// Deliberately computed, never stored. The local app already knows everything
// needed to decide whether you have benched 100kg, and a friend's published
// stats and lifts are enough to decide it for them — so there is no
// achievements table, no unlock events to sync, and nothing that can drift out
// of agreement with the underlying numbers.
//
// THE RULE FOR ADDING ONE: it must be decidable from `stats` and `lifts`
// ALONE. Those two objects are the entire published social summary, so anything
// that needs the raw set history would work on your own profile and silently
// read as unearned on everybody else's.
//
// Every target is a number a lifter already has a name for — two plates, four
// plates, ten pull-ups, a 400 kg total. A milestone you have to have explained
// to you is not a milestone.
import { Dumbbell, Flag, Repeat, CalendarCheck, Disc, Disc3, ChevronsUp, Weight, Sigma }
  from 'lucide-react';
import { formatWeight } from '../utils/units.js';

export const ACHIEVEMENTS = [
  {
    id: 'first_session',
    name: 'First Session',
    description: 'Log your first workout',
    icon: Flag,
    earned: ({ stats }) => stats.total_workouts >= 1,
    progress: ({ stats }) => ({ current: Math.min(stats.total_workouts, 1), target: 1 })
  },
  {
    id: 'century',
    name: 'Century',
    description: 'Bench press 100 kg',
    icon: Dumbbell,
    earned: ({ lifts }) => topKg(lifts, 'ex_bench_press') >= 100,
    progress: ({ lifts }) => ({ current: Math.min(topKg(lifts, 'ex_bench_press'), 100), target: 100 }),
    format: (v) => formatWeight(v, { withUnit: false })
  },
  {
    // 20 kg bar, two 20 kg plates a side.
    id: 'two_plates',
    name: 'Two Plates',
    description: 'Squat 100 kg',
    icon: Disc,
    earned: ({ lifts }) => topKg(lifts, 'ex_squat') >= 100,
    progress: ({ lifts }) => ({ current: Math.min(topKg(lifts, 'ex_squat'), 100), target: 100 }),
    format: (v) => formatWeight(v, { withUnit: false })
  },
  {
    // Same bar, four plates a side.
    id: 'four_plates',
    name: 'Four Plates',
    description: 'Deadlift 180 kg',
    icon: Disc3,
    earned: ({ lifts }) => topKg(lifts, 'ex_deadlift') >= 180,
    progress: ({ lifts }) => ({ current: Math.min(topKg(lifts, 'ex_deadlift'), 180), target: 180 }),
    format: (v) => formatWeight(v, { withUnit: false })
  },
  {
    // Squat + bench + deadlift, the number every lifter quotes.
    id: 'big_three',
    name: 'Big Three',
    description: '400 kg across squat, bench and deadlift',
    icon: Sigma,
    earned: ({ lifts }) => bigThree(lifts) >= 400,
    progress: ({ lifts }) => ({ current: Math.min(bigThree(lifts), 400), target: 400 }),
    format: (v) => formatWeight(v, { withUnit: false })
  },
  {
    id: 'bodyweight_ten',
    name: 'Bodyweight Ten',
    description: 'Ten pull-ups in one set',
    icon: ChevronsUp,
    earned: ({ lifts }) => topReps(lifts, 'ex_pullup') >= 10,
    progress: ({ lifts }) => ({ current: Math.min(topReps(lifts, 'ex_pullup'), 10), target: 10 })
  },
  {
    id: 'workhorse',
    name: 'Workhorse',
    description: 'Complete 50 workouts',
    icon: Repeat,
    earned: ({ stats }) => stats.total_workouts >= 50,
    progress: ({ stats }) => ({ current: Math.min(stats.total_workouts, 50), target: 50 })
  },
  {
    id: 'consistent',
    name: 'Consistent',
    description: 'Train eight weeks in a row',
    icon: CalendarCheck,
    earned: ({ stats }) => (stats.streak_weeks || 0) >= 8,
    progress: ({ stats }) => ({ current: Math.min(stats.streak_weeks || 0, 8), target: 8 })
  },
  {
    id: 'hundred_tonnes',
    name: 'Hundred Tonnes',
    description: 'Move 100 tonnes in working sets',
    icon: Weight,
    earned: ({ stats }) => (stats.lifetime_volume_kg || 0) >= 100000,
    progress: ({ stats }) => ({
      current: Math.min(stats.lifetime_volume_kg || 0, 100000),
      target: 100000
    }),
    // Kilograms stop being readable in a tile this size well before 100,000.
    format: (v) => String(Math.round((v / 1000) * 10) / 10)
  }
];

function lift(lifts, id) {
  return (lifts || []).find((l) => l.exercise_id === id) || null;
}

function topKg(lifts, id) {
  const l = lift(lifts, id);
  return l ? Number(l.top_weight_kg) || 0 : 0;
}

function topReps(lifts, id) {
  const l = lift(lifts, id);
  return l ? Number(l.top_weight_reps) || 0 : 0;
}

function bigThree(lifts) {
  return topKg(lifts, 'ex_squat') + topKg(lifts, 'ex_bench_press') + topKg(lifts, 'ex_deadlift');
}

// `stats` and `lifts` are the same shapes buildStatsSummary/buildLiftsSummary
// produce locally AND the shapes the cloud returns for a friend, so this works
// unchanged for both your own profile and someone else's.
export function evaluateAchievements(stats, lifts) {
  const ctx = { stats: stats || { total_workouts: 0 }, lifts: lifts || [] };
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    earned: a.earned(ctx),
    ...a.progress(ctx),
    format: a.format
  }));
}
