import { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, RotateCcw } from 'lucide-react';
import {
  SegmentedPills, StaticPill, EmptyState, IconButton, GlassCard
} from '../ui/index.js';
import { PairedBars } from '../components/Chart.jsx';
import { color } from '../theme/tokens.js';
import {
  COMPARE_WINDOWS, WINDOWS, pillOptions, rangeFor, customRange, formatDayRange
} from '../services/timeframes.js';
import { compareTrainingPeriods, precedingRange } from '../services/trainingEvolution.js';
import { buildHighlights } from '../services/exerciseStats.js';
import { formatVolume } from '../utils/units.js';
import { formatDuration } from '../utils/date.js';

const DAY = 86400000;
const RANGE_OPTIONS = pillOptions(COMPARE_WINDOWS);

// A PERIOD IS A PRESET OR A PAIR OF DATES. Kept as one small object so the two
// pickers are the same component twice rather than two near-copies.
const defaultPeriod = (id) => ({ id, from: '', to: '' });

function resolvePeriod(period) {
  return period.id === 'custom' ? customRange(period.from, period.to) : rangeFor(period.id);
}

// With the year: comparing a block of last year against one from this year is
// most of what this screen is for, so the stamp has to say which year.
const dayRange = (range) => formatDayRange(range.start, range.end, { year: true });
const periodTitle = (period, range) =>
  period.id === 'custom' ? dayRange(range) : WINDOWS[period.id].label;

// The chip's headline, which is the same period said the way a person would
// say it out loud: "Last 4 weeks", not "4 Weeks". The dates underneath are the
// precise form, so the headline does not have to be.
const chipTitle = (period) =>
  period.id === 'custom' ? 'Custom range' : `Last ${WINDOWS[period.id].label.toLowerCase()}`;

// THE YEAR, ONLY WHEN IT IS NOT THIS ONE. The deeper labels on this screen
// always carry it, because comparing a block of last year against one from
// this year is most of what the screen is for — but in a half-width chip
// "Oct 27, 2026 – Nov 24, 2026" wraps to two lines to say a year the reader is
// already living in. It appears the moment either end leaves the current year,
// which is exactly when it starts carrying information.
function chipDates(range) {
  const thisYear = new Date().getFullYear();
  const crossesYears = new Date(range.start).getFullYear() !== thisYear
    || new Date(range.end).getFullYear() !== thisYear;
  return formatDayRange(range.start, range.end, { year: crossesYears });
}

// Declines read in plain ink. Only a gain takes the accent — a drop in volume
// after a deload block is information, not something to alarm somebody about.
function deltaText(c, format = (n) => String(Math.round(n))) {
  if (c.kind === 'new') return { text: 'new', tone: 'pr' };
  if (c.kind === 'none') return { text: '—', tone: 'flat' };
  if (c.kind === 'gone') return { text: 'none in B', tone: 'flat' };
  const sign = c.pct > 0 ? '+' : '−';
  const pct = Math.abs(c.pct).toFixed(0);
  if (pct === '0') return { text: 'no change', tone: 'flat' };
  return { text: `${sign}${pct}% (${sign}${format(Math.abs(c.abs))})`, tone: c.pct > 0 ? 'pr' : 'flat' };
}

// The percentage ALONE, for the headline card. The absolute belongs in the
// parenthetical everywhere else, but the card already prints both numbers in
// full — the new value at 32px and the old one as "was …" — so repeating the
// difference beside the percentage is the third time of asking.
function deltaPct(c) {
  if (c.kind === 'new') return { text: 'new', tone: 'pr' };
  if (c.kind === 'none') return { text: '—', tone: 'flat' };
  if (c.kind === 'gone') return { text: 'none now', tone: 'flat' };
  const pct = Math.abs(c.pct).toFixed(0);
  if (pct === '0') return { text: 'no change', tone: 'flat' };
  return { text: `${c.pct > 0 ? '+' : '−'}${pct}%`, tone: c.pct > 0 ? 'pr' : 'flat' };
}

const toneClass = (tone) => (tone === 'pr' ? 'text-pr' : 'text-ink-secondary');

