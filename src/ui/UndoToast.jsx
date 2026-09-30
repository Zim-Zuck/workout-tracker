import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';

// Undo instead of "Are you sure?".
//
// There are no confirmation dialogs for skip or remove anywhere in this app. A
// dialog asks you to predict whether you will regret something; a toast lets you
// find out and take it back. The toast sits ABOVE the resume pill and tab bar so
// it never covers the control you are about to use next, and holds for 5s —
// long enough to notice, short enough not to linger.
const UndoCtx = createContext(null);
const DEFAULT_MS = 5000;

export function UndoToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { id, message, onUndo, tone }
  const timer = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message, { onUndo, tone = 'neutral', duration = DEFAULT_MS } = {}) => {
    clearTimeout(timer.current);
    const id = Math.random().toString(36).slice(2);
    setToast({ id, message, onUndo, tone });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), duration);
    return id;
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <UndoCtx.Provider value={show}>
      {children}
      <UndoToast toast={toast} onDismiss={dismiss} />
    </UndoCtx.Provider>
  );
}

export function useUndoToast() {
  const ctx = useContext(UndoCtx);
  if (!ctx) throw new Error('useUndoToast must be used inside UndoToastProvider');
  return ctx;
}

export function UndoToast({ toast, onDismiss }) {
  if (!toast) return null;
  const { message, onUndo, tone } = toast;
  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-base pointer-events-none"
      // Clears the tab bar, the resume pill when one is showing, and the home
      // indicator. --chrome-bottom is computed once in index.css from tokens.
      style={{ bottom: 'var(--chrome-bottom)' }}
    >
      <div
        role="status"
        aria-live="polite"
        className={[
          'pointer-events-auto anim-rise w-full max-w-app flex items-center gap-md',
          // Solid, not glass. The toast is not on the blur allowlist and it
          // appears over arbitrary content — a translucent one let the sentence
          // underneath read straight through it. Legibility beats consistency
          // for something that has five seconds to be understood.
          'rounded-full border pl-lg pr-xs py-xs shadow-pill bg-surface-raised border-glass-border',
          tone === 'danger' ? 'text-danger' : 'text-ink'
        ].join(' ')}
      >
        <span className="flex-1 min-w-0 truncate text-label font-semibold">{message}</span>
        {onUndo && (
          <button
            type="button"
            onClick={() => { onUndo(); onDismiss(); }}
            className="shrink-0 inline-flex items-center gap-xs h-tap px-lg rounded-full
                       bg-primary text-on-primary text-label font-semibold
                       transition-colors duration-fast ease-out active:bg-primary-pressed"
          >
            <Undo2 size={15} strokeWidth={2.4} /> Undo
          </button>
        )}
      </div>
    </div>
  );
}
