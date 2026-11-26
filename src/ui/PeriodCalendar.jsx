import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import GlassCard from './GlassCard.jsx';
import { IconButton } from './Button.jsx';
import { startOfDay } from '../utils/date.js';
import { hexToRgba } from '../utils/color.js';
import { color } from '../theme/tokens.js';

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// A's fill, at a visibility the low-chroma glass-inset tone this screen used
// before couldn't reach — grey-on-dark-maroon all but disappears at the
// usual 5-8% glass opacity, where amber's warmth carries the same alpha just
// fine. Pushed brighter and paired with full-strength ink text rather than
// the usual secondary, so it reads at a glance next to B's pr-soft.
const A_FILL = hexToRgba(color.ink, 0.22);
const A_BORDER = hexToRgba(color.ink, 0.55);

function startOfMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

// ONE MONTH, MONDAY FIRST, padded to whole weeks. Built from the local
// y/m/d constructor rather than day-ms arithmetic — the same DST pitfall
// customRange() in timeframes.js guards against (adding 86400000 repeatedly
// drifts by an hour across a clock change; the constructor never does).
function buildGrid(monthTs) {
  const ref = new Date(monthTs);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = firstDow; i > 0; i--) {
    cells.push({ date: new Date(year, month, 1 - i).getTime(), inMonth: false });
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ date: new Date(year, month, d).getTime(), inMonth: true });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, trailing).getTime(), inMonth: false });
    trailing += 1;
  }
  return cells;
}