const countFormat = (n) => Math.round(n).toLocaleString();
const minutesFormat = (min) => formatDuration(min * 60000);

// THE FOUR NUMBERS THE CARD COMPARES, and which four they are depends on
// whether the periods are the same length. Totals are the honest comparison
// when they are; per-week rates are the honest one when they are not, and
// putting the totals up top in that case would be a trap.
//
// Average session is last and conditional: it rests on the workout timer, and a
// history logged without it has no duration to average. A row reading "0m" is a
// claim about training that never happened.
function metricsFor(a, b, delta, equalLength) {
  const list = equalLength
    ? [
      { label: 'Volume', a: a.volumeKg, b: b.volumeKg, format: formatVolume, change: delta.volumeKg },
      { label: 'Workouts', a: a.workouts, b: b.workouts, format: countFormat, change: delta.workouts },
      { label: 'Exercises', a: a.exerciseCount, b: b.exerciseCount, format: countFormat, change: delta.exerciseCount }
    ]
    : [
      { label: 'Volume / week', a: a.volumePerWeek, b: b.volumePerWeek, format: formatVolume, change: delta.volumePerWeek },
      { label: 'Sessions / week', a: a.perWeek, b: b.perWeek, format: (n) => n.toFixed(1), change: delta.perWeek },
      { label: 'Exercises', a: a.exerciseCount, b: b.exerciseCount, format: countFormat, change: delta.exerciseCount }
    ];

  if (a.sessionsTimed > 0 || b.sessionsTimed > 0) {
    list.push({
      label: 'Avg session',
      a: a.avgSessionMin,
      b: b.avgSessionMin,
      format: minutesFormat,
      change: delta.avgSessionMin
    });
  }
  return list;
}

// COMPARE TWO PERIODS.
//
// A drill-down, not a dashboard section: this is a question you go and ask, not
// one the Progress page should answer at you every time it opens.
export default function TrainingEvolution({ workouts, exercises, onBack }) {
  const [periodB, setPeriodB] = useState(defaultPeriod('4w'));
  const [periodA, setPeriodA] = useState(defaultPeriod('4w'));
  // Period A defaults to the block immediately before B, which is the
  // comparison people actually mean by "am I training more than I was".
  const [matchPreceding, setMatchPreceding] = useState(true);

  // THE RANGES ARE MEMOIZED, NOT JUST THE COMPARISON. rangeFor() reads
  // Date.now() for a preset, so resolving on every render moves both ends by a
  // few milliseconds each time — which changes the memo keys below and makes
  // them recompute the whole comparison on every render. Resolving once per
  // period change pins the window instead.
  const rangeB = useMemo(
    () => resolvePeriod(periodB),
    [periodB.id, periodB.from, periodB.to]
  );
  const rangeA = useMemo(
    () => (matchPreceding ? (rangeB ? precedingRange(rangeB) : null) : resolvePeriod(periodA)),
    [matchPreceding, rangeB, periodA.id, periodA.from, periodA.to]
  );

  const result = useMemo(
    () => (rangeA && rangeB ? compareTrainingPeriods(workouts, exercises, rangeA, rangeB) : null),
    [workouts, exercises, rangeA, rangeB]
  );

  const highlights = useMemo(
    () => (rangeB ? buildHighlights(workouts, exercises, rangeB) : null),
    [workouts, exercises, rangeB]
  );

  const precedingDays = rangeB ? Math.round((rangeB.end - rangeB.start) / DAY) : null;

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center gap-sm pt-sm -ml-sm">
        <IconButton icon={ArrowLeft} label="Back to Progress" onClick={onBack} />
        <h1 className="text-body font-semibold text-ink truncate">Training evolution</h1>
      </div>

      {/* THE TWO PERIODS, SIDE BY SIDE AND NAMED, before anything is compared.
          The screen used to open on two stacked pickers with their headings
          above them, which meant the first thing you read was a control rather
          than the question. These say what is being held against what, in the
          order the numbers below read: B is the period you are asking about, A
          is what you are measuring it against. */}
      <div className="mt-lg grid grid-cols-2 gap-sm items-stretch">
        <RangeChip
          tag="B · Now"
          title={chipTitle(periodB)}
          sub={rangeB ? chipDates(rangeB) : 'Pick both dates'}
          emphasis
        />
        <RangeChip
          tag={matchPreceding ? 'A · Before' : 'A · Picked'}
          action={matchPreceding ? Pencil : RotateCcw}
          title={matchPreceding
            ? (precedingDays ? `Previous ${precedingDays} days` : 'The period before')
            : chipTitle(periodA)}
          sub={rangeA ? chipDates(rangeA) : 'Pick both dates'}
          onClick={() => setMatchPreceding((v) => !v)}
          actionLabel={matchPreceding
            ? 'Compare against a period you pick instead'
            : 'Compare against the period immediately before B'}
        />
      </div>

      <SegmentedPills
        className="mt-md"
        ariaLabel="Recent period (B)"
        size="sm"
        value={periodB.id}
        onChange={(id) => setPeriodB({ ...periodB, id })}
        options={RANGE_OPTIONS}
      />
      {periodB.id === 'custom' && <DateFields period={periodB} onChange={setPeriodB} />}

      {!matchPreceding && (
        <section className="mt-lg">
          <h2 className="text-micro font-semibold uppercase text-ink-tertiary">Compared with (A)</h2>
          <SegmentedPills
            className="mt-sm"
            ariaLabel="Compared with (A)"
            size="sm"
            value={periodA.id}
            onChange={(id) => setPeriodA({ ...periodA, id })}
            options={RANGE_OPTIONS}
          />
          {periodA.id === 'custom' && <DateFields period={periodA} onChange={setPeriodA} />}
        </section>
      )}

      {!rangeB || !rangeA ? (
        <EmptyState
          icon={ArrowLeft}
          title="Pick both dates"
          body="A custom period needs a start and an end, and the start has to come first."
        />
      ) : (
        <Comparison
          result={result}
          highlights={highlights}
          titleA={matchPreceding ? 'The period before' : periodTitle(periodA, rangeA)}
          titleB={periodTitle(periodB, rangeB)}
        />
      )}
    </div>
  );
}

