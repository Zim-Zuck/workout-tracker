import { color, text as textTokens } from '../theme/tokens.js';

// Charts, drawn as plain SVG against the design tokens.
//
// AXES ARE LABELLED AND UNITS ARE STATED. The old weekly chart was a row of
// unlabelled bars with a tooltip: you could see that one week was taller than
// another, but not by how much, or in what. A chart you have to poke at to read
// is a decoration.
//
// Bars and lines use the neutral data ink, never an accent: a bar is content,
// not a status. The single highlighted value (this week, the latest point) uses
// full-strength ink instead.
const AXIS = { size: textTokens.micro.size, fill: color.inkTertiary, weight: textTokens.micro.weight };

export function BarChart({
  data,            // [{ label, value }]
  unit = 'kg',
  highlightLast = false,
  height = 160,
  formatValue = (v) => v.toLocaleString(),
  emptyMessage = 'Not enough data yet.'
}) {
  if (!data.length) return <Empty message={emptyMessage} height={height} />;

  const max = Math.max(...data.map((d) => d.value), 1);
  // A "nice" ceiling, so the axis reads 6,000 rather than 5,847.
  const ceiling = niceCeiling(max);
  const barW = 100 / data.length;
  const plotH = height - 28;

  return (
    <figure className="m-0">
      <div className="flex items-start gap-sm">
        {/* Y axis: three labelled gridlines, with the unit on the top one. */}
        <div className="flex flex-col justify-between shrink-0" style={{ height: plotH }}>
          {[ceiling, ceiling / 2, 0].map((v, i) => (
            <span key={i} className="text-micro font-semibold tracking-normal text-ink-tertiary tabular leading-none">
              {formatValue(v)}{i === 0 ? ` ${unit}` : ''}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <svg
            viewBox={`0 0 100 ${plotH}`}
            preserveAspectRatio="none"
            style={{ height: plotH, width: '100%', display: 'block' }}
            role="img"
            aria-label={`Bar chart, ${data.length} periods, values in ${unit}`}
          >
            {[0, 0.5, 1].map((f) => (
              <line key={f} x1="0" x2="100" y1={plotH * f} y2={plotH * f}
                    stroke={color.hairline} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            ))}
            {data.map((d, i) => {
              const h = ceiling ? (d.value / ceiling) * plotH : 0;
              const last = highlightLast && i === data.length - 1;
              return (
                <rect
                  key={d.label + i}
                  x={i * barW + barW * 0.18}
                  width={barW * 0.64}
                  y={plotH - h}
                  height={Math.max(h, d.value > 0 ? 1 : 0)}
                  rx="1"
                  fill={last ? color.ink : color.data}
                />
              );
            })}
          </svg>
          {/* X axis: first, middle and last only — seven overlapping dates is
              not a label, it is a smudge. */}
          <div className="flex justify-between mt-xs">
            {[data[0], data[Math.floor(data.length / 2)], data[data.length - 1]]
              .filter(Boolean)
              .map((d, i) => (
                <span key={i} className="text-micro font-semibold tracking-normal text-ink-tertiary">{d.label}</span>
              ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

export function LineChart({
  data,           // [{ label, value }]
  unit = 'kg',
  height = 180,
  formatValue = (v) => v.toLocaleString(),
  emptyMessage = 'Log this exercise twice to see a trend.'
}) {
  if (data.length < 2) return <Empty message={emptyMessage} height={height} />;

  const values = data.map((d) => d.value);
  // A line chart needs a ceiling CLOSE to the data, not a coarse round number:
  // niceCeiling(107.5) is 200, which draws a steadily climbing squat as a
  // flatline pinned to the bottom of the box. 10% of headroom, rounded to a
  // readable step, keeps the trend legible.
  const max = niceHeadroom(Math.max(...values));
  // A floor below the lowest point, so a steady lift is not drawn as a flatline
  // pinned to the bottom of the box.
  const min = Math.max(0, Math.floor(Math.min(...values) * 0.9));
  const span = Math.max(max - min, 1);
  const plotH = height - 28;
  const x = (i) => (i / (data.length - 1)) * 100;
  const y = (v) => plotH - ((v - min) / span) * plotH;

  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ');

  return (
    <figure className="m-0">
      <div className="flex items-start gap-sm">
        <div className="flex flex-col justify-between shrink-0" style={{ height: plotH }}>
          {[max, (max + min) / 2, min].map((v, i) => (
            <span key={i} className="text-micro font-semibold tracking-normal text-ink-tertiary tabular leading-none">
              {formatValue(Math.round(v))}{i === 0 ? ` ${unit}` : ''}
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <svg
            viewBox={`0 0 100 ${plotH}`}
            preserveAspectRatio="none"
            style={{ height: plotH, width: '100%', display: 'block' }}
            role="img"
            aria-label={`Line chart, ${data.length} points, values in ${unit}`}
          >
            {[0, 0.5, 1].map((f) => (
              <line key={f} x1="0" x2="100" y1={plotH * f} y2={plotH * f}
                    stroke={color.hairline} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={path} fill="none" stroke={color.dataStrong} strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {/* The latest point, marked. It is the number the screen is about. */}
            <circle cx={x(data.length - 1)} cy={y(values[values.length - 1])} r="2.5"
                    fill={color.ink} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex justify-between mt-xs">
            {[data[0], data[data.length - 1]].map((d, i) => (
              <span key={i} className="text-micro font-semibold tracking-normal text-ink-tertiary">{d.label}</span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

// Horizontal bars for a distribution — muscle groups, rep ranges. The value is
// printed on every row, because a proportion you have to eyeball against its
// neighbours is a proportion you cannot read.
export function DistributionBars({ data, unit = '', formatValue = (v) => String(v) }) {
  if (!data.length) return <Empty message="Nothing logged in this window." height={80} />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="flex flex-col gap-sm">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-md">
          <span className="w-[76px] shrink-0 text-label font-regular text-ink-secondary truncate">{d.label}</span>
          <span className="flex-1 h-2 rounded-full bg-glass-inset overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: color.data }}
            />
          </span>
          <span className="shrink-0 text-label font-semibold text-ink tabular text-right min-w-[64px]">
            {formatValue(d.value)}{unit ? ` ${unit}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ message, height }) {
  return (
    <div
      className="flex items-center justify-center rounded-row border border-hairline
                 text-label font-regular text-ink-tertiary text-center px-base"
      style={{ height }}
    >
      {message}
    </div>
  );
}

// A ceiling just above the data, rounded to a step a human would write. Used
// where the SHAPE of the line matters more than comparing against zero.
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceHeadroom(v) {
  if (v <= 0) return 1;
  const target = v * 1.1;
  const mag = 10 ** Math.floor(Math.log10(target));
  for (const n of NICE) {
    if (n * mag >= target) return n * mag;
  }
  return 10 * mag;
}

// Round a maximum up to something a human would write on an axis.
function niceCeiling(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

// ---------------------------------------------------------------------------
// AreaChart — the weekly volume trend.
//
// A bar per week told you how big each week was. A filled line tells you which
// DIRECTION you are going, which is the only question anyone asks of a volume
// chart. The latest week is marked and labelled in place, so the number you
// came for is already on screen and there is nothing to tap.
//
// Drawn as a px-offset overlay rather than scaled SVG text: the path stretches
// with the container, the dots and the type do not.
// ---------------------------------------------------------------------------
export function AreaChart({
  data,                 // [{ label, value }]
  unit = 'kg',
  height = 190,
  formatValue = (v) => v.toLocaleString(),
  pointLabel = null,    // text for the pill on the latest point
  emptyMessage = 'Not enough data yet.'
}) {
  if (data.length < 2) return <Empty message={emptyMessage} height={height} />;

  const values = data.map((d) => d.value);
  // A ceiling just above the data rather than the next round power: a 26 t
  // peak under niceCeiling() gets a 50 t axis and spends half the plot on
  // empty space, which flattens the trend the chart exists to show.
  const ceiling = niceHeadroom(Math.max(...values, 1));
  const plotH = height - 26;
  const x = (i) => (i / (data.length - 1)) * 100;
  const y = (v) => plotH - (v / ceiling) * plotH;

  const line = smoothPath(data.map((d, i) => [x(i), y(d.value)]));
  const area = `${line} L100,${plotH} L0,${plotH} Z`;
  const lastI = data.length - 1;

  return (
    <figure className="m-0">
      <div className="flex items-start gap-sm">
        <div className="flex flex-col justify-between shrink-0" style={{ height: plotH }}>
          {[ceiling, ceiling / 2, 0].map((v, i) => (
            <span key={i} className="text-micro font-semibold tracking-normal text-ink-tertiary tabular leading-none">
              {formatValue(v)} {unit}
            </span>
          ))}
        </div>

        {/* 8px of right inset so the final dot — the one the whole chart is
            about — is not drawn half off the edge of the phone. */}
        <div className="flex-1 min-w-0 pr-sm">
          <div className="relative" style={{ height: plotH }}>
            <svg
              viewBox={`0 0 100 ${plotH}`}
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
              role="img"
              aria-label={`Area chart, ${data.length} weeks, values in ${unit}`}
            >
              <defs>
                <linearGradient id="kw-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color.ink} stopOpacity="0.26" />
                  <stop offset="100%" stopColor={color.ink} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map((f) => (
                <line key={f} x1="0" x2="100" y1={plotH * f} y2={plotH * f}
                      stroke={color.hairline} strokeWidth="0.5" strokeDasharray="2 3"
                      vectorEffect="non-scaling-stroke" />
              ))}
              <path d={area} fill="url(#kw-area)" />
              <path d={line} fill="none" stroke={color.ink} strokeWidth="2"
                    strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {/* The drop line under the latest week, so the pill above it and
                  the date below it read as the same thing. */}
              <line x1={x(lastI)} x2={x(lastI)} y1="0" y2={plotH}
                    stroke={color.hairline} strokeWidth="1" strokeDasharray="2 3"
                    vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Dots, as HTML so they stay circles however wide the phone is. */}
            {data.map((d, i) => (
              <span
                key={d.label + i}
                className="absolute rounded-full"
                style={{
                  left: `${x(i)}%`,
                  top: y(d.value),
                  width: i === lastI ? 11 : 7,
                  height: i === lastI ? 11 : 7,
                  transform: 'translate(-50%, -50%)',
                  background: i === lastI ? color.ink : color.bg,
                  border: `2px solid ${i === lastI ? color.ink : color.dataStrong}`,
                  boxShadow: i === lastI ? `0 0 0 4px ${color.glassInset}` : 'none'
                }}
              />
            ))}

            {/* Pinned to the top of the plot rather than floated above the
                last point: when the latest week is the low point, "above the
                dot" is down among the axis labels. */}
            {pointLabel && (
              <span
                className="absolute h-8 px-md inline-flex items-center rounded-full bg-primary
                           text-on-primary text-label font-semibold tabular whitespace-nowrap"
                style={{ left: '100%', top: 0, transform: 'translate(-100%, -50%)' }}
              >
                {pointLabel}
              </span>
            )}
          </div>

          <div className="flex justify-between mt-sm">
            {pickTicks(data).map((d, i) => (
              <span key={i} className="text-micro font-semibold tracking-normal text-ink-tertiary">{d.label}</span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// RadarChart — muscle balance.
//
// Eight horizontal bars sorted biggest-first answered "which muscle got the
// most volume". They could not answer "am I lopsided", because a sorted list
// looks the same whether you are balanced or not. A radar can only be read as
// a shape, which is exactly the question.
// ---------------------------------------------------------------------------
export function RadarChart({
  data,                 // [{ label, value }] — drawn in the order given
  formatValue = (v) => v.toLocaleString(),
  unit = '',
  emptyMessage = 'Nothing logged in this window.'
}) {
  if (data.length < 3) return <Empty message={emptyMessage} height={120} />;

  const n = data.length;
  const max = Math.max(...data.map((d) => d.value), 1);
  const R = 28;                                   // polygon radius, % of box
  const LABEL_R = 44;                             // where the labels sit
  const LABEL_W = 74;                             // px; see the clamp below
  const at = (i, r) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  };
  const ring = (f) => data.map((_, i) => at(i, R * f).join(',')).join(' ');
  const shape = data.map((d, i) => at(i, R * Math.max(0.04, d.value / max)).join(',')).join(' ');

  return (
    <figure className="m-0">
      <div className="relative mx-auto w-full" style={{ maxWidth: 330, aspectRatio: '1 / 1' }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          role="img"
          aria-label={`Radar chart of volume across ${n} muscle groups`}
        >
          {[0.33, 0.66, 1].map((f) => (
            <polygon key={f} points={ring(f)} fill="none"
                     stroke={color.hairline} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {data.map((_, i) => {
            const [px, py] = at(i, R);
            return <line key={i} x1="50" y1="50" x2={px} y2={py}
                         stroke={color.hairline} strokeWidth="1" vectorEffect="non-scaling-stroke" />;
          })}
          <polygon points={shape} fill={color.ink} fillOpacity="0.16"
                   stroke={color.ink} strokeWidth="1.5" strokeLinejoin="round"
                   vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const [px, py] = at(i, R * Math.max(0.04, d.value / max));
            return <circle key={i} cx={px} cy={py} r="1.6" fill={color.ink} />;
          })}
        </svg>

        {/* Labels are CLAMPED inside the box. At eight axes the leftmost and
            rightmost ones sit at the very edge of a phone, and a centred label
            there hangs half of "Hamstrings" off the screen. clamp() keeps them
            in without measuring anything at runtime. */}
        {data.map((d, i) => {
          const [lx, ly] = at(i, LABEL_R);
          const half = LABEL_W / 2;
          return (
            <span
              key={d.label}
              className="absolute text-center leading-tight"
              style={{
                left: `clamp(${half}px, ${lx}%, calc(100% - ${half}px))`,
                top: `clamp(14px, ${ly}%, calc(100% - 14px))`,
                transform: 'translate(-50%, -50%)',
                width: LABEL_W
              }}
            >
              <span className="block text-label font-regular text-ink-secondary">{d.label}</span>
              <span className="block text-label font-semibold text-ink tabular">
                {formatValue(d.value)}{unit ? ` ${unit}` : ''}
              </span>
            </span>
          );
        })}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// DonutChart — rep range distribution.
//
// Four buckets is the one case where a ring beats bars: the total belongs in
// the middle, and "what share of my sets were heavy" is a part-of-whole
// question. Every slice still prints its own count in the legend, because a
// ring on its own is a decoration.
// ---------------------------------------------------------------------------
const SLICE_INK = [0.95, 0.62, 0.38, 0.2];

export function DonutChart({ data, unit = 'sets', emptyMessage = 'Nothing logged in this window.' }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <Empty message={emptyMessage} height={120} />;

  const C = 2 * Math.PI * 38;  // circumference at r=38 in a 100-box
  let acc = 0;

  return (
    <figure className="m-0 flex items-center gap-lg">
      <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}
             role="img" aria-label={`Donut chart, ${total} working sets across ${data.length} rep ranges`}>
          <circle cx="50" cy="50" r="38" fill="none" stroke={color.glassInset} strokeWidth="13" />
          {data.map((d, i) => {
            const len = (d.value / total) * C;
            const dash = `${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`;
            const offset = -acc;
            acc += len;
            if (!d.value) return null;
            return (
              <circle
                key={d.label}
                cx="50" cy="50" r="38" fill="none"
                stroke={color.ink}
                strokeOpacity={SLICE_INK[i % SLICE_INK.length]}
                strokeWidth="13"
                strokeLinecap="butt"
                strokeDasharray={dash}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-title font-semibold text-ink tabular leading-none">{total}</span>
          <span className="text-micro font-semibold uppercase text-ink-tertiary mt-xs">{unit}</span>
        </span>
      </div>

      <ul className="flex-1 min-w-0 flex flex-col gap-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-sm">
            <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: color.ink, opacity: SLICE_INK[i % SLICE_INK.length] }} />
            <span className="flex-1 min-w-0 text-label font-regular text-ink-secondary truncate">
              {d.label} reps
            </span>
            <span className="shrink-0 text-label font-semibold text-ink tabular">{d.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// First, middle and last — three labels is the most a phone-width axis can hold
// without the dates turning into a smudge.
function pickTicks(data) {
  if (data.length <= 3) return data;
  return [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]];
}

// Catmull-Rom through the points, converted to cubic beziers. Tension is low on
// purpose: a volume line should curve, not overshoot into values nobody lifted.
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 1 / 6;
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t}` +
         ` ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t}` +
         ` ${p2[0]},${p2[1]}`;
  }
  return d;
}
