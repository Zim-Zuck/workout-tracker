import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatDuration } from '../utils/date.js';

// "In progress · Back Squat · 12m" — floats above the tab bar on EVERY tab while
// a session is live, so wandering off to check the leaderboard mid-workout is
// never a one-way trip.
//
// It sets data-resume on <body> rather than exporting a height, which is what
// lets .pb-nav and --chrome-bottom in index.css reserve room for it without any
// screen having to know it exists.
export default function ResumePill({ splitName, currentExercise, startedAt, onResume, loading = false }) {
  useEffect(() => {
    document.body.dataset.resume = '1';
    return () => { delete document.body.dataset.resume; };
  }, []);

  const elapsed = startedAt ? formatDuration(Date.now() - startedAt) : null;

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-base pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + var(--layout-tab-bar) + var(--space-sm))' }}
    >
      <button
        type="button"
        onClick={onResume}
        disabled={loading}
        className="pointer-events-auto w-full max-w-app h-resume flex items-center gap-md
                   pl-lg pr-xs rounded-full shadow-pill glass-surface glass-blur
                   bg-glass border border-glass-border
                   transition-colors duration-fast ease-out active:bg-glass-pressed disabled:opacity-60"
      >
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-done shrink-0" />
        <span className="flex-1 min-w-0 text-left text-label font-semibold text-ink truncate">
          In progress
          {splitName ? ` · ${splitName}` : ''}
          {currentExercise ? ` · ${currentExercise}` : ''}
          {elapsed ? ` · ${elapsed}` : ''}
        </span>
        <span aria-hidden="true"
              className="shrink-0 w-tap h-tap rounded-full bg-primary text-on-primary flex items-center justify-center">
          <ArrowRight size={19} strokeWidth={2.2} />
        </span>
      </button>
    </div>
  );
}
