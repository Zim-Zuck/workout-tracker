// Achievements.
//
// Deliberately computed, never stored. The local app already knows everything
// needed to decide whether you have benched 100kg, and a friend's published
// stats and lifts are enough to decide it for them — so there is no
// achievements table, no unlock events to sync, and nothing that can drift out
// of agreement with the underlying numbers.
//
// Three of them. Enough to give a profile some texture; few enough that they
// stay meaningful and V1 stays finishable.
import { formatWeight } from '../utils/units.js';

export const ACHIEVEMENTS = [
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Log your first workout',
    icon: '🩸',
    earned: ({ stats }) => stats.total_workouts >= 1,
    progress: ({ stats }) => ({ current: Math.min(stats.total_workouts, 1), target: 1 })
  },
  {
    id: 'century',
    name: 'Century',
    description: 'Bench press 100 kg',
    icon: '💯',
    earned: ({ lifts }) => benchKg(lifts) >= 100,
    progress: ({ lifts }) => ({ current: Math.min(benchKg(lifts), 100), target: 100 }),
    // Shown in whichever unit the user reads in, while the threshold itself
    // stays 100 kg — a "Century" that triggered at 100 lbs would be a different,
    // much easier achievement wearing the same name.
    format: (v, unit) => formatWeight(v, unit)
  },
  {
    id: 'workhorse',
    name: 'Workhorse',
    description: 'Complete 50 workouts',
    icon: '🐎',
    earned: ({ stats }) => stats.total_workouts >= 50,
    progress: ({ stats }) => ({ current: Math.min(stats.total_workouts, 50), target: 50 })
  }
];

function benchKg(lifts) {
  const b = (lifts || []).find((l) => l.exercise_id === 'ex_bench_press');
  return b ? Number(b.top_weight_kg) : 0;
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
