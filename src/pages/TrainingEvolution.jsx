import { useMemo, useState } from 'react';
import { ArrowLeft, CornerLeftDown } from 'lucide-react';
import {
  SegmentedPills, StaticPill, EmptyState, IconButton, SecondaryButton
} from '../ui/index.js';
import { DistributionBars } from '../components/Chart.jsx';
import {
  COMPARE_WINDOWS, WINDOWS, pillOptions, rangeFor, customRange, formatDayRange
} from '../services/timeframes.js';
import { compareTrainingPeriods, precedingRange } from '../services/trainingEvolution.js';
import { buildHighlights } from '../services/exerciseStats.js';
import { formatVolume } from '../utils/units.js';

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

const toneClass = (tone) => (tone === 'pr' ? 'text-pr' : 'text-ink-secondary');

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

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center gap-sm pt-sm -ml-sm">
        <IconButton icon={ArrowLeft} label="Back to Progress" onClick={onBack} />
        <h1 className="text-body font-semibold text-ink truncate">Training evolution</h1>
      </div>

      {/* Period B first: it is the period you are asking about, and A is the
          thing you are measuring it against. */}
      <PeriodPicker
        label="Recent period (B)"
        period={periodB}
        onChange={setPeriodB}
        range={rangeB}
      />

      <div className="mt-lg flex items-center justify-between gap-md">
        <h2 className="text-micro font-semibold uppercase text-ink-tertiary">Compared with (A)</h2>
        <SecondaryButton
          icon={CornerLeftDown}
          onClick={() => setMatchPreceding((v) => !v)}
        >
          {matchPreceding ? 'Pick a period' : 'The period before B'}
        </SecondaryButton>
      </div>

      {matchPreceding ? (
        <p className="mt-sm text-label font-regular text-ink-tertiary">
          {rangeB
            ? `The ${Math.round((rangeB.end - rangeB.start) / DAY)} days immediately before period B — ${formatDayRange(rangeA.start, rangeA.end, { year: true, dash: 'to' })}.`
            : 'Pick period B first.'}
        </p>
      ) : (
        <PeriodPicker period={periodA} onChange={setPeriodA} range={rangeA} />
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

function PeriodPicker({ label, period, onChange, range }) {
  return (
    <section className="mt-lg">
      {label && <h2 className="text-micro font-semibold uppercase text-ink-tertiary">{label}</h2>}
      <SegmentedPills
        className="mt-md"
        ariaLabel={label || 'Period'}
        size="sm"
        value={period.id}
        onChange={(id) => onChange({ ...period, id })}
        options={RANGE_OPTIONS}
      />
      {period.id === 'custom' && (
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
      )}
      {range && period.id !== 'custom' && (
        <p className="mt-sm text-label font-regular text-ink-tertiary tabular">
          {dayRange(range)}
        </p>
      )}
    </section>
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

  return (
    <>
      {notes.length > 0 && (
        <div className="mt-lg flex flex-col gap-sm">
          {notes.map((n) => (
            <p key={n} className="text-label font-regular text-ink-tertiary">{n}</p>
          ))}
        </div>
      )}

      {/* Rates first when the lengths differ, totals first when they match. */}
      <Block title={shape.equalLength ? 'Totals' : 'Per week'}>
        {shape.equalLength ? (
          <>
            <Row label="Workouts" a={String(a.workouts)} b={String(b.workouts)} delta={deltaText(delta.workouts)} />
            <Row label="Volume" a={formatVolume(a.volumeKg)} b={formatVolume(b.volumeKg)} delta={deltaText(delta.volumeKg, formatVolume)} />
            <Row label="Exercises" a={String(a.exerciseCount)} b={String(b.exerciseCount)} delta={deltaText(delta.exerciseCount)} />
            <Row label="Sessions / week" a={a.perWeek.toFixed(1)} b={b.perWeek.toFixed(1)} delta={deltaText(delta.perWeek, (n) => n.toFixed(1))} />
          </>
        ) : (
          <>
            <Row label="Sessions / week" a={a.perWeek.toFixed(1)} b={b.perWeek.toFixed(1)} delta={deltaText(delta.perWeek, (n) => n.toFixed(1))} />
            <Row label="Volume / week" a={formatVolume(a.volumePerWeek)} b={formatVolume(b.volumePerWeek)} delta={deltaText(delta.volumePerWeek, formatVolume)} />
            <Row label="Exercises" a={String(a.exerciseCount)} b={String(b.exerciseCount)} delta={deltaText(delta.exerciseCount)} />
            <Row label="Workouts (total)" a={String(a.workouts)} b={String(b.workouts)} delta={deltaText(delta.workouts)} muted />
            <Row label="Volume (total)" a={formatVolume(a.volumeKg)} b={formatVolume(b.volumeKg)} delta={deltaText(delta.volumeKg, formatVolume)} muted />
          </>
        )}
        <p className="mt-md text-micro font-semibold uppercase text-ink-tertiary">
          A — {titleA} · B — {titleB}
        </p>
      </Block>

      <Block title="Rep ranges" subtitle="Share of working sets in each period.">
        <MixBars rows={repRange} valueKey="count" unit="sets" titleA={titleA} titleB={titleB} />
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

function Block({ title, subtitle, children }) {
  return (
    <section className="mt-xxl">
      <h2 className="text-micro font-semibold uppercase text-ink-tertiary">{title}</h2>
      {subtitle && <p className="text-label font-regular text-ink-tertiary mt-xs">{subtitle}</p>}
      <div className="mt-md">{children}</div>
    </section>
  );
}

function Row({ label, a, b, delta, muted = false }) {
  return (
    <div className="min-h-tap py-sm flex items-center gap-md border-b border-hairline last:border-b-0">
      <span className={`flex-1 min-w-0 text-body font-regular truncate ${muted ? 'text-ink-tertiary' : 'text-ink'}`}>
        {label}
      </span>
      <span className="shrink-0 w-[72px] text-right text-label font-regular text-ink-tertiary tabular">{a}</span>
      <span className="shrink-0 w-[72px] text-right text-label font-semibold text-ink tabular">{b}</span>
      <span className={`shrink-0 w-[108px] text-right text-label font-regular tabular ${toneClass(delta.tone)}`}>
        {delta.text}
      </span>
    </div>
  );
}

// Two bars per label, A above B, so the shift is read as a shape rather than
// from a signed number.
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

function MixBars({ rows, valueKey, unit = '', format, titleA, titleB }) {
  const withAny = rows.filter((r) => r.a[valueKey] > 0 || r.b[valueKey] > 0);
  if (!withAny.length) return <p className="text-label font-regular text-ink-tertiary">Nothing logged in either period.</p>;

  return (
    <div className="flex flex-col gap-lg">
      {withAny.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-sm">
            <span className="text-label font-regular text-ink">{row.label}</span>
            <span className={`text-label font-regular tabular ${row.pctPointDelta > 0 ? 'text-pr' : 'text-ink-secondary'}`}>
              {row.pctPointDelta === 0
                ? 'same share'
                : `${row.pctPointDelta > 0 ? '+' : '−'}${Math.abs(row.pctPointDelta)} pts`}
            </span>
          </div>
          <div className="mt-xs">
            <DistributionBars
              data={[
                { label: 'A', value: row.a.pct },
                { label: 'B', value: row.b.pct }
              ]}
              unit="%"
              ariaLabel={`${row.label}, share of each period`}
              srLabel={(k) => `${row.label}, ${k === 'A' ? titleA : titleB}`}
            />
          </div>
          <p className="mt-xs text-micro font-regular text-ink-tertiary tabular">
            {format ? format(row.a[valueKey]) : `${Math.round(row.a[valueKey])} ${unit}`}
            {' → '}
            {format ? format(row.b[valueKey]) : `${Math.round(row.b[valueKey])} ${unit}`}
            {shareNote(row) && <span className="not-tabular"> · {shareNote(row)}</span>}
          </p>
        </div>
      ))}
    </div>
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
