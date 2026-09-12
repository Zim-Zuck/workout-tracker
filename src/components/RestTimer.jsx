import { Plus, Minus, X } from 'lucide-react';

export default function RestTimer({ remainingSec, running, onAdd, onSub, onSkip }) {
  if (!running) return null;
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');
  return (
    <div className="fixed left-2 right-2 z-30 bottom-[calc(env(safe-area-inset-bottom)+72px)] max-w-lg mx-auto">
      <div className="rounded-2xl bg-card border border-border shadow-lg px-3 py-2 flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted">Rest</div>
          <div className="text-2xl font-bold tabular-nums" aria-live="polite">{mm}:{ss}</div>
        </div>
        <button aria-label="Subtract 30 seconds" onClick={onSub}
          className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center active:bg-border">
          <Minus size={18} />
        </button>
        <button aria-label="Add 30 seconds" onClick={onAdd}
          className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center active:bg-border">
          <Plus size={18} />
        </button>
        <button aria-label="Skip rest" onClick={onSkip}
          className="w-10 h-10 rounded-lg bg-accent text-white flex items-center justify-center active:opacity-80">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
