import { useCallback, useEffect, useRef, useState } from 'react';

// A global-ish rest timer. Persists endTime in localStorage so it survives
// tab suspension / iOS backgrounding (setTimeout does not fire reliably in the background).
const LS_KEY = 'lift:restTimerEnd';

export function useRestTimer({ onComplete } = {}) {
  const [endTime, setEndTime] = useState(() => {
    const v = Number(localStorage.getItem(LS_KEY));
    return v && v > Date.now() ? v : 0;
  });
  const [now, setNow] = useState(Date.now());
  const completedRef = useRef(false);

  // 1s tick while running.
  useEffect(() => {
    if (!endTime) return;
    completedRef.current = false;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endTime]);

  const remainingMs = endTime ? Math.max(0, endTime - now) : 0;

  // Fire the completion callback exactly once when timer reaches 0.
  useEffect(() => {
    if (endTime && remainingMs === 0 && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
      // Auto-clear after completing so UI can collapse.
      const t = setTimeout(() => {
        setEndTime(0);
        localStorage.removeItem(LS_KEY);
      }, 800);
      return () => clearTimeout(t);
    }
  }, [remainingMs, endTime, onComplete]);

  const start = useCallback((sec) => {
    const end = Date.now() + sec * 1000;
    setEndTime(end);
    setNow(Date.now());
    localStorage.setItem(LS_KEY, String(end));
  }, []);

  const adjust = useCallback((deltaSec) => {
    setEndTime((cur) => {
      if (!cur) return cur;
      const nxt = Math.max(Date.now() + 1000, cur + deltaSec * 1000);
      localStorage.setItem(LS_KEY, String(nxt));
      return nxt;
    });
  }, []);

  const stop = useCallback(() => {
    setEndTime(0);
    localStorage.removeItem(LS_KEY);
  }, []);

  return {
    running: endTime > 0 && remainingMs > 0,
    remainingSec: Math.ceil(remainingMs / 1000),
    endTime,
    start,
    stop,
    add: () => adjust(30),
    sub: () => adjust(-30)
  };
}
