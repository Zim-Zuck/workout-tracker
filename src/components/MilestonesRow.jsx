import { useMemo } from 'react';
import { milestonesFor } from '../services/milestones.js';

// MILESTONES: A COMPACT ROW, NOT A SECTION.
//
// Lifetime milestones belong next to the lifetime stat tiles — the same part of
// the screen that already answers "how much have I done in total" — so this is
// one strip under them, deliberately not a dashboard section with a heading, a
// chart and a drill-down. The Progress dashboard stays compact.
//
// NO CELEBRATION CHROME. No confetti, no badges, no trophies, no colour. A
// milestone is a record of something that happened on a particular day, and the
// copy says exactly that and nothing more: "100 workouts · 12 Mar 2026". The
// achievement badges on Profile are the place for icons; this is a log line.
//
// Dates are formatted HERE, not in milestones.js, which stays locale-free and
// therefore testable. Same month/day/year form the Evolution screen uses.
const RECENT_LIMIT = 3;

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function MilestonesRow({ workouts }) {
  const { achieved, next, bestStreak } = useMemo(() => milestonesFor(workouts), [workouts]);

  const recent = achieved.slice(0, RECENT_LIMIT);
  // next is sorted by progress, so [0] is the one closest to falling.
  const upcoming = next[0] || null;

  // Nothing reached and nothing started is not a row worth the space it takes:
  // a brand-new user would see four zeroed progress bars and learn nothing.
  if (!recent.length && (!upcoming || upcoming.current === 0)) return null;

  return (
    <section aria-labelledby="milestones-heading" className="mt-lg">
      <h2 id="milestones-heading" className="text-micro font-semibold uppercase text-ink-tertiary">
        Milestones
      </h2>

      {recent.length > 0 && (
        <ul className="mt-sm space-y-xxs">
          {recent.map((m) => (
            <li
              key={`${m.category}-${m.threshold}`}
              className="flex items-baseline gap-xs text-label font-regular leading-snug"
            >
              <span className="text-ink-secondary">{m.label}</span>
              <span aria-hidden="true" className="text-ink-tertiary">·</span>
              <span className="text-ink-tertiary tabular">
                <span className="sr-only">reached </span>{fmtDate(m.date)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {upcoming && (
        <p className={`text-label font-regular text-ink-tertiary leading-snug ${recent.length ? 'mt-xs' : 'mt-sm'}`}>
          Next: <span className="text-ink-secondary">{upcoming.label}</span>
          {' — '}
          <span className="tabular">{upcoming.progressLabel}</span>
          {/* A streak that has lapsed is measured from today, not from the best
              ever, so the line has to say which number it is counting from or
              it reads as having lost a milestone already earned. */}
          {upcoming.lapsed && (
            <span> (from your current {upcoming.current}
              {upcoming.current === 1 ? ' week' : ' weeks'}; your best was {bestStreak})
            </span>
          )}
        </p>
      )}
    </section>
  );
}
