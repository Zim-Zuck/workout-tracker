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
  const max = niceCeiling(Math.max(...values));
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

// Round a maximum up to something a human would write on an axis.
function niceCeiling(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}