// One period, stated: what it is called, and exactly which days it covers.
// Interactive only when there is something to switch — the B chip is driven by
// the pills right underneath it and tapping it would do nothing.
// THE AFFORDANCE IS AN ICON, NOT A WORD. "A · BEFORE" with "CHANGE" beside it
// read as the single phrase "before change" — two labels in the same micro
// uppercase, on the same line, in the same colour. A pencil cannot be misread
// as part of the tag, and the chip's own headline already says which mode it
// is in ("Previous 28 days" against "Last 6 weeks").
function RangeChip({ tag, title, sub, emphasis = false, action: Action, actionLabel, onClick }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-xs">
        <span className="text-micro font-semibold uppercase text-ink-tertiary">{tag}</span>
        {Action && <Action size={14} aria-hidden="true" className="shrink-0 text-ink-tertiary" />}
      </div>
      <p className="mt-sm text-body font-semibold text-ink">{title}</p>
      <p className="mt-xxs text-label font-regular text-ink-tertiary tabular">{sub}</p>
    </>
  );

  if (!onClick) {
    return (
      <GlassCard variant={emphasis ? 'card' : 'inset'} className="p-base">{body}</GlassCard>
    );
  }
  return (
    <GlassCard
      as="button"
      type="button"
      variant={emphasis ? 'card' : 'inset'}
      interactive
      onClick={onClick}
      aria-label={actionLabel}
      className="p-base text-left w-full"
    >
      {body}
    </GlassCard>
  );
}

