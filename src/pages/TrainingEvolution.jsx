import { useMemo, useState } from 'react';
import {
  ArrowLeft, Pencil, RotateCcw, TrendingUp, Minus, ChevronDown, Shuffle
} from 'lucide-react';
import {
  SegmentedPills, SegmentedTrack, StaticPill, EmptyState, IconButton, GlassCard, BodyPair,
  SectionCard, CompareLegend, ChangeChip, StackedBar, ExpandableList
} from '../ui/index.js';
import { color } from '../theme/tokens.js';
import {
  COMPARE_WINDOWS, WINDOWS, pillOptions, rangeFor, customRange, formatDayRange
} from '../services/timeframes.js';
import { compareTrainingPeriods, precedingRange } from '../services/trainingEvolution.js';
import { buildHighlights } from '../services/exerciseStats.js';
import { regionsFor, groupForRegion } from '../services/anatomy.js';
import { buildVerdict, classifyVolumeTrend, summarizeDataGaps } from '../services/evolutionNarrative.js';
import { buildFunFacts } from '../services/funFacts.js';
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
  const [periodB, setPeriodB] = useState(defaultPeriod('1w'));
  const [periodA, setPeriodA] = useState(defaultPeriod('1w'));
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
          workouts={workouts}
          exerciseLibrary={exercises}
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

