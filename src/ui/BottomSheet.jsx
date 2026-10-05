import { useEffect, useRef } from 'react';

// The app's one modal surface.
//
// Sheets replaced dropdown menus everywhere, and the reason is specific: the
// exercise "⋮" menu used to open as an absolutely-positioned panel directly over
// the weight and reps columns, so the one thing you needed to read while
// deciding was the thing the menu covered. A sheet comes from the bottom, is
// within thumb reach, and covers nothing that matters.
export default function BottomSheet({
  open, onClose, title, description, children, footer,
  labelledBy, className = ''
}) {
  const panelRef = useRef(null);
  const restoreFocus = useRef(null);

  // THE REASON SEARCH INSIDE A SHEET DID NOT WORK.
  //
  // The effect below used to list `onClose` in its dependencies. Callers pass an
  // inline arrow (`onClose={() => setPickerOpen(false)}`), so its identity
  // changes on every render of the screen that owns the sheet — and the workout
  // screen re-renders once a SECOND to tick the session clock. The effect
  // therefore tore down and re-ran every second, and its requestAnimationFrame
  // pulled focus off whatever the user was typing in and back onto the panel.
  // On a phone that closes the keyboard mid-word; the field looked broken
  // because it effectively was.
  //
  // Holding the callback in a ref keeps the handler current while letting the
  // effect depend on `open` alone, so the focus and scroll-lock work happens
  // exactly once per opening.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      // Focus trap: a sheet you can tab out of is a sheet a screen reader user
      // silently escapes from into the page behind it.
      const f = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!f?.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey, true);
    // Focus the panel itself rather than its first control, so the sheet's title
    // is announced before its options.
    requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      restoreFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-bg/70 anim-fade"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? 'sheet-title' : undefined)}
        tabIndex={-1}
        className={[
          'relative w-full max-w-app anim-sheet outline-none',
          'glass-surface glass-blur bg-glass border-t border-x border-glass-border',
          'rounded-t-device shadow-sheet safe-bottom', className
        ].join(' ')}
      >
        {/* Grab handle. Decorative — the sheet closes by tapping outside or Escape. */}
        <div className="flex justify-center pt-md pb-sm" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-ink/25" />
        </div>

        {(title || description) && (
          <header className="px-lg pb-md">
            {title && <h2 id="sheet-title" className="text-body font-semibold text-ink">{title}</h2>}
            {description && <p className="text-label font-regular text-ink-secondary mt-xs">{description}</p>}
          </header>
        )}

        <div className="px-lg pb-lg max-h-[70vh] overflow-y-auto scroll-y">{children}</div>

        {footer && <div className="px-lg pb-lg pt-sm border-t border-hairline">{footer}</div>}
      </div>
    </div>
  );
}

// A row inside a sheet. Full-width, 44pt minimum, with the destructive option in
// the danger colour and a one-line explanation where two options could be
// confused for each other (Skip vs Remove).
export function SheetAction({ icon: Icon, label, hint, tone = 'neutral', disabled = false, onClick }) {
  const tones = { neutral: 'text-ink', danger: 'text-danger' };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'w-full flex items-start gap-md min-h-tap px-md py-md rounded-row text-left',
        'transition-colors duration-fast ease-out active:bg-glass-pressed disabled:opacity-40',
        tones[tone]
      ].join(' ')}
    >
      {Icon && <Icon size={19} strokeWidth={2} className="mt-xxs shrink-0" />}
      <span className="min-w-0">
        <span className="block text-body font-semibold">{label}</span>
        {hint && <span className="block text-label font-regular text-ink-tertiary mt-xxs">{hint}</span>}
      </span>
    </button>
  );
}
