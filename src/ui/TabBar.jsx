import { CalendarCheck, History, LineChart, Users, SlidersHorizontal } from 'lucide-react';

// Five destinations. "Today" replaced "Workout" as the first tab and the home of
// the app, because the question you open a training app with is "what am I doing
// today?", not "start a blank workout".
//
// The fourth tab is COMMUNITY everywhere a person can read it. The internal id
// stays `social` so every existing route, prop and cache key keeps working —
// renaming a string the user never sees would be churn for its own sake.
export const TABS = [
  { id: 'today',    label: 'Today',     icon: CalendarCheck },
  { id: 'history',  label: 'History',   icon: History },
  { id: 'progress', label: 'Progress',  icon: LineChart },
  { id: 'social',   label: 'Community', icon: Users },
  { id: 'settings', label: 'Settings',  icon: SlidersHorizontal }
];

export default function TabBar({ current, onChange, workoutActive = false, badges = {} }) {
  return (
    <nav
      role="tablist"
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 glass-surface glass-blur-chrome
                 bg-glass border-t border-glass-border safe-bottom"
    >
      <ul className="grid grid-cols-5 max-w-app mx-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = current === id;
          const badge = badges[id] || 0;
          // A live session shows as a green dot on Today, matching "green means
          // in progress / completed" everywhere else.
          const dot = id === 'today' && workoutActive;
          return (
            <li key={id}>
              <button
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => onChange(id)}
                className={`relative w-full h-tab flex flex-col items-center justify-center gap-xs
                            transition-colors duration-fast ease-out
                            ${on ? 'text-ink' : 'text-ink-tertiary active:text-ink-secondary'}`}
              >
                <Icon size={21} strokeWidth={on ? 2.2 : 1.8} />
                <span className="text-micro font-semibold tracking-normal">{label}</span>
                {dot && (
                  <span aria-hidden="true"
                        className="absolute top-sm right-1/2 translate-x-4 w-2 h-2 rounded-full bg-done" />
                )}
                {badge > 0 && (
                  <span className="absolute top-xs right-1/2 translate-x-4 min-w-5 h-5 px-xs rounded-full
                                   bg-primary text-on-primary text-micro font-semibold tracking-normal
                                   flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
