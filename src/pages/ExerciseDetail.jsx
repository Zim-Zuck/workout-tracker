import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GlassCard, SegmentedPills, SegmentedTrack, StatBlock, EmptyState, IconButton, Porthole } from '../ui/index.js';
import { LineChart } from '../components/Chart.jsx';
import { orderedSets, setLabels } from '../db/normalize.js';
import { isWorking, estimate1RM } from '../services/calculations.js';
import { prTimeline } from '../services/prs.js';
import { workoutTitle } from '../services/splits.js';
import { anatomyForExercise, tiersFor } from '../services/anatomy.js';
import { formatWeight, formatVolume, roundDisplay } from '../utils/units.js';
import { formatDate } from '../utils/date.js';

const RANGES = [
  { value: '1m', label: '1M', days: 30 },
  { value: '3m', label: '3M', days: 90 },
  { value: '6m', label: '6M', days: 182 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null }
];

// One exercise, over time.
//
// Graph or History, weight or reps, over a window you choose. The headline is
// the three numbers that actually answer "how am I doing on this lift": how
// often, how heavy, how many.
export default function ExerciseDetail({ exercise, workouts, exerciseMap, onBack }) {
  const [tab, setTab] = useState('graph');
  const [range, setRange] = useState('3m');
  const [metric, setMetric] = useState('weight');

  const days = RANGES.find((r) => r.value === range)?.days;
  const since = days ? Date.now() - days * 86400000 : 0;

  const sessions = useMemo(() => {
    return workouts
      .filter((w) => w.date >= since)
      .map((w) => {
        const sets = (w.sets || []).filter((s) => s.exerciseId === exercise.id && isWorking(s));
        if (!sets.length) return null;
        return {
          workout: w,
          sets,
          topWeight: sets.reduce((m, s) => Math.max(m, s.weightKg), 0),
          topReps: sets.reduce((m, s) => Math.max(m, s.reps), 0),
          bestE1rm: sets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0),
          volume: sets.reduce((a, s) => a + s.weightKg * s.reps, 0)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.workout.date - b.workout.date);
  }, [workouts, exercise.id, since]);

  const allTime = useMemo(() => {
    const sets = [];
    for (const w of workouts) {
      for (const s of w.sets || []) if (s.exerciseId === exercise.id && isWorking(s)) sets.push(s);
    }
    return {
      sessions: new Set(workouts.filter((w) => (w.sets || []).some((s) => s.exerciseId === exercise.id && isWorking(s))).map((w) => w.id)).size,
      bestWeight: sets.reduce((m, s) => Math.max(m, s.weightKg), 0),
      bestReps: sets.reduce((m, s) => Math.max(m, s.reps), 0)
    };
  }, [workouts, exercise.id]);

  const prs = useMemo(
    () => prTimeline(workouts).filter((p) => p.exerciseId === exercise.id),
    [workouts, exercise.id]
  );
  const prByWorkout = useMemo(() => new Map(prs.map((p) => [p.workoutId, p])), [prs]);

  const series = sessions.map((s) => ({
    label: formatDate(s.workout.date),
    value: metric === 'weight' ? roundDisplay(s.topWeight) : s.topReps
  }));

  const anatomy = anatomyForExercise(exercise);
  const worked = tiersFor(exercise);

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center gap-sm pt-sm -ml-sm">
        <IconButton icon={ArrowLeft} label="Back to Progress" onClick={onBack} />
        <h1 className="text-body font-semibold text-ink truncate">{exercise.name}</h1>
      </div>

      <div className="mt-sm flex items-center gap-md">
        <div className="flex-1 min-w-0">
          <p className="text-label font-regular text-ink-secondary tabular">
            {allTime.sessions} {allTime.sessions === 1 ? 'workout' : 'workouts'}
            {allTime.bestWeight > 0 && ` · best ${formatWeight(allTime.bestWeight)}`}
            {allTime.bestReps > 0 && ` · ${allTime.bestReps} reps`}
          </p>
          {worked.primary.length > 0 && (
            <p className="mt-xxs text-label font-regular text-ink-tertiary truncate">
              {worked.primary.join(', ')}
              {worked.secondary.length > 0 && ` · also ${worked.secondary.join(', ')}`}
            </p>
          )}
        </div>
        {/* No ring. The ring counts sets left in a session, and this screen is
            not a session — it is the whole history of one lift. Passing total=0
            is what suppresses it, so the porthole stays one component rather
            than two that have to agree. */}
        <Porthole
          view={anatomy.view}
          box={anatomy.box}
          primary={anatomy.primary}
          secondary={anatomy.secondary}
          intensity={1}
          total={0}
          size={64}
          label={`Works ${worked.primary.join(', ') || exercise.name}`}
        />
      </div>

      <SegmentedTrack
        className="mt-base"
        ariaLabel="View"
        value={tab}
        onChange={setTab}
        options={[{ value: 'graph', label: 'Graph' }, { value: 'history', label: 'History' }]}
      />

      <SegmentedPills
        className="mt-md"
        ariaLabel="Time range"
        size="sm"
        value={range}
        onChange={setRange}
        options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
      />

      {tab === 'graph' ? (
        <>
          <SegmentedTrack
            className="mt-md"
            ariaLabel="Metric"
            value={metric}
            onChange={setMetric}
            options={[{ value: 'weight', label: 'Weight' }, { value: 'reps', label: 'Reps' }]}
          />
          <GlassCard className="mt-md p-base">
            <LineChart
              data={series}
              unit={metric === 'weight' ? 'kg' : 'reps'}
              emptyMessage={`Log ${exercise.name} twice in this window to see a trend.`}
            />
          </GlassCard>
          <div className="mt-base flex items-center justify-between">
            <StatBlock value={sessions.length} label="Sessions" />
            <StatBlock
              value={sessions.length ? formatWeight(Math.max(...sessions.map((s) => s.topWeight))) : '—'}
              label="Top weight" align="center"
            />
            <StatBlock
              value={sessions.length ? formatVolume(sessions.reduce((a, s) => a + s.volume, 0)) : '—'}
              label="Volume" align="center"
            />
          </div>
        </>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {[...sessions].reverse().map((s) => {
            const pr = prByWorkout.get(s.workout.id);
            const labelled = setLabels(orderedSets(s.workout.sets, exercise.id));
            return (
              <GlassCard key={s.workout.id} className="p-base">
                <div className="flex items-baseline justify-between gap-sm">
                  <p className="text-label font-semibold text-ink tabular">{formatDate(s.workout.date)}</p>
                  <p className="text-micro font-semibold uppercase text-ink-tertiary truncate">
                    {workoutTitle(s.workout, exerciseMap)}
                  </p>
                </div>
                {pr && (
                  <p className="mt-xs text-label font-semibold text-pr">
                    {pr.label}
                    {pr.delta > 0 && ` · +${pr.unit === 'kg' ? formatWeight(pr.delta) : `${pr.delta} reps`}`}
                  </p>
                )}
                <p className="mt-sm text-label font-regular text-ink-secondary tabular">
                  {labelled
                    .filter((x) => x.set.type !== 'warmup')
                    .map((x) => `${formatWeight(x.set.weightKg, { withUnit: false })}×${x.set.reps}`)
                    .join('  ·  ')}
                </p>
              </GlassCard>
            );
          })}
          {!sessions.length && (
            <EmptyState
              icon={ArrowLeft}
              title="Nothing in this window"
              body={`You have not logged ${exercise.name} in the last ${RANGES.find((r) => r.value === range)?.label}.`}
            />
          )}
        </ul>
      )}
    </div>
  );
}