function Comparison({ result, highlights, workouts, exerciseLibrary, titleA, titleB }) {
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

      {/* Keyed by the compared ranges so a fresh period starts back on the
          verdict (fact #1) rather than wherever the tap cycle had landed. */}
      <FunFactCard
        key={`${result.a.start}-${result.a.end}-${result.b.start}-${result.b.end}`}
        result={result}
        workouts={workouts}
        exerciseLibrary={exerciseLibrary}
      />

      <RepRangesCard repRange={repRange} titleA={titleA} titleB={titleB} />

      {muscle.length > 0 && (
        <MuscleSplitCard muscle={muscle} titleA={titleA} titleB={titleB} />
      )}

      <WhatYouTrainedCard exercises={exercises} />

      {highlights && <HighlightsCard highlights={highlights} delta={delta} titleB={titleB} />}
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

// A hex colour at a given opacity, as an rgba() string. The rep-range and
// muscle-split bars need several DISTINCT shades of the same two colours
// (muted ink for "before", warm accent for "now") rather than several
// different hues — varying lightness instead of hue is what keeps four
// adjacent segments tellable apart for a colour-blind reader, not just for
// everyone else.
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// FUN FACT, directly under the summary card. The first fact is always the
// plain-English verdict for whichever two periods are on screen (the "so
// what" of everything above it); tapping cycles into all-time trivia that no
// chart on this screen could show at a glance — a heaviest set, a streak, a
// weekday you've never once trained on. The index resets to the verdict
// whenever the compared periods change, because this component gets a fresh
// `key` from them (see Comparison) and mounts clean.
function FunFactCard({ result, workouts, exerciseLibrary }) {
  const [index, setIndex] = useState(0);
  const facts = useMemo(() => buildFunFacts(workouts, exerciseLibrary), [workouts, exerciseLibrary]);
  const items = useMemo(() => [buildVerdict(result), ...facts], [result, facts]);
  const current = items[index % items.length];

  return (
    <GlassCard
      as="button"
      type="button"
      interactive
      onClick={() => setIndex((i) => (i + 1) % items.length)}
      aria-label={`Fun fact, ${(index % items.length) + 1} of ${items.length}. Tap for another.`}
      className="mt-lg p-lg text-left w-full"
    >
      <div className="flex items-center justify-between gap-sm">
        <span className="text-micro font-semibold uppercase text-ink-tertiary">Fun fact</span>
        <Shuffle size={14} strokeWidth={2.4} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
      </div>
      {/* Keying the paragraph by index restarts the rise animation on every
          tap, which is the only confirmation a reader gets that the tap
          landed — the text itself can look similar fact to fact. */}
      <p key={index} className="mt-sm text-body font-regular text-ink anim-rise">{current}</p>
    </GlassCard>
  );
}

const REP_RANGE_BEFORE_ALPHA = [0.82, 0.58, 0.38, 0.22];
const REP_RANGE_NOW_ALPHA = [1, 0.78, 0.56, 0.36];

// TWO STACKED BARS, ONE SCALE EACH. Each bar is its own period's working sets
// at 100%, split into the four rep-range buckets — the shape of the split is
// the point, not how the two periods' totals compare (the summary card
// already covers totals). Tapping a bucket, on the bar or in the legend row
// below, pins the exact numbers in a small readout rather than making anyone
// eyeball two bar lengths against each other.
function RepRangesCard({ repRange, titleA, titleB }) {
  const [focused, setFocused] = useState(null);
  const totalA = repRange.reduce((s, r) => s + r.a.count, 0);
  const totalB = repRange.reduce((s, r) => s + r.b.count, 0);

  const toggle = (label) => setFocused((cur) => (cur === label ? null : label));

  const beforeSegments = repRange.map((r, i) => ({
    key: r.label, label: r.label, value: r.a.pct,
    color: hexToRgba(color.ink, REP_RANGE_BEFORE_ALPHA[i]),
    srLabel: `${titleA}, ${r.label} reps, ${r.a.pct}%`
  }));
  const nowSegments = repRange.map((r, i) => ({
    key: r.label, label: r.label, value: r.b.pct,
    color: hexToRgba(color.pr, REP_RANGE_NOW_ALPHA[i]),
    srLabel: `${titleB}, ${r.label} reps, ${r.b.pct}%`
  }));

  const focusedRow = repRange.find((r) => r.label === focused);

  return (
    <SectionCard
      title="Rep ranges"
      subtitle="How your working sets split across rep ranges."
      legend={<CompareLegend labelBefore={titleA} labelNow={titleB} />}
    >
      {totalA === 0 && totalB === 0 ? (
        <p className="text-label font-regular text-ink-secondary">Nothing logged in either period.</p>
      ) : (
        <>
          <div className="flex flex-col gap-sm">
            <StackedBar
              segments={beforeSegments}
              ariaLabel={`Rep range split, ${titleA}`}
              selectedKey={focused}
              onSegmentClick={(s) => toggle(s.key)}
            />
            <StackedBar
              segments={nowSegments}
              ariaLabel={`Rep range split, ${titleB}`}
              selectedKey={focused}
              onSegmentClick={(s) => toggle(s.key)}
            />
          </div>

          <div className="mt-base grid grid-cols-4 gap-xs">
            {repRange.map((r) => {
              const pts = Math.round(r.pctPointDelta);
              const selected = focused === r.label;
              return (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(r.label)}
                  className={`flex flex-col items-center gap-xxs py-sm rounded-control text-center
                              transition-colors duration-fast ease-out
                              ${selected ? 'bg-glass-pressed' : 'active:bg-glass-pressed'}`}
                >
                  <span className="text-micro font-semibold uppercase text-ink-tertiary">{r.label} reps</span>
                  <span className="text-heading font-semibold text-ink tabular">{r.b.pct}%</span>
                  <ChangeChip kind={pts === 0 ? 'none' : 'change'} pct={pts} size="sm" />
                </button>
              );
            })}
          </div>

          {focusedRow && (
            <p className="mt-sm text-label font-regular text-ink-secondary anim-rise">
              {focusedRow.label} reps — {titleA} {focusedRow.a.pct}% → {titleB} {focusedRow.b.pct}%
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}

// THE BODY, NOT THE NAME. A reader scanning a dozen rows of muscle-group text
// has to translate every label into a mental picture anyway — the figure
// already used on Today and the live header does that translation for them,
// at a glance, before the exact numbers in the list below. Tapping a region
// here or a row below highlights both, through the same group name.
//
// Tiers are relative to this period alone: a group holding half of the top
// group's share or more reads as primary, the rest as secondary, the same
// split the live session figure draws between a lift's main muscle and the
// ones it only assists.
function MuscleSplitCard({ muscle, titleA, titleB }) {
  const [mode, setMode] = useState('volume');
  const [focusedGroup, setFocusedGroup] = useState(null);

  const withVolume = muscle.filter((r) => r.a.volumeKg > 0 || r.b.volumeKg > 0);
  const nowRows = withVolume.filter((r) => r.b.volumeKg > 0);
  const maxPct = nowRows.length ? Math.max(...nowRows.map((r) => r.b.pct)) : 0;
  const primaryGroups = nowRows.filter((r) => r.b.pct >= maxPct / 2).map((r) => r.label);
  const secondaryGroups = nowRows.filter((r) => r.b.pct < maxPct / 2).map((r) => r.label);

  const focusedRegions = useMemo(
    () => (focusedGroup ? [...regionsFor([focusedGroup], 'front'), ...regionsFor([focusedGroup], 'back')] : null),
    [focusedGroup]
  );

  const toggleGroup = (group) => setFocusedGroup((g) => (g === group ? null : group));
  const handleRegionClick = (regionId) => {
    const group = groupForRegion(regionId);
    if (group) toggleGroup(group);
  };

  const sorted = [...withVolume].sort((x, y) => y.b.volumeKg - x.b.volumeKg);
  // Scaled to the biggest bar EITHER period needs, not just "now" — a muscle
  // trained hard before and dropped since still has a real "before" bar to
  // draw, and scaling only to current volumes would blow it past 100% width.
  const maxVolume = Math.max(...sorted.flatMap((r) => [r.a.volumeKg, r.b.volumeKg]), 1);

  return (
    <SectionCard
      title="Muscle split"
      subtitle={mode === 'volume' ? 'Where your training volume went.' : 'How your total volume is divided up by muscle group.'}
      info={mode === 'volume'
        ? 'Volume is the weight actually moved for this muscle group.'
        : `Share is how much of your total training volume a muscle group makes up, not the weight moved. Chest going from 20% to 27% is written as "20% → 27% of your volume" even when the kilograms barely changed.`}
    >
      <div className="mb-base flex flex-col items-center gap-sm">
        <BodyPair
          front={{ primary: regionsFor(primaryGroups, 'front'), secondary: regionsFor(secondaryGroups, 'front') }}
          back={{ primary: regionsFor(primaryGroups, 'back'), secondary: regionsFor(secondaryGroups, 'back') }}
          intensity={1}
          height={224}
          onRegionClick={handleRegionClick}
          selected={focusedRegions}
          regionLabel={(id) => groupForRegion(id) || 'Muscle'}
        />
        <p className="text-label font-regular text-ink-secondary">Tap a muscle to find it in the list below.</p>
      </div>

      <SegmentedTrack
        ariaLabel="Muscle split, shown as"
        value={mode}
        onChange={setMode}
        options={[{ value: 'volume', label: 'Volume' }, { value: 'share', label: 'Share' }]}
        className="mb-base"
      />

      <ExpandableList
        items={sorted}
        visibleCount={4}
        keyFor={(r) => r.label}
        showAllLabel={(n) => `Show all muscles (${n})`}
        emptyMessage="Nothing logged in either period."
        // A tap on the body map can select a muscle ranked 5th or lower —
        // this opens the list so the highlighted row is actually visible,
        // the other half of "tap the map, see it in the list".
        revealKey={focusedGroup && !sorted.slice(0, 4).some((r) => r.label === focusedGroup) ? focusedGroup : null}
        renderItem={(row) => (
          <MuscleRow
            row={row}
            mode={mode}
            maxVolume={maxVolume}
            focused={focusedGroup === row.label}
            onFocus={() => toggleGroup(row.label)}
          />
        )}
      />
    </SectionCard>
  );
}

function MuscleRow({ row, mode, maxVolume, focused, onFocus }) {
  const { label, a, b, value, pctPointDelta } = row;
  const widthA = Math.max(a.volumeKg > 0 ? 1.5 : 0, (a.volumeKg / maxVolume) * 100);
  const widthB = Math.max(b.volumeKg > 0 ? 1.5 : 0, (b.volumeKg / maxVolume) * 100);
  const pts = Math.round(pctPointDelta);

  return (
    <button
      type="button"
      onClick={onFocus}
      aria-pressed={focused}
      className={`w-full flex items-center gap-md py-sm px-xs -mx-xs rounded-control border-b border-hairline
                  last:border-b-0 text-left transition-colors duration-fast ease-out
                  ${focused ? 'bg-glass-pressed' : 'active:bg-glass-pressed'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-sm">
          <span className="text-body font-regular text-ink truncate">{label}</span>
          <span className="shrink-0 text-body font-semibold text-ink tabular">
            {mode === 'volume' ? formatVolume(b.volumeKg) : `${b.pct}%`}
          </span>
        </div>
        {mode === 'volume' ? (
          <div aria-hidden="true" className="mt-xs flex flex-col gap-xxs">
            <span className="block h-1.5 rounded-full bg-data" style={{ width: `${widthA}%` }} />
            <span className="block h-1.5 rounded-full bg-pr" style={{ width: `${widthB}%` }} />
          </div>
        ) : (
          <p className="mt-xxs text-label font-regular text-ink-secondary tabular">
            {a.pct}% → {b.pct}% of your volume
          </p>
        )}
      </div>
      <div className="shrink-0 w-[60px] text-right">
        {mode === 'volume'
          ? <ChangeChip kind={value.kind} pct={value.pct} size="sm" className="justify-end" />
          : <ChangeChip kind={pts === 0 ? 'none' : 'change'} pct={pts} size="sm" className="justify-end" />}
      </div>
    </button>
  );
}

function WhatYouTrainedCard({ exercises }) {
  const [tab, setTab] = useState('kept');
  const { introduced, dropped, kept } = exercises;

  return (
    <SectionCard title="What you trained" subtitle="Which lifts you kept, started and stopped between the two periods.">
      <SegmentedTrack
        ariaLabel="What you trained"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'kept', label: `Kept (${kept.length})` },
          { value: 'started', label: `Started (${introduced.length})` },
          { value: 'stopped', label: `Stopped (${dropped.length})` }
        ]}
        className="mb-base"
      />

      {tab === 'kept' && (
        <ExpandableList
          items={kept}
          visibleCount={5}
          keyFor={(r) => r.exerciseId}
          emptyMessage="No lift appears in both periods."
          renderItem={(row) => <KeptRow row={row} />}
        />
      )}
      {tab === 'started' && (
        <ChurnChips rows={introduced} tone="pr" empty="Nothing new this period." />
      )}
      {tab === 'stopped' && (
        <ChurnChips rows={dropped} tone="muted" empty="Nothing from before was dropped." />
      )}
    </SectionCard>
  );
}

function KeptRow({ row }) {
  const { exercise, sessions, volumeKg } = row;
  const sign = volumeKg.abs > 0 ? '+' : volumeKg.abs < 0 ? '−' : '';

  return (
    <div className="flex items-center gap-md py-sm border-b border-hairline last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-body font-regular text-ink truncate">{exercise.name}</p>
        <p className="mt-xxs text-label font-regular text-ink-secondary tabular">
          {sessions.from} → {sessions.to} {sessions.to === 1 ? 'session' : 'sessions'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <ChangeChip kind={volumeKg.kind} pct={volumeKg.pct} size="base" className="justify-end" />
        {volumeKg.kind === 'change' && (
          <p className="mt-xxs text-label font-regular text-ink-tertiary tabular">
            {sign}{formatVolume(Math.abs(volumeKg.abs))}
          </p>
        )}
      </div>
    </div>
  );
}

// STARTED AND STOPPED are tags, not ranked rows — there is no "biggest" new
// lift, only ones that exist or do not. Chips wrap neatly at any width a list
// of row-cards would not.
function ChurnChips({ rows, tone, empty }) {
  return (
    <ExpandableList
      items={rows}
      visibleCount={6}
      keyFor={(r) => r.exerciseId}
      listClassName="flex flex-wrap gap-sm"
      showAllLabel={(n) => `Show all (${n})`}
      emptyMessage={empty}
      renderItem={(row) => (
        <span
          className={`inline-flex items-center gap-xs rounded-full border px-md h-9 text-label font-semibold
                      ${tone === 'pr' ? 'bg-pr-soft text-pr border-pr-border' : 'bg-glass-inset text-ink-secondary border-glass-inset-border'}`}
        >
          <span className="truncate max-w-[180px]">{row.exercise.name}</span>
          <span className="text-ink-tertiary font-regular">
            {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}
          </span>
        </span>
      )}
    />
  );
}

function InsightRow({ icon: Icon, tone, sentence }) {
  // The lead (the exercise name) is bold; the rest is the sentence
  // buildHighlights() already composed and already has its own tests — this
  // only styles it, never rewords it.
  const sep = sentence.indexOf(': ');
  const lead = sep === -1 ? sentence : sentence.slice(0, sep);
  const rest = sep === -1 ? '' : sentence.slice(sep + 1);

  return (
    <div className="flex items-start gap-sm py-xs">
      <span
        aria-hidden="true"
        className={`mt-xxs shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                    ${tone === 'pr' ? 'bg-pr-soft text-pr' : 'bg-glass-inset text-ink-secondary'}`}
      >
        <Icon size={14} strokeWidth={2.4} />
      </span>
      <p className="text-body">
        <span className="font-semibold text-ink">{lead}</span>
        {rest && <span className="font-regular text-ink-secondary">{rest}</span>}
      </p>
    </div>
  );
}

// TRAINING INTELLIGENCE v1. Every line is a sentence the service generated
// from numbers it computed, and each one says what it is based on.
function HighlightsCard({ highlights, delta, titleB }) {
  const [gapsOpen, setGapsOpen] = useState(false);
  const { improving, steady } = highlights;

  const trend = classifyVolumeTrend(delta.volumeKg.pct);
  const trendLabel = trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Steady';
  const rows = [
    ...improving.map((h) => ({ ...h, tone: 'pr', icon: TrendingUp })),
    ...steady.map((h) => ({ ...h, tone: 'flat', icon: Minus }))
  ];
  const gaps = summarizeDataGaps(highlights);
  const nothing = rows.length === 0 && gaps.total === 0;

  return (
    <SectionCard
      title="Highlights"
      subtitle={`Strength trends across ${titleB}.`}
      legend={<StaticPill tone={trend === 'improving' ? 'pr' : 'neutral'}>{trendLabel}</StaticPill>}
    >
      {nothing ? (
        <p className="text-label font-regular text-ink-secondary">
          No lift in this period has enough sessions to call a trend yet.
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <ExpandableList
              items={rows}
              visibleCount={3}
              keyFor={(h) => h.exercise.id}
              showAllLabel={(n) => `Show all (${n})`}
              renderItem={(h) => <InsightRow icon={h.icon} tone={h.tone} sentence={h.sentence} />}
            />
          )}

          {gaps.total > 0 && (
            <div className={rows.length > 0 ? 'mt-base pt-base border-t border-hairline' : ''}>
              <button
                type="button"
                aria-expanded={gapsOpen}
                onClick={() => setGapsOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-sm h-tap -mx-sm px-sm rounded-control
                           active:bg-glass-pressed transition-colors duration-fast ease-out"
              >
                <span className="text-body font-regular text-ink-secondary">
                  Not enough data for {gaps.total} {gaps.total === 1 ? 'lift' : 'lifts'}
                </span>
                <ChevronDown
                  size={16}
                  strokeWidth={2.4}
                  style={{
                    transform: gapsOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform var(--motion-base) var(--motion-ease)'
                  }}
                />
              </button>
              {gapsOpen && (
                <ul className="mt-sm flex flex-col gap-xs anim-rise">
                  {gaps.reasons.map((r) => (
                    <li key={r.reason} className="pl-base text-label font-regular text-ink-secondary">
                      {r.count} {r.count === 1 ? 'lift' : 'lifts'}: {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
