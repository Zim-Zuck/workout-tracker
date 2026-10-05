import { useMemo, useState } from 'react';
import { Download, Share2, ChevronRight, LineChart as LineIcon } from 'lucide-react';
import {
  GlassCard, StatBlock, PRBadge, SecondaryButton, TextLink, EmptyState, SegmentedPills
} from '../ui/index.js';
import { BarChart, DistributionBars } from '../components/Chart.jsx';
import MonthCalendar from '../components/MonthCalendar.jsx';
import ExerciseDetail from './ExerciseDetail.jsx';
import ProgressShareCard from '../components/ProgressShareCard.jsx';
import { useToast } from '../components/Toast.jsx';
import { useWorkoutTotals } from '../hooks/useWorkoutTotals.js';
import { prTimeline } from '../services/prs.js';
import { isWorking, workingVolume } from '../services/calculations.js';
import { downloadSetsCSV } from '../services/dataManager.js';
import { formatWeight, formatVolume } from '../utils/units.js';
import { startOfWeek, formatDate } from '../utils/date.js';

const WINDOWS = [
  { value: '4w', label: '4 weeks', days: 28 },
  { value: '12w', label: '12 weeks', days: 84 },
  { value: '1y', label: '1 year', days: 365 }
];

export default function ProgressScreen({ workout }) {
  const { workouts, exercises } = workout;
  const toast = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [detailFor, setDetailFor] = useState(null);
  const [win, setWin] = useState('4w');

  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  // The ONE totals source. The header used to read workouts.length off the
  // device while the leaderboard read a cloud snapshot, and the two disagreed.
  const totals = useWorkoutTotals(workouts);

  const windowDays = WINDOWS.find((w) => w.value === win).days;
  const since = Date.now() - windowDays * 86400000;
  const inWindow = useMemo(() => workouts.filter((w) => w.date >= since), [workouts, since]);

  // ---- Typed PRs, at most one per exercise per session ----
  const prs = useMemo(() => prTimeline(workouts), [workouts]);
  const monthStart = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const prsThisMonth = prs.filter((p) => p.date >= monthStart).length;

  // ---- Weekly volume ----
  const weekly = useMemo(() => {
    const map = new Map();
    for (const w of workouts) {
      const wk = startOfWeek(w.date);
      map.set(wk, (map.get(wk) || 0) + workingVolume(w.sets));
    }
    const weeks = Math.ceil(windowDays / 7);
    const out = [];
    let cur = startOfWeek(Date.now());
    for (let i = 0; i < weeks; i++) {
      out.unshift({
        label: new Date(cur).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        value: Math.round(map.get(cur) || 0)
      });
      cur -= 7 * 86400000;
    }
    return out;
  }, [workouts, windowDays]);

  // Weekly volume passes 2 tonnes often enough that kilograms stop being
  // readable on an axis. Decided once, for the whole chart, so the bars stay
  // comparable between weeks.
  const useTonnes = useMemo(() => Math.max(0, ...weekly.map((d) => d.value)) >= 2000, [weekly]);

  // ---- Muscle groups ----
  const muscle = useMemo(() => {
    const totals = new Map();
    for (const w of inWindow) {
      for (const s of w.sets || []) {
        if (!isWorking(s)) continue;
        const groups = exMap.get(s.exerciseId)?.muscleGroups || [];
        if (!groups.length) continue;
        const share = (s.weightKg * s.reps) / groups.length;
        for (const g of groups) totals.set(g, (totals.get(g) || 0) + share);
      }
    }
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [inWindow, exMap]);

  const muscleTonnes = useMemo(() => Math.max(0, ...muscle.map((d) => d.value)) >= 2000, [muscle]);

  // ---- Rep ranges ----
  const repRange = useMemo(() => {
    const buckets = { '1–5': 0, '6–9': 0, '10–14': 0, '15+': 0 };
    for (const w of inWindow) {
      for (const s of w.sets || []) {
        if (!isWorking(s)) continue;
        if (s.reps <= 5) buckets['1–5']++;
        else if (s.reps <= 9) buckets['6–9']++;
        else if (s.reps <= 14) buckets['10–14']++;
        else buckets['15+']++;
      }
    }
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [inWindow]);

  // ---- Per-exercise roster ----
  const trainedExercises = useMemo(() => {
    const counts = new Map();
    for (const w of workouts) {
      for (const id of new Set((w.sets || []).filter(isWorking).map((s) => s.exerciseId))) {
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([id, n]) => ({ exercise: exMap.get(id), sessions: n }))
      .filter((r) => r.exercise)
      .sort((a, b) => b.sessions - a.sessions);
  }, [workouts, exMap]);

  if (detailFor) {
    return (
      <ExerciseDetail
        exercise={detailFor}
        workouts={workouts}
        exerciseMap={exMap}
        onBack={() => setDetailFor(null)}
      />
    );
  }

  if (!workouts.length) {
    return (
      <EmptyState
        icon={LineIcon}
        title="Nothing to chart yet"
        body="Finish a couple of sessions and your volume, PRs and muscle balance show up here."
      />
    );
  }

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center justify-between pt-base">
        <StatBlock value={totals.thisWeek} label="This week" />
        <StatBlock value={totals.thisMonth} label="This month" align="center" />
        <StatBlock value={`${totals.streakWeeks}w`} label="Streak" align="center" />
        <StatBlock value={totals.total} label="Total" align="center" />
      </div>

      <SegmentedPills
        className="mt-lg"
        ariaLabel="Time window"
        size="sm"
        value={win}
        onChange={setWin}
        options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
      />

      {/* Personal records -------------------------------------------------- */}
      <Section
        title="Personal records"
        right={prsThisMonth > 0
          ? <span className="text-micro font-semibold uppercase text-pr tabular">{prsThisMonth} this month</span>
          : null}
      >
        {!prs.length ? (
          <p className="text-label font-regular text-ink-tertiary">
            Log a lift twice and the second one can set a record.
          </p>
        ) : (
          <ul className="flex flex-col">
            {prs.slice(0, 6).map((pr) => (
              <li key={`${pr.exerciseId}-${pr.date}`}>
                <button
                  type="button"
                  onClick={() => setDetailFor(exMap.get(pr.exerciseId))}
                  className="w-full min-h-tap py-sm flex items-center gap-md text-left border-b border-hairline
                             last:border-b-0 transition-colors duration-fast ease-out active:bg-glass-pressed"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-body font-regular text-ink truncate">
                      {exMap.get(pr.exerciseId)?.name || 'Exercise'}
                    </span>
                    <span className="block text-label font-regular text-ink-tertiary tabular mt-xxs">
                      {formatDate(pr.date)}
                    </span>
                  </span>
                  <span className="shrink-0 flex flex-col items-end gap-xs">
                    <PRBadge
                      kind={pr.kind}
                      size="sm"
                      value={pr.unit === 'kg' ? formatWeight(pr.value) : `${pr.value} reps`}
                    />
                    {pr.delta > 0 && (
                      <span className="text-micro font-semibold tracking-normal text-pr tabular">
                        +{pr.unit === 'kg' ? formatWeight(pr.delta) : `${pr.delta} reps`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Weekly volume ----------------------------------------------------- */}
      <Section title="Weekly volume" subtitle="Working sets only — warm-ups excluded.">
        {/* Tonnes once the numbers get big, rather than an abbreviated
            kilogram: "20k kg" reads as "twenty kilo kilograms". */}
        <BarChart
          data={useTonnes ? weekly.map((d) => ({ ...d, value: d.value / 1000 })) : weekly}
          unit={useTonnes ? 't' : 'kg'}
          highlightLast
          formatValue={(v) => (useTonnes
            ? (Math.round(v * 10) / 10).toLocaleString()
            : Math.round(v).toLocaleString())}
          emptyMessage="No volume logged in this window."
        />
      </Section>

      {/* Muscle groups ----------------------------------------------------- */}
      <Section title="Volume by muscle group" subtitle={`Last ${WINDOWS.find((w) => w.value === win).label}.`}>
        <DistributionBars
          data={muscle}
          unit={muscleTonnes ? 't' : 'kg'}
          formatValue={(v) => (muscleTonnes
            ? (Math.round(v / 100) / 10).toLocaleString()
            : Math.round(v).toLocaleString())}
        />
      </Section>

      {/* Rep ranges -------------------------------------------------------- */}
      <Section title="Rep range distribution" subtitle="Working sets in each range.">
        <DistributionBars data={repRange} formatValue={(v) => String(v)} unit="sets" />
      </Section>

      {/* Calendar ---------------------------------------------------------- */}
      <Section title="Training calendar" subtitle="Green days are days you trained.">
        <MonthCalendar workouts={workouts} monthsBack={win === '1y' ? 12 : win === '12w' ? 3 : 1} />
      </Section>

      {/* Per exercise ------------------------------------------------------ */}
      <Section title="By exercise">
        <ul className="flex flex-col">
          {trainedExercises.slice(0, 12).map(({ exercise, sessions }) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => setDetailFor(exercise)}
                className="w-full min-h-tap py-sm flex items-center gap-md text-left border-b border-hairline
                           last:border-b-0 transition-colors duration-fast ease-out active:bg-glass-pressed"
              >
                <span className="flex-1 min-w-0 text-body font-regular text-ink truncate">{exercise.name}</span>
                <span className="shrink-0 text-label font-regular text-ink-tertiary tabular">
                  {sessions} {sessions === 1 ? 'session' : 'sessions'}
                </span>
                <ChevronRight size={17} className="text-ink-tertiary shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-xxl flex items-center justify-center gap-md">
        <SecondaryButton icon={Share2} onClick={() => setShareOpen(true)}>Share progress</SecondaryButton>
        <TextLink onClick={async () => { await downloadSetsCSV(); toast('CSV exported'); }}>
          Export CSV
        </TextLink>
      </div>

      <ProgressShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        workouts={workouts}
        exercises={exercises}
      />
    </div>
  );
}

function Section({ title, subtitle, right, children }) {
  return (
    <section className="mt-xxl">
      <header className="flex items-baseline justify-between gap-sm">
        <h2 className="text-micro font-semibold uppercase text-ink-tertiary">{title}</h2>
        {right}
      </header>
      {subtitle && <p className="text-label font-regular text-ink-tertiary mt-xs">{subtitle}</p>}
      <div className="mt-md">{children}</div>
    </section>
  );
}
