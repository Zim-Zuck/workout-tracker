import { startOfDay } from '../utils/date.js';

// Seven real dates, and whether each was trained.
//
// Trained days are filled green because green means "completed" everywhere in
// this app. Today is outlined in ink so it reads as "you are here" without
// borrowing a status colour it has not earned — an untrained today is not a
// failure, it is a Tuesday morning.
const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function WeekStrip({
  days,                 // [{ date: ms, trained: bool }] — 7 entries, Monday first
  onSelect,
  selectedDate = null,
  loading = false,
  className = ''
}) {
  const today = startOfDay(Date.now());

  if (loading) {
    return (
      <div className={`grid grid-cols-7 gap-sm ${className}`}>
        {DAY_INITIALS.map((_, i) => <span key={i} className="skeleton rounded-tile" style={{ height: 64 }} />)}
      </div>
    );
  }

  return (
    <ul className={`grid grid-cols-7 gap-sm ${className}`}>
      {days.map((d, i) => {
        const isToday = startOfDay(d.date) === today;
        const isFuture = startOfDay(d.date) > today;
        const selected = selectedDate != null && startOfDay(selectedDate) === startOfDay(d.date);
        const Tag = onSelect ? 'button' : 'div';
        const dayNum = new Date(d.date).getDate();

        return (
          <li key={d.date}>
            <Tag
              type={onSelect ? 'button' : undefined}
              onClick={onSelect ? () => onSelect(d.date) : undefined}
              aria-label={`${new Date(d.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${d.trained ? ', trained' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              className={[
                'w-full flex flex-col items-center justify-center gap-xxs rounded-tile border',
                'transition-colors duration-fast ease-out',
                d.trained
                  ? 'bg-done-soft border-done-border text-done'
                  : isToday
                    ? 'bg-transparent border-glass-border text-ink'
                    : 'bg-transparent border-hairline text-ink-tertiary',
                isFuture ? 'opacity-50' : '',
                selected ? 'ring-1 ring-focus' : '',
                onSelect ? 'active:bg-glass-pressed' : ''
              ].filter(Boolean).join(' ')}
              style={{ minHeight: 64 }}
            >
              <span className="text-micro font-semibold tracking-normal opacity-70">{DAY_INITIALS[i]}</span>
              <span className="text-body font-semibold tabular">{dayNum}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

// Build the seven days of the week containing `anchor`, Monday first, marking
// each day that has at least one workout.
export function buildWeek(workouts, anchor = Date.now()) {
  const d = new Date(anchor);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  const monday = startOfDay(anchor) - dow * 86400000;
  const trained = new Set(workouts.map((w) => startOfDay(w.date)));
  return Array.from({ length: 7 }, (_, i) => {
    const date = monday + i * 86400000;
    return { date, trained: trained.has(date) };
  });
}
