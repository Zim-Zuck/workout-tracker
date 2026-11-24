import { useMemo } from 'react';
import { ArrowLeft, Milestone } from 'lucide-react';
import { milestonesFor } from '../services/milestones.js';
import { GlassCard, IconButton, EmptyState } from '../ui/index.js';

// MILESTONES: ONE THING YOU ARE WALKING TOWARDS, AND A SHELF OF WHAT YOU PASSED.
//
// A DRILL-DOWN, NOT A DASHBOARD SECTION. This started as a three-line row under
// the lifetime tiles, became a section in the redesign, and is now a screen of
// its own behind a single row — the same shape as Training evolution, and for
// the same reason. Lifetime milestones are something you go and look at, not
// something the Progress dashboard should put in front of you every time you
// open it to check last week's volume. The dashboard was carrying too much.
//
// The screen is built around the ONE question the old row answered worst. The
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

export default function MilestonesScreen({ workouts, onBack }) {
  const { achieved, next, bestStreak } = useMemo(() => milestonesFor(workouts), [workouts]);

  // Oldest first — see the note above. milestonesFor returns newest first
  // because the old row wanted the three most recent.
  const reached = useMemo(() => [...achieved].reverse(), [achieved]);
  const reachedDates = useMemo(() => datesFor(reached), [reached]);

  // next is sorted by progress, so [0] is the one closest to falling and the
  // rest are the other ladders.
  const upcoming = next[0] || null;
  const ahead = next.slice(1);

  // Unreachable in practice — the row that opens this screen hides itself on
  // the same condition, and the first workout is on the ladder so anybody who
  // has trained has a tile. Here anyway, because a drill-down that can render
  // an empty screen is a drill-down that one day will.
  const nothing = !reached.length && (!upcoming || upcoming.current === 0);

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center gap-sm pt-sm -ml-sm">
        <IconButton icon={ArrowLeft} label="Back to Progress" onClick={onBack} />
        <h1 className="text-body font-semibold text-ink truncate">Milestones</h1>
      </div>

      {nothing ? (
        <EmptyState
          icon={Milestone}
          title="No milestones yet"
          body="Finish your first session and the first one lands the same day."
        />
      ) : (
        <>
          {upcoming && <NextMilestone milestone={upcoming} bestStreak={bestStreak} />}

          {reached.length > 0 && (
            <>
              <h2 className="mt-xxl text-micro font-semibold uppercase text-ink-tertiary">
                Reached · <span className="tabular">{reached.length}</span>
              </h2>
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
              <h2 className="mt-xxl text-micro font-semibold uppercase text-ink-tertiary">Ahead</h2>
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
        </>
      )}
    </div>
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
    <GlassCard className="mt-lg p-base">
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
