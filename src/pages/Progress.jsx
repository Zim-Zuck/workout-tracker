import { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { estimate1RM, workingVolume, isWorking } from '../services/calculations.js';
import { formatWeight, toDisplay, roundDisplay } from '../utils/units.js';
import { startOfWeek } from '../utils/date.js';

export default function ProgressScreen({ workout, settings }) {
  const { workouts, exercises } = workout;
  const unit = settings.unit;
  const fmt = (kg) => formatWeight(kg, unit);

  // Basic counts.
  const now = Date.now();
  const startWeek = startOfWeek(now);
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0,0,0,0);
  const thisWeek = workouts.filter((w) => w.date >= startWeek).length;
  const thisMonth = workouts.filter((w) => w.date >= startMonth.getTime()).length;
  const streak = computeStreak(workouts);

  // Aggregate weekly volume.
  const weekly = useMemo(() => {
    const map = new Map();
    for (const w of workouts) {
      const wk = startOfWeek(w.date);
      map.set(wk, (map.get(wk) || 0) + workingVolume(w.sets));
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-12)
      .map(([t, v]) => ({
        label: new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        volume: roundDisplay(toDisplay(v, unit), unit)
      }));
  }, [workouts, unit]);

  // Volume by muscle group (last 4 weeks).
  const muscleData = useMemo(() => {
    const cutoff = now - 28 * 86400000;
    const totals = {};
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    for (const w of workouts) {
      if (w.date < cutoff) continue;
      for (const s of w.sets) {
        if (!isWorking(s)) continue;
        const ex = exMap.get(s.exerciseId);
        if (!ex) continue;
        const groups = ex.muscleGroups || [];
        const share = groups.length ? 1 / groups.length : 0;
        for (const g of groups) {
          totals[g] = (totals[g] || 0) + s.weightKg * s.reps * share;
        }
      }
    }
    return Object.entries(totals)
      .map(([label, kg]) => ({ label, volume: roundDisplay(toDisplay(kg, unit), unit) }))
      .sort((a, b) => b.volume - a.volume);
  }, [workouts, exercises, unit, now]);

  // Per-exercise 1RM progression.
  const [selectedEx, setSelectedEx] = useState(() => {
    const withData = exercises.find((e) => workouts.some((w) => w.sets.some((s) => s.exerciseId === e.id && isWorking(s))));
    return withData?.id || '';
  });

  const oneRmSeries = useMemo(() => {
    if (!selectedEx) return [];
    const rows = [];
    for (const w of [...workouts].sort((a, b) => a.date - b.date)) {
      const sets = w.sets.filter((s) => s.exerciseId === selectedEx && isWorking(s));
      if (!sets.length) continue;
      const best = sets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
      const top = sets.reduce((m, s) => Math.max(m, s.weightKg), 0);
      rows.push({
        label: new Date(w.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        e1rm: roundDisplay(toDisplay(best, unit), unit),
        top: roundDisplay(toDisplay(top, unit), unit)
      });
    }
    return rows;
  }, [workouts, selectedEx, unit]);

  // Week-over-week deltas — clearly say "not enough data" when only one week.
  const trend = useMemo(() => {
    if (weekly.length < 2) return null;
    const last = weekly[weekly.length - 1].volume;
    const prev = weekly[weekly.length - 2].volume;
    const delta = last - prev;
    const pct = prev ? Math.round((delta / prev) * 100) : null;
    return { delta, pct };
  }, [weekly]);

  return (
    <div className="p-3 space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="This week" value={thisWeek} />
        <StatTile label="This month" value={thisMonth} />
        <StatTile label="Streak" value={streak + 'w'} />
        <StatTile label="Total" value={workouts.length} />
      </div>

      <Section title="Weekly training volume">
        {weekly.length === 0 ? (
          <EmptyChart msg="Log a workout to see volume." />
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis dataKey="label" stroke="#8a8a92" fontSize={11} />
                <YAxis stroke="#8a8a92" fontSize={11} width={40} />
                <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #2a2a2e', borderRadius: 8 }} labelStyle={{ color: '#8a8a92' }} formatter={(v) => [`${v} ${unit}`, 'Volume']} />
                <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <TrendLine trend={trend} unit={unit} />
      </Section>

      <Section title="Volume by muscle group (last 4 weeks)">
        {muscleData.length === 0 ? (
          <EmptyChart msg="Not enough data yet." />
        ) : (
          <div className="space-y-1.5">
            {muscleData.map((m) => {
              const max = muscleData[0].volume || 1;
              const pct = Math.max(4, Math.round((m.volume / max) * 100));
              return (
                <div key={m.label}>
                  <div className="flex justify-between text-xs">
                    <span className="text-text">{m.label}</span>
                    <span className="text-muted">{fmt(m.volume)}</span>
                  </div>
                  <div className="h-2 mt-1 bg-card rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: pct + '%' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Strength progression"
        right={
          <select
            value={selectedEx}
            onChange={(e) => setSelectedEx(e.target.value)}
            className="h-9 bg-card border border-border rounded-lg text-xs px-2 max-w-[55%]"
          >
            <option value="">Select exercise</option>
            {[...exercises].sort((a,b)=>a.name.localeCompare(b.name)).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        }
      >
        {oneRmSeries.length < 2 ? (
          <EmptyChart msg={selectedEx ? 'Need at least 2 sessions of this exercise.' : 'Pick an exercise to see trends.'} />
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={oneRmSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis dataKey="label" stroke="#8a8a92" fontSize={11} />
                <YAxis stroke="#8a8a92" fontSize={11} width={40} />
                <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #2a2a2e', borderRadius: 8 }} labelStyle={{ color: '#8a8a92' }} formatter={(v, name) => [`${v} ${unit}`, name === 'e1rm' ? 'Est. 1RM' : 'Top weight']} />
                <Line type="monotone" dataKey="e1rm" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="top" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>
    </div>
  );
}

function computeStreak(workouts) {
  // Count consecutive ISO weeks (ending this week) with at least one workout.
  if (!workouts.length) return 0;
  const weeks = new Set(workouts.map((w) => startOfWeek(w.date)));
  let count = 0;
  let cur = startOfWeek(Date.now());
  while (weeks.has(cur)) {
    count++;
    cur -= 7 * 86400000;
  }
  return count;
}

function Section({ title, children, right }) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-2 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase text-muted mt-0.5">{label}</div>
    </div>
  );
}

function EmptyChart({ msg }) {
  return <div className="h-32 flex items-center justify-center text-xs text-muted">{msg}</div>;
}

function TrendLine({ trend, unit }) {
  if (!trend) return <div className="mt-2 text-xs text-muted">Trend: not enough data</div>;
  const cls = trend.delta > 0 ? 'text-success' : trend.delta < 0 ? 'text-danger' : 'text-muted';
  const sign = trend.delta > 0 ? '+' : '';
  return (
    <div className={`mt-2 text-xs ${cls}`}>
      Week over week: {sign}{trend.delta.toFixed(0)} {unit}{trend.pct != null ? ` (${sign}${trend.pct}%)` : ''}
    </div>
  );
}
