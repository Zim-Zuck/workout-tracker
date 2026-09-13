import { useMemo, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';
import { estimate1RM, workingVolume, isWorking, buildPrTimeline, e1rmSeries } from '../services/calculations.js';
import { downloadSetsCSV } from '../services/dataManager.js';
import { formatWeight, toDisplay, roundDisplay } from '../utils/units.js';
import { startOfWeek, startOfDay, formatDate } from '../utils/date.js';
import { useToast } from '../components/Toast.jsx';

export default function ProgressScreen({ workout, settings }) {
  const { workouts, exercises } = workout;
  const unit = settings.unit;
  const fmt = (kg) => formatWeight(kg, unit);
  const toast = useToast();
  const exName = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

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

  // ---- Personal records timeline ----
  const prEvents = useMemo(() => buildPrTimeline(workouts), [workouts]);
  const prThisMonth = prEvents.filter((p) => p.date >= startMonth.getTime()).length;

  // ---- Training consistency heatmap (last 18 weeks) ----
  const heatmapDays = useMemo(() => {
    const todayStart = startOfDay(now);
    const days = [];
    for (let i = 125; i >= 0; i--) days.push({ date: todayStart - i * 86400000, volume: 0 });
    const idx = new Map(days.map((d, i) => [d.date, i]));
    for (const w of workouts) {
      const dayStart = startOfDay(w.date);
      if (idx.has(dayStart)) days[idx.get(dayStart)].volume += workingVolume(w.sets);
    }
    const max = Math.max(1, ...days.map((d) => d.volume));
    return days.map((d) => ({
      ...d,
      level: d.volume === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((d.volume / max) * 4)))
    }));
  }, [workouts, now]);

  // ---- Rep range distribution (last 4 weeks) ----
  const repRangeData = useMemo(() => {
    const cutoff = now - 28 * 86400000;
    const buckets = { '1–5': 0, '6–9': 0, '10–14': 0, '15+': 0 };
    let total = 0;
    for (const w of workouts) {
      if (w.date < cutoff) continue;
      for (const s of w.sets) {
        if (!isWorking(s)) continue;
        total++;
        if (s.reps <= 5) buckets['1–5']++;
        else if (s.reps <= 9) buckets['6–9']++;
        else if (s.reps <= 14) buckets['10–14']++;
        else buckets['15+']++;
      }
    }
    return Object.entries(buckets).map(([label, count]) => ({
      label, count, pct: total ? Math.round((count / total) * 100) : 0
    }));
  }, [workouts, now]);

  // ---- Compare exercises ----
  const exercisesWithData = useMemo(() => (
    exercises
      .filter((e) => workouts.some((w) => w.sets.some((s) => s.exerciseId === e.id && isWorking(s))))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [exercises, workouts]);

  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const activeCompareA = compareA || exercisesWithData[0]?.id || '';
  const activeCompareB = compareB || exercisesWithData.find((e) => e.id !== activeCompareA)?.id || '';

  const compareData = useMemo(() => {
    if (!activeCompareA || !activeCompareB) return [];
    const a = new Map(e1rmSeries(workouts, activeCompareA).map((r) => [r.date, roundDisplay(toDisplay(r.e1rmKg, unit), unit)]));
    const b = new Map(e1rmSeries(workouts, activeCompareB).map((r) => [r.date, roundDisplay(toDisplay(r.e1rmKg, unit), unit)]));
    const dates = Array.from(new Set([...a.keys(), ...b.keys()])).sort((x, y) => x - y);
    return dates.map((d) => ({
      label: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      a: a.get(d),
      b: b.get(d)
    }));
  }, [workouts, activeCompareA, activeCompareB, unit]);

  // ---- Export / share ----
  const handleExportCSV = async () => {
    await downloadSetsCSV(unit);
    toast('CSV exported');
  };

  const handleShareSummary = async () => {
    const lines = [
      'Workout progress summary',
      `This week: ${thisWeek} workout${thisWeek === 1 ? '' : 's'}`,
      `This month: ${thisMonth} workout${thisMonth === 1 ? '' : 's'}`,
      `Current streak: ${streak} week${streak === 1 ? '' : 's'}`,
      `Total workouts logged: ${workouts.length}`
    ];
    if (prEvents.length) {
      lines.push('', 'Recent PRs:');
      for (const pr of prEvents.slice(0, 3)) {
        lines.push(`- ${exName.get(pr.exerciseId) || 'Exercise'}: ${fmt(pr.valueKg)} (${pr.kind === 'e1rm' ? 'est. 1RM' : 'top set'})`);
      }
    }
    const text = lines.join('\n');
    if (navigator.share) {
      try { await navigator.share({ text, title: 'Workout progress' }); } catch { /* user cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied to clipboard');
    } catch {
      toast('Could not copy — clipboard access is blocked', { tone: 'error' });
    }
  };

  return (
    <div className="p-3 space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="This week" value={thisWeek} />
        <StatTile label="This month" value={thisMonth} />
        <StatTile label="Streak" value={streak + 'w'} />
        <StatTile label="Total" value={workouts.length} />
      </div>

      <Section
        title="Personal records"
        right={prThisMonth > 0 ? <span className="text-xs text-success">{prThisMonth} this month</span> : null}
      >
        {prEvents.length === 0 ? (
          <EmptyChart msg="Log a few workouts to start tracking PRs." />
        ) : (
          <div>
            {prEvents.slice(0, 6).map((pr) => (
              <div key={pr.exerciseId + pr.date} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-b-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{exName.get(pr.exerciseId) || 'Exercise'}</div>
                  <div className="text-[10px] text-muted mt-0.5">{formatDate(pr.date)} · {pr.kind === 'e1rm' ? 'est. 1RM' : 'top set'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">{fmt(pr.valueKg)}</div>
                  {pr.deltaKg > 0 && <div className="text-[10px] text-success tabular-nums">+{fmt(pr.deltaKg)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

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

      <Section title="Training consistency" right={<span className="text-xs text-muted">Last 18 weeks</span>}>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(18, 1fr)', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', height: 84 }}>
          {heatmapDays.map((d) => (
            <div
              key={d.date}
              title={`${new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${d.volume > 0 ? fmt(d.volume) : 'rest day'}`}
              className="rounded-[3px]"
              style={{ background: heatmapColor(d.level) }}
            />
          ))}
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-2.5 text-[10px] text-muted">
          <span>less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <div key={l} className="w-[9px] h-[9px] rounded-[2px]" style={{ background: heatmapColor(l) }} />
          ))}
          <span>more</span>
        </div>
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

      <Section title="Rep range distribution" right={<span className="text-xs text-muted">Last 4 weeks</span>}>
        {repRangeData.every((r) => r.count === 0) ? (
          <EmptyChart msg="Not enough data yet." />
        ) : (
          <div className="space-y-2">
            {repRangeData.map((r) => (
              <div key={r.label} className="grid grid-cols-[44px_1fr_34px] gap-2 items-center">
                <span className="text-xs text-muted font-mono">{r.label}</span>
                <div className="h-2 bg-card rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: Math.max(2, r.pct) + '%' }} />
                </div>
                <span className="text-xs text-muted text-right">{r.pct}%</span>
              </div>
            ))}
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

      <Section title="Compare exercises">
        {exercisesWithData.length < 2 ? (
          <EmptyChart msg="Log at least 2 exercises to compare their trends." />
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <select
                value={activeCompareA}
                onChange={(e) => setCompareA(e.target.value)}
                className="flex-1 h-9 bg-card border border-border rounded-lg text-xs px-2 min-w-0"
              >
                {exercisesWithData.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <select
                value={activeCompareB}
                onChange={(e) => setCompareB(e.target.value)}
                className="flex-1 h-9 bg-card border border-border rounded-lg text-xs px-2 min-w-0"
              >
                {exercisesWithData.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            {compareData.length < 2 ? (
              <EmptyChart msg="Need at least 2 sessions between these exercises." />
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={compareData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                    <XAxis dataKey="label" stroke="#8a8a92" fontSize={11} />
                    <YAxis stroke="#8a8a92" fontSize={11} width={40} />
                    <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #2a2a2e', borderRadius: 8 }} labelStyle={{ color: '#8a8a92' }} formatter={(v) => [`${v} ${unit}`, 'Est. 1RM']} />
                    <Legend
                      formatter={(key) => key === 'a' ? (exName.get(activeCompareA) || 'A') : (exName.get(activeCompareB) || 'B')}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="a" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="b" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Export your data">
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="flex-1 h-11 rounded-xl border border-border flex items-center justify-center gap-2 text-sm font-medium active:bg-card"
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={handleShareSummary}
            className="flex-1 h-11 rounded-xl bg-accent text-white flex items-center justify-center gap-2 text-sm font-semibold"
          >
            <Share2 size={16} /> Share summary
          </button>
        </div>
      </Section>
    </div>
  );
}

function heatmapColor(level) {
  if (level === 0) return '#1c1c1f';
  const alpha = [0, 0.3, 0.55, 0.8, 1][level];
  return `color-mix(in srgb, #3b82f6 ${Math.round(alpha * 100)}%, #1c1c1f)`;
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