function dayEndOf(dayStart) {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

// A day counts as "in" a range if any part of it falls inside — the range's
// own start/end can land mid-day, and that day should still light up.
const overlaps = (dayStart, dayEnd, range) => !!range && dayEnd >= range.start && dayStart <= range.end;

// THE ROLE SWITCH. Two large, coloured-to-match segments rather than relying
// on the reader to notice the summary chips above are also buttons — this is
// the one place that says "your next drag edits THIS period", in the same
// colours the grid itself uses, directly above the thing it controls.
function RoleSwitch({ activeRole, onRoleChange, canEditA, labelA, labelB }) {
  const segment = (role, label, selected, disabled) => (
    <button
      key={role}
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={disabled}
      onClick={() => onRoleChange(role)}
      className={[
        'flex-1 h-tap rounded-full text-label font-semibold whitespace-nowrap border',
        'transition-colors duration-fast ease-out disabled:opacity-40',
        selected
          ? (role === 'b' ? 'bg-pr-soft border-pr-border text-pr' : 'border-transparent text-ink')
          : 'bg-transparent border-transparent text-ink-tertiary active:bg-glass-pressed'
      ].join(' ')}
      style={selected && role === 'a' ? { background: A_FILL, borderColor: A_BORDER } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div role="tablist" aria-label="Period to edit" className="flex p-xs gap-xs rounded-full bg-glass-inset border border-glass-inset-border">
      {segment('b', labelB, activeRole === 'b', false)}
      {segment('a', labelA, activeRole === 'a', !canEditA)}
    </div>
  );
}

// THE CALENDAR REPLACEMENT FOR THE CUSTOM PICKER. Period B (now, amber) and
// period A (before, bright ink) are painted directly onto the month they
// fall in, so "which weeks am I comparing" is a glance rather than two date
// strings. A press-drag-release across the grid — not two separate taps —
// paints a custom range for whichever period the switch above is set to; the
// grid lights up live as the drag crosses days, and lifting the finger
// commits it. This is the only way left to pick an arbitrary range, now that
// the Custom pill is gone.
export default function PeriodCalendar({
  month, onNavigate, rangeA, rangeB, onDragStart, onDragMove, onDragEnd, onDayActivate,
  activeRole, onRoleChange, canEditA, labelA, labelB, statusText, className = ''
}) {
  const draggingRef = useRef(false);

  // WINDOW-LEVEL LISTENERS, NOT PER-CELL HOVER. A touch pointer is implicitly
  // captured by whatever element it went down on, so pointerenter/pointermove
  // never fire on the cells the finger crosses afterwards — only on the
  // original target. Hit-testing document.elementFromPoint() on every
  // pointermove is the standard workaround and works identically for mouse
  // and touch.
  useEffect(() => {
    const handleMove = (e) => {
      if (!draggingRef.current) return;
      const point = e.touches?.[0] ?? e;
      const el = document.elementFromPoint(point.clientX, point.clientY);
      const day = el?.closest('[data-day]')?.dataset.day;
      if (day) onDragMove(Number(day));
    };
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      onDragEnd();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [onDragMove, onDragEnd]);

  const today = startOfDay(Date.now());
  const cells = buildGrid(month);
  const atCurrentMonth = startOfMonth(month) === startOfMonth(today);
  const monthLabel = new Date(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <GlassCard className={`p-base ${className}`}>
      <RoleSwitch activeRole={activeRole} onRoleChange={onRoleChange} canEditA={canEditA} labelA={labelA} labelB={labelB} />

      <div className="mt-base flex items-center justify-between">
        <IconButton icon={ChevronLeft} label="Previous month" size={18} onClick={() => onNavigate(-1)} />
        <p className="text-body font-semibold text-ink tabular">{monthLabel}</p>
        <IconButton icon={ChevronRight} label="Next month" size={18} disabled={atCurrentMonth} onClick={() => onNavigate(1)} />
      </div>

      <div className="mt-base grid grid-cols-7 gap-xs">
        {DAY_INITIALS.map((d, i) => (
          <span key={i} className="text-center text-micro font-semibold uppercase text-ink-tertiary">{d}</span>
        ))}
      </div>

      <div className="mt-xs grid grid-cols-7 gap-xs select-none" style={{ touchAction: 'none' }}>
        {cells.map((cell) => {
          const dayStart = cell.date;
          const dayEnd = dayEndOf(dayStart);
          const isFuture = dayStart > today;
          const isToday = dayStart === today;
          const inA = overlaps(dayStart, dayEnd, rangeA);
          const inB = overlaps(dayStart, dayEnd, rangeB);
          const dayNum = new Date(dayStart).getDate();

          if (!cell.inMonth || isFuture) {
            return (
              <span
                key={dayStart}
                aria-hidden="true"
                className="aspect-square rounded-control flex items-center justify-center text-label text-ink-tertiary opacity-40"
              >
                {cell.inMonth ? dayNum : ''}
              </span>
            );
          }

          // B and A each own one tone (pr for "now", a brighter ink fill for
          // "before"). A day in both gets B's fill plus a bright ink ring,
          // since "now" is what the reader asked about and "also before" is
          // the footnote.
          const toneClass = inB
            ? `bg-pr-soft border-pr-border text-pr${inA ? ' ring-2 ring-inset ring-ink' : ''}`
            : inA
              ? 'border text-ink font-semibold'
              : 'border-transparent text-ink';
          const toneStyle = !inB && inA ? { background: A_FILL, borderColor: A_BORDER } : undefined;

          const label = [
            new Date(dayStart).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
            inB ? `in ${labelB}` : null,
            inA ? `in ${labelA}` : null
          ].filter(Boolean).join(', ');

          return (
            <button
              key={dayStart}
              type="button"
              data-day={dayStart}
              onPointerDown={(e) => { e.preventDefault(); draggingRef.current = true; onDragStart(dayStart); }}
              onClick={() => onDayActivate(dayStart)}
              aria-label={label}
              className={[
                'relative aspect-square rounded-control border text-label font-semibold tabular',
                'flex items-center justify-center transition-colors duration-fast ease-out active:bg-glass-pressed',
                toneClass
              ].filter(Boolean).join(' ')}
              style={toneStyle}
            >
              {dayNum}
              {isToday && <span aria-hidden="true" className="absolute bottom-1 w-1 h-1 rounded-full bg-ink" />}
            </button>
          );
        })}
      </div>

      <p className="mt-base text-label font-regular text-ink-tertiary" aria-live="polite">{statusText}</p>
    </GlassCard>
  );
}