function DateFields({ period, onChange }) {
  return (
    <div className="mt-md grid grid-cols-2 gap-sm">
      <label className="text-label text-ink-tertiary">
        From
        <input
          type="date"
          value={period.from}
          onChange={(e) => onChange({ ...period, from: e.target.value })}
          className="mt-1 w-full h-10 rounded-control bg-glass-inset border border-glass-border px-2 text-label text-ink"
        />
      </label>
      <label className="text-label text-ink-tertiary">
        To
        <input
          type="date"
          value={period.to}
          onChange={(e) => onChange({ ...period, to: e.target.value })}
          className="mt-1 w-full h-10 rounded-control bg-glass-inset border border-glass-border px-2 text-label text-ink"
        />
      </label>
    </div>
  );
}

function Comparison({ result, highlights, titleA, titleB }) {
  const { a, b, delta, flags, shape, repRange, muscle, exercises } = result;

  if (flags.emptyBoth) {
    return (
      <EmptyState
        icon={ArrowLeft}
        title="Nothing logged in either period"
        body="Both periods are empty, so there is nothing to compare. Pick a window that covers some training."
      />
    );
  }

  // Each caveat is stated once, in plain words, rather than blocking the
  // comparison. Comparing "last 3 months" with "last month" is a reasonable
  // question; it just needs saying that the days are counted twice.
  const notes = [];
  if (flags.identical) notes.push('Both periods are the same range, so every difference is zero by definition.');
  else if (flags.overlapping) notes.push('These periods share days, so sessions inside the overlap are counted in both.');
  if (flags.reversed) notes.push('Period A is the later of the two — the figures below still read A to B, in the order you picked.');
  if (!shape.equalLength) {
    notes.push(`The periods are different lengths (${Math.round(shape.daysA)} days against ${Math.round(shape.daysB)}), so the per-week rates are the fair comparison and the totals are not.`);
  }
  if (flags.emptyA) notes.push('Nothing was logged in period A, so every change below is new rather than a percentage.');
  if (flags.emptyB) notes.push('Nothing was logged in period B.');
  // The average session rests on the timer, so it has to say how many sessions
  // it actually measured whenever that is fewer than all of them.
  const untimed = (a.workouts - a.sessionsTimed) + (b.workouts - b.sessionsTimed);
  if ((a.sessionsTimed > 0 || b.sessionsTimed > 0) && untimed > 0) {
    notes.push(`${untimed} ${untimed === 1 ? 'session was' : 'sessions were'} logged without the timer, so the average session length is taken from the ${a.sessionsTimed + b.sessionsTimed} that were timed.`);
  }

  return (
    <>
      {notes.length > 0 && (
        <div className="mt-lg flex flex-col gap-sm">
          {notes.map((n) => (
            <p key={n} className="text-label font-regular text-ink-tertiary">{n}</p>
          ))}
        </div>
      )}

      {/* ONE CARD, FOUR METRICS, TWO BARS EACH.
          This used to be a four-column table — label, A, B, delta — at 13px,
          which put the two numbers being compared in adjacent columns of
          identical type and left the reader to do the subtraction with their
          eyes. The card gives each metric the new value at full size, the
          change as a single percentage, and the pair of bars that shows the
          size of that change without reading anything at all. */}
      <MetricCard
        metrics={metricsFor(a, b, delta, shape.equalLength)}
        titleA={titleA}
        titleB={titleB}
      />

      <Block title="Rep ranges" subtitle="Share of working sets in each period.">
        <MixBars rows={repRange} valueKey="count" titleA={titleA} titleB={titleB} />
      </Block>

      {muscle.length > 0 && (
        <Block title="Muscle split" subtitle="Share of working volume in each period.">
          {/* Biggest share in either period first. pairDistribution keeps the
              order it met the labels in, which is period A's — so without this
              the group that dominated B could sit halfway down the list. Rep
              ranges deliberately keep their fixed bucket order instead. */}
          <MixBars
            rows={[...muscle].sort((x, y) => Math.max(y.a.pct, y.b.pct) - Math.max(x.a.pct, x.b.pct)).slice(0, 8)}
            valueKey="volumeKg"
            format={formatVolume}
            titleA={titleA}
            titleB={titleB}
          />
        </Block>
      )}

      <Block title="What you trained">
        <Churn title="Started" rows={exercises.introduced} empty="Nothing new in period B." />
        <Churn title="Stopped" rows={exercises.dropped} empty="Nothing from period A was dropped." className="mt-lg" />
        <KeptList rows={exercises.kept} className="mt-lg" />
      </Block>

      {highlights && <Highlights highlights={highlights} titleB={titleB} />}
    </>
  );
}

