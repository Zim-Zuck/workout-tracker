import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GlassCard, SegmentedPills, SegmentedTrack, StatBlock, StatRow, StaticPill, EmptyState, IconButton, Porthole } from '../ui/index.js';
import { LineChart } from '../components/Chart.jsx';
import { orderedSets, setLabels } from '../db/normalize.js';
import { isWorking, estimate1RM } from '../services/calculations.js';
import { prTimeline, bestE1RM } from '../services/prs.js';
import { workoutTitle } from '../services/splits.js';
import { anatomyForExercise, tiersFor, tierSource } from '../services/anatomy.js';
import { EXERCISE_WINDOWS, WINDOWS, pillOptions, rangeFor } from '../services/timeframes.js';
import { classifyTrend, exerciseConsistency, TREND_MIN_SESSIONS, TREND_MIN_SPAN_DAYS } from '../services/exerciseStats.js';
import { formatWeight, formatVolume, roundDisplay } from '../utils/units.js';
import { formatDate, relativeDay } from '../utils/date.js';

// From the shared registry. The old `1M` (30 days) was a near-duplicate of the
// dashboard's `4W` (28) — same question, two answers — so it collapsed into it.
const RANGE_OPTIONS = pillOptions(EXERCISE_WINDOWS);
const rangePill = (id) => WINDOWS[id].pill;

// WHAT THE TREND CHIP SAYS.
//
// Each status gets its own sentence, because they are different claims and a
// single number cannot carry them. The insufficient ones name what is missing
// rather than printing a plateau the data does not support, and the rep-capped
// case admits the estimate's blind spot instead of calling high-rep work flat.
function trendChip(trend) {
  const pct = trend.pctChange == null ? null : `${trend.pctChange > 0 ? '+' : '−'}${Math.abs(trend.pctChange).toFixed(1)}%`;
  const over = `over ${Math.round(trend.spanDays / 7)} weeks · ${trend.sessions} sessions`;

  if (trend.status === 'insufficient') {
    if (trend.reason === 'no_load') return { text: 'No load logged — nothing to trend', tone: 'neutral' };
    if (trend.reason === 'span_too_short') return { text: `Needs ${TREND_MIN_SPAN_DAYS} days of history`, tone: 'neutral' };
    const need = TREND_MIN_SESSIONS - trend.sessions;
    return { text: `${need} more ${need === 1 ? 'session' : 'sessions'} for a trend`, tone: 'neutral' };
  }
  // The cap check comes before the direction, because above 12 reps the
  // estimate stops responding and any direction it reports is an artefact.
  if (trend.repCapped) return { text: "High-rep work — est. 1RM can't track this", tone: 'neutral' };
  if (trend.status === 'noisy') return { text: `Too variable to call · ${trend.sessions} sessions`, tone: 'neutral' };
  if (trend.status === 'steady') return { text: `Holding steady ${over}`, tone: 'neutral' };
  // A decline is information, not an alarm, so it gets no accent either.
  return { text: `${pct} ${over}`, tone: trend.status === 'improving' ? 'pr' : 'neutral' };
}

const REGULARITY_COPY = {
  regular: 'regular',
  uneven: 'uneven',
  sporadic: 'sporadic'
};

// One exercise, over time.
//
// Graph or History, weight or reps, over a window you choose. The headline is
// the three numbers that actually answer "how am I doing on this lift": how
// often, how heavy, how many.
export default function ExerciseDetail({ exercise, workouts, exerciseMap, onBack }) {
  const [tab, setTab] = useState('graph');
  const [range, setRange] = useState('3m');
  const [metric, setMetric] = useState('weight');

  const { start: since } = rangeFor(range);

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
  // An inferred ranking is the first muscle group the user tagged, not a claim
  // about which one does the most work. Said plainly rather than dressed up as
  // the library's judgement.
  const workedSource = tierSource(exercise);

  // ---- Exercise DNA ----
  // Trend and cadence over the SELECTED range, so they answer the same question
  // as the graph above them. Both are pure functions in services/exerciseStats.
  const trend = useMemo(
    () => classifyTrend(workouts, exercise.id, { start: since }),
    [workouts, exercise.id, since]
  );
  const consistency = useMemo(
    () => exerciseConsistency(workouts, exercise.id, { start: since }),
    [workouts, exercise.id, since]
  );
  const chip = trendChip(trend);

  // All-time, beside the range-scoped numbers rather than mixed into them.
  const allTimeVolume = useMemo(() => {
    let v = 0;
    for (const w of workouts) {
      for (const s of w.sets || []) if (s.exerciseId === exercise.id && isWorking(s)) v += s.weightKg * s.reps;
    }
    return v;
  }, [workouts, exercise.id]);
  const bestEver = useMemo(() => bestE1RM(exercise.id, workouts), [workouts, exercise.id]);

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
              {workedSource === 'inferred' && ' · from your tags'}
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
        options={RANGE_OPTIONS}
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
          <div className="mt-md">
            <StaticPill tone={chip.tone}>{chip.text}</StaticPill>
          </div>
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

          {/* How regularly, as distinct from how often — a median gap, because
              one layoff should not define a cadence. Only once there are enough
              sessions to measure variation at all. */}
          {consistency.status === 'ok' && (
            <StatRow
              className="mt-lg"
              items={[
                { value: `${consistency.perMonth.toFixed(1)}`, label: 'Per month' },
                { value: `${Math.round(consistency.medianGapDays)}d`, label: 'Typical gap' },
                { value: REGULARITY_COPY[consistency.regularity], label: 'Cadence' }
              ]}
            />
          )}
          {consistency.lastTrainedAt != null && (
            <p className="mt-sm text-label font-regular text-ink-tertiary">
              Last trained {relativeDay(consistency.lastTrainedAt).toLowerCase()}.
            </p>
          )}

          {/* All time, labelled as such. The three numbers above are scoped to
              the range picker and the two were being read as one set. */}
          <h2 className="mt-xxl text-micro font-semibold uppercase text-ink-tertiary">All time</h2>
          <StatRow
            className="mt-md"
            items={[
              { value: allTime.sessions, label: 'Sessions' },
              { value: bestEver > 0 ? formatWeight(bestEver) : '—', label: 'Best est. 1RM' },
              { value: allTimeVolume > 0 ? formatVolume(allTimeVolume) : '—', label: 'Volume' }
            ]}
          />
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
              body={`You have not logged ${exercise.name} in the last ${rangePill(range)}.`}
            />
          )}
        </ul>
      )}
    </div>
  );
}
