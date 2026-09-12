import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="p-2 -m-2 text-muted hover:text-text">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto scroll-y">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-border">{footer}</div>}
      </div>
    </div>
  );
}
