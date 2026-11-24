import { useMemo } from 'react';
import { milestonesFor } from '../services/milestones.js';
import { GlassCard } from '../ui/index.js';

// MILESTONES: ONE THING YOU ARE WALKING TOWARDS, AND A SHELF OF WHAT YOU PASSED.
//
// This replaces the three-line row that used to sit under the lifetime tiles.
// That row was compact and it was unreadable: three "label · date" lines and a
// fourth sentence about what was next, all at 13px, all in the same grey, with
// the one number a person actually wants — how far away the next one is —
// buried in the middle of the longest line.
//
// So the section is built around the ONE question the row answered worst. The
// next milestone gets a card, a headline, a bar and both of its endpoints. The
// ones already reached become a shelf of tiles, because a milestone is a thing
// you collected and a list of dates does not feel like anything. Everything
// else — the other three ladders, each months away — goes last, as a quiet
// list, because that is exactly how much attention they are worth.
//
// STILL NO CELEBRATION CHROME. No confetti, no trophies, no colour. A tile is a
// number, a word and the day it happened. The achievement badges on Profile are
// where icons live; this is still a log, just one you can read.
//
// ORDER ON THE SHELF IS OLDEST FIRST, which is the opposite of the row it
// replaces. A list of three wants the newest at the top; a shelf of a dozen
// wants to be a timeline you read left to right, and it ends on the most recent
// tile, which is the one the eye lands on last.
//
// Dates are formatted HERE, not in milestones.js, which stays locale-free and
// therefore testable.

// The year is printed on the first tile of each year and then suppressed until
// the year changes. A shelf where every tile says 2026 is a shelf where the one
// tile from 2025 does not stand out, which is the only time the year matters.
function datesFor(rows) {
  let lastYear = null;
  return rows.map((m) => {
    const year = new Date(m.date).getFullYear();
    const withYear = year !== lastYear;
    lastYear = year;
    return new Date(m.date).toLocaleDateString(
      undefined,
      withYear
        ? { month: 'short', day: 'numeric', year: 'numeric' }
        : { month: 'short', day: 'numeric' }
    );
  });
}

export default function MilestonesSection({ workouts }) {
  const { achieved, next, bestStreak } = useMemo(() => milestonesFor(workouts), [workouts]);

  // Oldest first — see the note above. milestonesFor returns newest first
  // because the old row wanted the three most recent.
  const reached = useMemo(() => [...achieved].reverse(), [achieved]);
  const reachedDates = useMemo(() => datesFor(reached), [reached]);

  // next is sorted by progress, so [0] is the one closest to falling and the
  // rest are the other ladders.
  const upcoming = next[0] || null;
  const ahead = next.slice(1);

  // Nothing reached and nothing started is not a section worth the space it
  // takes: a brand-new user would see four zeroed progress bars and learn
  // nothing.
  if (!reached.length && (!upcoming || upcoming.current === 0)) return null;

  return (
    <section aria-labelledby="milestones-heading" className="mt-xl">
      <h2 id="milestones-heading" className="text-body font-semibold text-ink">
        Milestones
      </h2>

      {upcoming && <NextMilestone milestone={upcoming} bestStreak={bestStreak} />}

      {reached.length > 0 && (
        <>
          <h3 className="mt-xl text-micro font-semibold uppercase text-ink-tertiary">
            Reached · <span className="tabular">{reached.length}</span>
          </h3>
          <ul className="mt-md grid grid-cols-2 gap-sm">
            {reached.map((m, i) => (
              <ReachedTile
                key={`${m.category}-${m.threshold}`}
                milestone={m}
                date={reachedDates[i]}
              />
            ))}
          </ul>
        </>
      )}

      {ahead.length > 0 && (
        <>
          <h3 className="mt-xl text-micro font-semibold uppercase text-ink-tertiary">Ahead</h3>
          <ul className="mt-sm flex flex-col">
            {ahead.map((m) => (
              <li
                key={m.category}
                className="py-md flex items-baseline gap-md border-b border-hairline first:border-t"
              >
                <span className="flex-1 min-w-0 text-body font-regular text-ink">{m.label}</span>
                <span className="shrink-0 text-label font-regular text-ink-tertiary tabular">
                  {m.progressLabel}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// THE ONE YOU ARE WALKING TOWARDS.
//
// Both endpoints are printed under the bar. A bar with no numbers on it is a
// decoration: "87 … 100" is what makes the fill mean something, and it is the
// pair of numbers that answers "how close am I" without arithmetic.
function NextMilestone({ milestone, bestStreak }) {
  const { label, progressLabel, etaLabel, pct, current, threshold, lapsed } = milestone;

  return (
    <GlassCard className="mt-md p-base">
      <p className="text-micro font-semibold uppercase text-ink-tertiary">Next milestone</p>
      <p className="mt-xs text-title font-semibold text-ink tabular">{label}</p>

      <p className="mt-xs text-label font-regular text-ink-secondary">
        <span className="tabular">{progressLabel}</span>
        {/* Dropped entirely when there is no recent training to extrapolate
            from. "At your pace" with no pace is worse than silence. */}
        {etaLabel && <> · {etaLabel} at your pace</>}
      </p>

      {/* A streak that has lapsed is measured from today, not from the best
          ever, so the line has to say which number it is counting from or it
          reads as having lost a milestone already earned. */}
      {lapsed && (
        <p className="mt-xs text-label font-regular text-ink-tertiary">
          From your current {current} {current === 1 ? 'week' : 'weeks'} — your best was {bestStreak}.
        </p>
      )}

      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${progressLabel}`}
        className="mt-base h-2 rounded-full bg-glass-inset overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-base ease-out"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      <div aria-hidden="true" className="mt-xs flex items-baseline justify-between">
        <span className="text-label font-regular text-ink-tertiary tabular">
          {current.toLocaleString()}
        </span>
        <span className="text-label font-regular text-ink-tertiary tabular">
          {threshold.toLocaleString()}
        </span>
      </div>
    </GlassCard>
  );
}

// A tile is a number, the thing it counts, and the day it happened. The number
// carries its own unit ("4w", "50t") so the word underneath never repeats it.
function ReachedTile({ milestone, date }) {
  return (
    <li>
      <GlassCard variant="inset" className="h-full p-base flex flex-col">
        <p className="text-title font-semibold text-ink tabular">{milestone.shortValue}</p>
        <p className="mt-auto pt-md text-label font-regular text-ink">{milestone.subject}</p>
        <p className="text-label font-regular text-ink-tertiary tabular">
          <span className="sr-only">reached </span>{date}
        </p>
      </GlassCard>
    </li>
  );
}
