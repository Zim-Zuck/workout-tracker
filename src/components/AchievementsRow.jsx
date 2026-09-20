import { evaluateAchievements } from '../services/achievements.js';

// Compact achievement strip for a profile. Unearned ones stay visible but
// dimmed, with progress — "17/50 workouts" is motivating in a way that hiding
// the badge entirely is not.
export default function AchievementsRow({ stats, lifts, unit, title = 'Achievements' }) {
  const items = evaluateAchievements(stats, lifts);
  const earnedCount = items.filter((a) => a.earned).length;

  return (
    <section className="bg-surface border border-border rounded-2xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-muted">{earnedCount} of {items.length}</span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((a) => {
          const pct = a.target ? Math.min(100, (a.current / a.target) * 100) : 0;
          const fmt = a.format ? (v) => a.format(v, unit) : (v) => String(Math.round(v));
          return (
            <li
              key={a.id}
              className={`rounded-xl border p-2 text-center ${
                a.earned ? 'border-warn/40 bg-warn/10' : 'border-border bg-card'
              }`}
            >
              <span className={`text-xl block leading-none ${a.earned ? '' : 'grayscale opacity-40'}`} aria-hidden="true">
                {a.icon}
              </span>
              <span className={`text-[11px] font-semibold block mt-1.5 leading-tight ${
                a.earned ? 'text-warn' : 'text-muted'
              }`}>
                {a.name}
              </span>
              {a.earned ? (
                <span className="text-[10px] text-muted block mt-0.5 leading-tight">{a.description}</span>
              ) : (
                <>
                  <span className="text-[10px] text-muted block mt-0.5 tabular-nums">
                    {fmt(a.current)} / {fmt(a.target)}
                  </span>
                  <span className="block h-1 mt-1 rounded-full bg-border overflow-hidden">
                    <span className="block h-full bg-muted" style={{ width: `${pct}%` }} />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