function MetricCard({ metrics, titleA, titleB }) {
  return (
    <>
      <GlassCard className="mt-lg p-base">
        {metrics.map((m, i) => (
          <Metric key={m.label} metric={m} first={i === 0} titleA={titleA} titleB={titleB} />
        ))}
      </GlassCard>
      <p className="mt-sm text-micro font-semibold uppercase text-ink-tertiary">
        A — {titleA} · B — {titleB}
      </p>
    </>
  );
}

function Metric({ metric, first, titleA, titleB }) {
  const { label, a, b, format, change } = metric;
  const d = deltaPct(change);
  // Scaled to whichever period is larger, so the bigger of the two always runs
  // the full width and the other one is read as a fraction of it. A shared
  // scale across metrics would be meaningless — kilograms against session
  // counts — which is why this is per-metric and the share bars below are not.
  const max = Math.max(a, b, 0) || 1;
  const width = (v) => (v > 0 ? `${Math.max(1.5, (v / max) * 100)}%` : '0%');

  return (
    <div className={first ? '' : 'mt-lg pt-lg border-t border-hairline'}>
      <div className="flex items-baseline justify-between gap-md">
        <h3 className="text-body font-regular text-ink">{label}</h3>
        <span className={`text-body font-semibold tabular ${toneClass(d.tone)}`}>{d.text}</span>
      </div>

      <p className="mt-xs text-title font-semibold text-ink tabular">
        <span className="sr-only">{titleB}: </span>{format(b)}
      </p>

      <div aria-hidden="true" className="mt-md flex flex-col gap-xxs">
        <span className="block h-1.5 rounded-full" style={{ width: width(a), background: color.data }} />
        <span className="block h-1.5 rounded-full" style={{ width: width(b), background: color.dataStrong }} />
      </div>

      <p className="mt-sm text-label font-regular text-ink-tertiary tabular">
        <span className="sr-only">{titleA} </span>was {format(a)}
      </p>
    </div>
  );
}

// A SHARE CAN FALL WHILE THE WORK RISES, and that pairing is the most
// confusing thing on this screen without a word of explanation: training the
// same triceps volume alongside a new leg day drops their share by thirty
// points while the kilograms go up. The bare "−36 pts" reads as a collapse.
function shareNote(row) {
  const grew = row.value.kind === 'new' || row.value.abs > 0;
  const shrank = row.value.kind === 'gone' || row.value.abs < 0;
  if (row.pctPointDelta < 0 && grew) return 'smaller share of more work';
  if (row.pctPointDelta > 0 && shrank) return 'bigger share of less work';
  return null;
}

// Two bars per label, A above B, so the shift is read as a shape rather than
// from a signed number — and on ONE scale across the whole list, so the row
// that holds most of the training is the longest bar on screen.
function MixBars({ rows, valueKey, format, titleA, titleB }) {
  const withAny = rows.filter((r) => r.a[valueKey] > 0 || r.b[valueKey] > 0);
  if (!withAny.length) return <p className="text-label font-regular text-ink-tertiary">Nothing logged in either period.</p>;

  const barRows = withAny.map((row) => {
    const pts = Math.round(row.pctPointDelta);
    const note = shareNote(row);
    return {
      key: row.label,
      label: row.label,
      a: row.a.pct,
      b: row.b.pct,
      right: pts === 0 ? 'same' : `${pts > 0 ? '+' : '−'}${Math.abs(pts)} pts`,
      tone: pts > 0 ? 'pr' : 'flat',
      // The rep-range buckets carry no caption: the share and the change are
      // the whole story and "412 sets → 486 sets" under every row is the noise
      // this redesign exists to remove. The muscle split keeps one, because
      // there the share and the volume can and do move in opposite directions.
      note: format
        ? `${format(row.a[valueKey])} → ${format(row.b[valueKey])}${note ? ` · ${note}` : ''}`
        : note
    };
  });

  return (
    <PairedBars
      rows={barRows}
      ariaLabel="Share of each period"
      srLabel={(r) => `${r.label}, ${titleA} ${Math.round(r.a)}% to ${titleB} ${Math.round(r.b)}%`}
    />
  );
}

