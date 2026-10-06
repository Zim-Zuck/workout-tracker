import { evaluateAchievements } from '../services/achievements.js';

// Compact achievement strip for a profile. Unearned ones stay visible but
// dimmed, with progress — "17/50 workouts" is motivating in a way that hiding
// the badge entirely is not.
//
// The badges are LUCIDE ICONS, not emoji. Emoji render at a different size,
// weight and colour on every platform, they cannot take the ink tokens, and a
// grid of them reads as a sticker sheet rather than as part of this app.
export default function AchievementsRow({ stats, lifts, title = 'Achievements' }) {
  const items = evaluateAchievements(stats, lifts);
  const earnedCount = items.filter((a) => a.earned).length;

  return (
    <section className="bg-glass border border-glass-border rounded-card p-base">
      <header className="flex items-baseline justify-between gap-sm">
        <h2 className="text-micro font-semibold uppercase text-ink-tertiary">{title}</h2>
        <span className="text-micro font-semibold tracking-normal text-ink-tertiary tabular">
          {earnedCount} of {items.length}
        </span>
      </header>

      {/* One tile per achievement, three to a row, 12px apart — the same gap
          every other grid of repeated things in the app uses. */}
      <ul className="mt-md grid grid-cols-3 gap-md">
        {items.map((a) => {
          const Icon = a.icon;
          const pct = a.target ? Math.min(100, (a.current / a.target) * 100) : 0;
          const fmt = a.format || ((v) => String(Math.round(v)));
          return (
            <li
              key={a.id}
              className="flex flex-col items-center text-center rounded-row border border-glass-inset-border
                         bg-glass-inset px-sm py-md"
              title={a.description}
            >
              <Icon
                size={22}
                strokeWidth={2}
                aria-hidden="true"
                className={a.earned ? 'text-ink' : 'text-ink-tertiary opacity-50'}
              />
              <span className={`mt-sm text-micro font-semibold tracking-normal leading-tight
                                ${a.earned ? 'text-ink-secondary' : 'text-ink-tertiary'}`}>
                {a.name}
              </span>

              {/* Earned shows what it took; unearned shows how far off you are.
                  Both are one line, so the tiles stay the same height. */}
              {a.earned ? (
                <span className="mt-xs text-micro font-regular tracking-normal text-ink-tertiary leading-tight">
                  {a.description}
                </span>
              ) : (
                <>
                  <span className="mt-xs text-micro font-regular tracking-normal text-ink-tertiary tabular leading-tight">
                    {fmt(a.current)} / {fmt(a.target)}
                  </span>
                  <span className="block w-full h-1 mt-sm rounded-full bg-glass-inset overflow-hidden">
                    <span className="block h-full rounded-full bg-data-strong" style={{ width: `${pct}%` }} />
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
