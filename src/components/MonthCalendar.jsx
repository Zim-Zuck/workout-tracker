import { useMemo } from 'react';
import { startOfDay } from '../utils/date.js';

// A real, labelled calendar — months named, weekday columns headed, dates
// readable — instead of the anonymous 18-week grid of squares it replaces.
//
// A heatmap answers "roughly how often", which is a question the streak and the
// weekly chart already answer better. A calendar answers "which days", which is
// the one you actually ask when you are looking at your own training.
//
// It sizes itself to the account: a three-week-old account gets one month, not
// a year and a half of empty squares implying failure.
export default function MonthCalendar({ workouts, monthsBack, onSelectDay, selectedDay = null }) {
  const today = startOfDay(Date.now());

  const trained = useMemo(() => {
    const m = new Map();
    for (const w of workouts) {
      const d = startOfDay(w.date);
      m.set(d, (m.get(d) || 0) + 1);
    }
    return m;
  }, [workouts]);

  const months = useMemo(() => {
    const first = workouts.length ? Math.min(...workouts.map((w) => w.date)) : Date.now();
    const firstDate = new Date(first);
    const now = new Date();
    // How many months actually contain anything, capped by the caller's window.
    const span = (now.getFullYear() - firstDate.getFullYear()) * 12 + (now.getMonth() - firstDate.getMonth());
    const count = Math.min(monthsBack ?? (span + 1), span + 1);
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(d);
    }
    return out;
  }, [workouts, monthsBack]);

  return (
    <div className="flex flex-col gap-lg">
      {months.map((m) => (
        <Month
          key={`${m.getFullYear()}-${m.getMonth()}`}
          month={m}
          trained={trained}
          today={today}
          onSelectDay={onSelectDay}
          selectedDay={selectedDay}
        />
      ))}
    </div>
  );
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Month({ month, trained, today, onSelectDay, selectedDay }) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  // Monday-first, matching the week strip on Today.
  const lead = (new Date(year, mon, 1).getDay() + 6) % 7;

  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, mon, i + 1).getTime())
  ];

  const count = cells.filter((c) => c && trained.has(startOfDay(c))).length;

  return (
    <section>
      <header className="flex items-baseline justify-between mb-sm">
        <h3 className="text-label font-semibold text-ink">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h3>
        <span className="text-micro font-semibold uppercase text-ink-tertiary tabular">
          {count} {count === 1 ? 'session' : 'sessions'}
        </span>
      </header>

      <div className="grid grid-cols-7 gap-xs mb-xs" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="text-micro font-semibold tracking-normal text-ink-tertiary text-center">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-xs">
        {cells.map((ts, i) => {
          if (!ts) return <span key={`p${i}`} />;
          const day = startOfDay(ts);
          const did = trained.has(day);
          const isToday = day === today;
          const isFuture = day > today;
          const Tag = onSelectDay && did ? 'button' : 'div';
          return (
            <Tag
              key={ts}
              type={Tag === 'button' ? 'button' : undefined}
              onClick={Tag === 'button' ? () => onSelectDay(day) : undefined}
              aria-label={`${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}${did ? ', trained' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              className={[
                'aspect-square rounded-control flex items-center justify-center text-label tabular border',
                did ? 'bg-done-soft border-done-border text-done font-semibold'
                    : isToday ? 'border-glass-border text-ink font-semibold'
                    : 'border-transparent text-ink-tertiary font-regular',
                isFuture ? 'opacity-35' : '',
                selectedDay === day ? 'ring-1 ring-focus' : '',
                Tag === 'button' ? 'transition-colors duration-fast ease-out active:bg-glass-pressed' : ''
              ].filter(Boolean).join(' ')}
            >
              {new Date(ts).getDate()}
            </Tag>
          );
        })}
      </div>
    </section>
  );
}