function Block({ title, subtitle, children }) {
  return (
    <section className="mt-xxl">
      <h2 className="text-micro font-semibold uppercase text-ink-tertiary">{title}</h2>
      {subtitle && <p className="text-label font-regular text-ink-tertiary mt-xs">{subtitle}</p>}
      <div className="mt-md">{children}</div>
    </section>
  );
}

function Churn({ title, rows, empty, className = '' }) {
  return (
    <div className={className}>
      <h3 className="text-label font-semibold text-ink">{title}</h3>
      {!rows.length ? (
        <p className="mt-xs text-label font-regular text-ink-tertiary">{empty}</p>
      ) : (
        <ul className="mt-xs flex flex-col">
          {rows.slice(0, 8).map((row) => (
            <li key={row.exercise.id} className="py-xs flex items-center gap-md border-b border-hairline last:border-b-0">
              <span className="flex-1 min-w-0 text-label font-regular text-ink truncate">{row.exercise.name}</span>
              <span className="shrink-0 text-label font-regular text-ink-tertiary tabular">
                {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KeptList({ rows, className = '' }) {
  return (
    <div className={className}>
      <h3 className="text-label font-semibold text-ink">Kept</h3>
      {!rows.length ? (
        <p className="mt-xs text-label font-regular text-ink-tertiary">No lift appears in both periods.</p>
      ) : (
        <ul className="mt-xs flex flex-col">
          {rows.slice(0, 10).map((row) => {
            const d = deltaText(row.volumeKg, formatVolume);
            return (
              <li key={row.exercise.id} className="py-xs flex items-center gap-md border-b border-hairline last:border-b-0">
                <span className="flex-1 min-w-0 text-label font-regular text-ink truncate">{row.exercise.name}</span>
                <span className="shrink-0 text-label font-regular text-ink-tertiary tabular">
                  {row.sessions.from} → {row.sessions.to}
                </span>
                <span className={`shrink-0 w-[108px] text-right text-label font-regular tabular ${toneClass(d.tone)}`}>
                  {d.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// TRAINING INTELLIGENCE v1. Every line is a sentence the service generated from
// numbers it computed, and each one says what it is based on.
function Highlights({ highlights, titleB }) {
  const { improving, steady, sentences } = highlights;
  const nothing = !improving.length && !steady.length && !sentences.needMoreData && !sentences.tooVariable;

  return (
    <Block title="Highlights" subtitle={`Strength trends across period B — ${titleB}.`}>
      {nothing ? (
        <p className="text-label font-regular text-ink-tertiary">
          No lift in this period has enough sessions to call a trend yet.
        </p>
      ) : (
        <div className="flex flex-col gap-md">
          {improving.length > 0 && (
            <div>
              <StaticPill tone="pr">Improving</StaticPill>
              <ul className="mt-sm flex flex-col gap-xs">
                {improving.map((h) => (
                  <li key={h.exercise.id} className="text-label font-regular text-ink tabular">{h.sentence}</li>
                ))}
              </ul>
            </div>
          )}
          {steady.length > 0 && (
            <div>
              <StaticPill>Holding steady</StaticPill>
              <ul className="mt-sm flex flex-col gap-xs">
                {steady.map((h) => (
                  <li key={h.exercise.id} className="text-label font-regular text-ink-secondary tabular">{h.sentence}</li>
                ))}
              </ul>
            </div>
          )}
          {sentences.tooVariable && (
            <p className="text-label font-regular text-ink-tertiary">{sentences.tooVariable}</p>
          )}
          {sentences.needMoreData && (
            <p className="text-label font-regular text-ink-tertiary">{sentences.needMoreData}</p>
          )}
        </div>
      )}
    </Block>
  );
}
