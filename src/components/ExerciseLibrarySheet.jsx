import { X } from 'lucide-react';
import { useEffect } from 'react';
import ExerciseLibrary from '../pages/ExerciseLibrary.jsx';

// The exercise library lost its bottom-nav tab to Social, so it now opens as a
// full-screen sheet from the two places you actually reach for it: the
// add-exercise picker mid-workout, and Settings.
//
// Full-screen rather than the usual Modal because the library is a working
// screen with search, filters and an editor — not a confirmation.
export default function ExerciseLibrarySheet({ open, onClose, workout }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    // Stop the page underneath from scrolling behind the sheet on iOS.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col safe-top" role="dialog" aria-modal="true" aria-label="Exercise library">
      <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
        <h2 className="text-base font-semibold">Exercise library</h2>
        <button aria-label="Close" onClick={onClose} className="p-2 -mr-2 text-muted active:text-text">
          <X size={22} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-y safe-bottom">
        <ExerciseLibrary workout={workout} />
      </div>
    </div>
  );
}
