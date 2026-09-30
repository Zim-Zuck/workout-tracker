import { useMemo } from 'react';
import { computeStreak, workingVolume } from '../services/calculations.js';
import { startOfWeek } from '../utils/date.js';

// THE workout totals. One derivation, used by every screen that shows a count.
//
// The Progress header used to read `workouts.length` straight off IndexedDB
// while the leaderboard read `total_workouts` off the cloud profile, which is a
// snapshot published through an outbox — so the two disagreed whenever a publish
// was queued, had failed offline, or history had been edited without a
// republish. 26 here, 25 there, and no way for the user to know which was true.
//
// The device is the source of truth: it is where the sets were logged. The cloud
// number is a copy, and a screen that shows both must label the cloud one as a
// copy ("synced 2h ago"), never present it as a second total.
export function useWorkoutTotals(workouts, asOf = null) {
  return useMemo(() => computeTotals(workouts, asOf ?? Date.now()), [workouts, asOf]);
}

export function computeTotals(workouts, asOf = Date.now()) {
  // Active sessions are excluded everywhere: a workout counts once it is
  // finished, which is also the moment the cloud snapshot is published, so the
  // two can agree.
  const finished = (workouts || []).filter((w) => !w.isActive);
  const weekStart = startOfWeek(asOf);
  const monthStart = new Date(asOf);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  return {
    total: finished.length,
    thisWeek: finished.filter((w) => w.date >= weekStart).length,
    thisMonth: finished.filter((w) => w.date >= monthStart.getTime()).length,
    streakWeeks: computeStreak(finished, asOf),
    volumeKg: finished.reduce((a, w) => a + workingVolume(w.sets), 0),
    lastWorkoutAt: finished.length ? Math.max(...finished.map((w) => w.date)) : null
  };
}
