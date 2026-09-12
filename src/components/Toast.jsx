import { createContext, useCallback, useContext, useState, useEffect } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || 2200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed left-0 right-0 top-4 z-[60] flex flex-col items-center gap-2 pointer-events-none safe-top">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto px-4 py-2 rounded-full text-sm shadow-lg border ${
            t.tone === 'error' ? 'bg-danger/95 border-danger text-white' :
            t.tone === 'success' ? 'bg-success/95 border-success text-white' :
            'bg-surface border-border text-text'
          }`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

// Hook to trigger a haptic on iOS Safari where available (best-effort, no-op otherwise).
export function useHaptic() {
  useEffect(() => {}, []);
  return useCallback(() => {
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch {} }
  }, []);
}
