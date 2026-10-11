import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, X, RotateCcw } from 'lucide-react';
import {
  GlassCard, SegmentedPills, PrimaryCircleButton, SecondaryButton,
  StatBlock, WeekStrip, buildWeek, PRHighlight, useUndoToast, Skeleton
} from '../ui/index.js';
import TrainChoice from './TrainChoice.jsx';
import PickExercises from './PickExercises.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import MergeSuggestionCard from '../components/MergeSuggestionCard.jsx';
import RonnieBanter from '../components/RonnieBanter.jsx';
import { SPLITS, splitLabel } from '../services/splits.js';
import { buildSession, recomputePlan, nextSplitInRotation } from '../services/sessionBuilder.js';
import { recommend } from '../services/progression.js';
import { prTimeline } from '../services/prs.js';
import { workingVolume, computeStreak } from '../services/calculations.js';
import { useWorkoutTotals } from '../hooks/useWorkoutTotals.js';
import { formatWeight, formatVolume } from '../utils/units.js';
import { formatDuration, startOfWeek, formatDate } from '../utils/date.js';

// TODAY — the home of the app.
//
// The old first tab asked "start a blank workout?", which is a question nobody
// opens a training app to answer. This one answers "what am I doing today?"
// before you touch anything: a split is already chosen from your rotation, a
// session is already built from what you actually train, and the weights are
// already the ones your progression says come next. One tap starts it.
export default function Today({
  workout, settings, auth, profile, onResume, onOpenCommunity, onOpenProfile, feed,
  mergeSuggestions = [], onMergeSuggestion, onKeepSeparate
}) {
  const { exercises, workouts, active, startWorkout } = workout;
  const undo = useUndoToast();
  // 'home' is the hero; 'choice' is "how do you want to train today?"; 'pick'
  // is the Make-plan exercise picker. Pushed and popped locally rather than
  // through App.jsx, same as Progress pushes ExerciseDetail.
  const [view, setView] = useState('home');

  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const totals = useWorkoutTotals(workouts);

  // The split that comes next in the rotation you are already running.
  //
  // It keeps following the rotation until you tap a pill yourself — so finishing
  // a Push session moves Today to Pull without a reload — and from that moment
  // on the choice is yours and nothing moves it again.
  const [chosenSplit, setChosenSplit] = useState(null);
  const rotationSplit = useMemo(
    () => nextSplitInRotation(workouts, exerciseMap),
    [workouts, exerciseMap]
  );
  const split = chosenSplit ?? rotationSplit;
  const setSplit = setChosenSplit;
  const [plan, setPlan] = useState(null);
  const [starting, setStarting] = useState(false);
  // Drives the crossfade when the hero's content changes. A hard swap reads as
  // a reload; 200ms of fade reads as the card answering you.
  const [fading, setFading] = useState(false);
  const firstRender = useRef(true);

  // Rebuild whenever the split (or the history behind it) changes.
  useEffect(() => {
    const built = buildSession(split, { exercises, workouts });
    if (firstRender.current) {
      firstRender.current = false;
      setPlan(built);
      return;
    }
    setFading(true);
    const t = setTimeout(() => { setPlan(built); setFading(false); }, 120);
    return () => clearTimeout(t);
  }, [split, exercises, workouts]);

  const removeFromPlan = useCallback((exerciseId) => {
    setPlan((p) => {
      if (!p) return p;
      const item = p.exercises.find((x) => x.exercise.id === exerciseId);
      const index = p.exercises.findIndex((x) => x.exercise.id === exerciseId);
      const next = p.exercises.filter((x) => x.exercise.id !== exerciseId);
      undo(`${item.exercise.name} removed`, {
        onUndo: () => setPlan((cur) => {
          const restored = cur.exercises.slice();
          restored.splice(Math.min(index, restored.length), 0, item);
          return { ...cur, ...recomputePlan(restored, workouts) };
        })
      });
      return { ...p, ...recomputePlan(next, workouts) };
    });
  }, [undo, workouts]);

  // Both entry points from the "how do you want to train today?" screen funnel
  // through here. The split tags the session either way — "log as I go" only
  // skips picking exercises up front, not which day this was.
  const startSession = useCallback(async (items) => {
    if (starting || active) return;
    setStarting(true);
    try {
      await startWorkout({ split, name: splitLabel(split), plan: items });
      onResume?.();
    } finally { setStarting(false); }
  }, [starting, active, startWorkout, split, onResume]);

  const startBlank = useCallback(() => startSession([]), [startSession]);

  // ---- Derived stats, all from the ONE totals source ----
  const lastSession = workouts[0] || null;
  const week = useMemo(() => buildWeek(workouts), [workouts]);
  const latestPR = useMemo(() => prTimeline(workouts)[0] || null, [workouts]);

  const preview = plan?.exercises.slice(0, 3) || [];

  if (view === 'choice') {
    return (
      <TrainChoice
        splitId={split}
        starting={starting}
        onBack={() => setView('home')}
        onMakePlan={() => setView('pick')}
        onLogAsIGo={startBlank}
      />
    );
  }

  if (view === 'pick') {
    return (
      <PickExercises
        splitId={split}
        suggested={plan?.exercises || []}
        exercises={exercises}
        workouts={workouts}
        starting={starting}
        onBack={() => setView('choice')}
        onStart={startSession}
      />
    );
  }

  return (
    <div className="px-base pb-nav">
      {/* 1. Split pills ------------------------------------------------- */}
      {/* 16px between the header and the first thing on the page, on every
          tab. 12px read as the content touching the chrome. */}
      <SegmentedPills
        className="pt-base"
        ariaLabel="Training split"
        value={split}
        onChange={setSplit}
        options={SPLITS.map((s) => ({ value: s.id, label: s.label }))}
      />

      {/* 2. Hero ---------------------------------------------------------- */}
      <GlassCard
        variant="hero"
        blur
        className="mt-base p-lg"
        aria-label={`Next workout: ${splitLabel(split)}`}
      >
        {!plan ? (
          <HeroSkeleton />
        ) : (
          <div
            className="transition-opacity duration-base ease-out"
            style={{ opacity: fading ? 0 : 1 }}
          >
            <div className="flex items-start gap-base">
              <div className="flex-1 min-w-0">
                <p className="text-micro font-semibold uppercase text-ink-tertiary">Next workout</p>
                <h1 className="text-display font-semibold text-ink mt-xs">{splitLabel(split)}</h1>
                <p className="text-label font-regular text-ink-secondary mt-sm tabular">
                  {plan.exercises.length} exercises · {plan.setsTotal} sets · ~{plan.estimatedMinutes} min
                </p>
              </div>
              <PrimaryCircleButton
                icon={ArrowRight}
                label={`Start ${splitLabel(split)}`}
                size={88}
                disabled={!!active}
                onClick={() => setView('choice')}
              />
            </div>

            <ul className="mt-lg flex flex-col gap-sm">
              {preview.map((item) => (
                <li key={item.exercise.id}>
                  <GlassCard variant="inset" className="flex items-center gap-sm pl-base pr-xs py-sm">
                    <span className="flex-1 min-w-0">
                      <span className="block text-body font-regular text-ink truncate">
                        {item.exercise.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-label font-semibold text-ink-secondary tabular">
                      {item.target.targetWeightKg > 0
                        ? `${formatWeight(item.target.targetWeightKg)} × ${item.target.targetRepsLow}-${item.target.targetRepsHigh}`
                        : `${item.target.targetRepsLow}-${item.target.targetRepsHigh} reps`}
                    </span>
                    {/* 44pt target around a 16px glyph. Removal is one tap and
                        an undo toast — never a confirmation. */}
                    <button
                      type="button"
                      onClick={() => removeFromPlan(item.exercise.id)}
                      aria-label={`Remove ${item.exercise.name} from today's plan`}
                      className="shrink-0 w-tap h-tap flex items-center justify-center rounded-full
                                 text-ink-tertiary transition-colors duration-fast ease-out
                                 active:text-ink active:bg-glass-pressed"
                    >
                      <X size={16} strokeWidth={2.4} />
                    </button>
                  </GlassCard>
                </li>
              ))}
            </ul>

            {plan.usingDefaults && (
              <p className="mt-md text-micro font-semibold tracking-normal text-ink-tertiary">
                Based on defaults — will learn as you train
              </p>
            )}
          </div>
        )}
      </GlassCard>

      {/* 2b. Ronnie --------------------------------------------------------
          Right after the hero, closer to it (12px) than the gap Today uses
          everywhere else (16px) — he's commenting on the card above him, not
          starting a new section. Off entirely behind its own Settings toggle. */}
      {settings.ronnieEnabled !== false && (
        <RonnieBanter
          className="mt-md"
          workouts={workouts}
          totals={totals}
          workoutName={splitLabel(split)}
          latestPR={latestPR}
          intensity={settings.ronnieIntensity}
        />
      )}

      {/* 3. Merge suggestions ---------------------------------------------
          A Tier-2 reconciliation question: close enough to probably be the same
          lift, not close enough for the app to decide on its own. One at a
          time, answered once, never asked again. */}
      <MergeSuggestionCard
        className="mt-base"
        suggestions={mergeSuggestions}
        onMerge={onMergeSuggestion}
        onKeepSeparate={onKeepSeparate}
      />

      {/* 4. Last session -------------------------------------------------- */}
      {lastSession && (
        <GlassCard className="mt-base p-base flex items-center gap-md">
          <div className="flex-1 min-w-0">
            <p className="text-micro font-semibold uppercase text-ink-tertiary">Last session</p>
            <p className="text-label font-regular text-ink-secondary mt-xs tabular">
              {formatDate(lastSession.date)}
              {lastSession.endTime ? ` · ${formatDuration(lastSession.endTime - lastSession.startTime)}` : ''}
              {' · '}{lastSession.sets.filter((s) => s.completed && s.type !== 'warmup').length} sets
              {' · '}{formatVolume(workingVolume(lastSession.sets))}
            </p>
          </div>
          <SecondaryButton
            icon={RotateCcw}
            className="shrink-0 px-base"
            disabled={!!active}
            onClick={() => {
              // Repeat means "the same lifts again", with fresh progression
              // targets — not the same weights you already beat.
              const items = (lastSession.exercises || [])
                .map((id) => exerciseMap.get(id))
                .filter(Boolean)
                .map((exercise) => ({
                  exercise,
                  muscle: (exercise.muscleGroups || [])[0] || null,
                  reason: 'repeat',
                  sets: 3,
                  target: recommend({ exercise, workoutHistory: workouts })
                }));
              if (items.length) setPlan((p) => ({ ...p, ...recomputePlan(items, workouts) }));
            }}
          >
            Repeat
          </SecondaryButton>
        </GlassCard>
      )}

      {/* 5. Week + totals -------------------------------------------------- */}
      <div className="mt-base">
        <WeekStrip days={week} />
        <div className="mt-md flex items-center justify-between">
          <StatBlock value={totals.thisWeek} label="This week" />
          <StatBlock value={`${totals.streakWeeks}w`} label="Streak" align="center" />
          <StatBlock value={totals.total} label="Total" align="center" />
        </div>
      </div>

      {/* 6. Most recent PR ------------------------------------------------- */}
      {latestPR && (
        <PRHighlight className="mt-base">
          {latestPR.label} · {exerciseMap.get(latestPR.exerciseId)?.name || 'Exercise'} ·{' '}
          {latestPR.unit === 'kg' ? formatWeight(latestPR.value) : `${latestPR.value} reps`}
          {latestPR.delta > 0 && ` · +${latestPR.unit === 'kg' ? formatWeight(latestPR.delta) : latestPR.delta}`}
        </PRHighlight>
      )}

      {/* 7. Activity -------------------------------------------------------- */}
      <ActivityFeed
        variant="preview"
        feed={feed}
        auth={auth}
        profile={profile}
        exercises={exercises}
        workouts={workouts}
        onSeeAll={onOpenCommunity}
        onOpenProfile={onOpenProfile}
        className="mt-xxl"
      />
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div>
      <Skeleton w={96} h={11} radius="control" />
      <Skeleton w={180} h={52} radius="control" className="mt-sm" />
      <Skeleton w={220} h={13} radius="control" className="mt-md" />
      <div className="mt-lg flex flex-col gap-sm">
        <Skeleton h={48} /><Skeleton h={48} /><Skeleton h={48} />
      </div>
    </div>
  );
}
