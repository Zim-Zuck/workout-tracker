import { Dumbbell, History, BarChart3, ListChecks, Settings as SettingsIcon } from 'lucide-react';

const TABS = [
  { id: 'workout', label: 'Workout', icon: Dumbbell },
  { id: 'history', label: 'History', icon: History },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
  { id: 'exercises', label: 'Exercises', icon: ListChecks },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
];

export default function Navigation({ current, onChange, workoutActive }) {
  return (
    <nav
      role="tablist"
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-border safe-bottom"
    >
      <ul className="grid grid-cols-5 max-w-lg mx-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = current === id;
          const showDot = id === 'workout' && workoutActive;
          return (
            <li key={id}>
              <button
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => onChange(id)}
                className={`w-full h-16 flex flex-col items-center justify-center gap-0.5 relative ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon size={22} />
                <span className="text-[11px] leading-none">{label}</span>
                {showDot && (
                  <span className="absolute top-2 right-1/2 translate-x-4 w-2 h-2 rounded-full bg-success" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
