import { useMemo, useState } from 'react';
import { Check, Share2, CloudOff, Cloud } from 'lucide-react';
import { GlassCard, PrimaryButton, SecondaryButton, PRBadge } from '../ui/index.js';
import ShareCard from '../components/ShareCard.jsx';
import { workoutSummary } from '../services/workoutSummary.js';
import { sessionPRForExercise } from '../services/prs.js';
import { formatWeight, formatVolume } from '../utils/units.js';
import { formatDuration } from '../utils/date.js';

// WHERE FINISH LANDS YOU.
//
// This screen is the reason Finish now visibly does something. Before, the
// handler set a share-sheet's state and then immediately called onExit(), which
// unmounted the component the sheet lived inside — so the sheet never rendered
// and the only evidence a workout had been saved was a toast that scrolled away.
// Tapping Finish genuinely did nothing you could see.
//
// It is mounted by Root, NOT by the workout screen, precisely so that leaving
// the session cannot take the summary with it.
//
// It is also entirely local: every number here is computed from IndexedDB
// history. It renders identically in aeroplane mode, and the sync state is
// reported as information rather than as something to wait for.
export default function WorkoutSummary({ workout, workouts, exercises, onDone }) {
  const [shareOpen, setShareOpen] = useState(false);

  const summary = useMemo(
    () => (workout ? workoutSummary(workout, workouts, exercises) : null),
    [workout, workouts, exercises]
  );

  // PRs come from the PR authority (services/prs.js), not from the share
  // card's older workoutPRs() — one badge per exercise, the three real kinds,
  // and estimated 1RM used as a tiebreaker rather than claimed as a record.
  const prs = useMemo(() => {
    if (!workout) return [];
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const history = workouts.filter((w) => w.id !== workout.id && w.date < workout.date);
    return (workout.exercises || [])
      .map((id) => {
        const pr = sessionPRForExercise(id, workout.sets, history);
        return pr ? { ...pr, name: exMap.get(id)?.name || 'Exercise' } : null;
      })
      .filter(Boolean);
  }, [workout, workouts, exercises]);

  if (!summary) return null;

  const synced = workout.synced === true;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto scroll-y bg-bg/80 glass-blur safe-top">
      <div className="max-w-app mx-auto px-base pb-xxl">
        <div className="pt-xxl text-center">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-done-soft border border-done-border text-done">
            <Check size={24} strokeWidth={3} />
          </span>
          <h1 className="text-title font-semibold text-ink mt-base">{summary.title} saved</h1>
          <p className="text-label font-regular text-ink-secondary mt-sm tabular">
            {summary.exerciseCount} exercises · {summary.setCount} sets ·{' '}
            {formatDuration(summary.durationMs)}
          </p>
        </div>

        <GlassCard className="mt-xl p-base">
          <div className="flex items-stretch">
            <Stat value={formatVolume(summary.totalVolumeKg)} label="Volume" />
            <Stat value={String(summary.setCount)} label="Sets" />
            <Stat value={formatDuration(summary.durationMs)} label="Duration" />
          </div>
        </GlassCard>

        {prs.length > 0 && (
          <GlassCard className="mt-base p-base">
            <p className="text-micro font-semibold uppercase text-ink-tertiary">
              {prs.length === 1 ? 'Personal record' : 'Personal records'}
            </p>
            <ul className="mt-base flex flex-col gap-md">
              {prs.map((pr) => (
                <li key={pr.exerciseId} className="flex items-center gap-md">
                  <span className="flex-1 min-w-0 text-body font-regular text-ink truncate">
                    {pr.name}
                  </span>
                  <PRBadge
                    size="sm"
                    kind={pr.kind}
                    value={pr.unit === 'kg' ? formatWeight(pr.value) : `${pr.value}`}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}

        <GlassCard className="mt-base p-base">
          <p className="text-micro font-semibold uppercase text-ink-tertiary">What you lifted</p>
          <ul className="mt-base flex flex-col gap-md">
            {summary.exerciseRows.map((row) => (
              <li key={row.name} className="flex items-baseline gap-md">
                <span className="flex-1 min-w-0 text-body font-regular text-ink truncate">{row.name}</span>
                <span className="shrink-0 text-label font-semibold text-ink-secondary tabular">
                  {row.topWeightKg > 0 ? `${formatWeight(row.topWeightKg)} · ` : ''}
                  {row.sets} × {row.reps.join('/')}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        {/* Sync state, stated plainly and never as a problem. An unsynced
            workout is saved; it is queued, which is the normal state of a
            session finished in a basement gym. */}
        <p className="mt-base flex items-center justify-center gap-xs text-label font-regular text-ink-tertiary">
          {synced
            ? <><Cloud size={14} strokeWidth={2.2} /> Backed up to your account</>
            : <><CloudOff size={14} strokeWidth={2.2} /> Saved on this device · will sync when you are online</>}
        </p>

        <div className="mt-xl flex flex-col gap-md">
          <PrimaryButton full size="lg" onClick={onDone}>Done</PrimaryButton>
          <SecondaryButton full icon={Share2} onClick={() => setShareOpen(true)}>
            Share this session
          </SecondaryButton>
        </div>
      </div>

      <ShareCard
        open={shareOpen}
        workout={workout}
        workouts={workouts}
        exercises={exercises}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <span className="flex-1 min-w-0 text-center">
      <span className="block text-body font-semibold text-ink tabular truncate">{value}</span>
      <span className="block text-micro font-semibold uppercase text-ink-tertiary mt-xxs">{label}</span>
    </span>
  );
}
