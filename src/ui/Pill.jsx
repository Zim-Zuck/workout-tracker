import { useRef } from 'react';

// Pill — a small, self-contained token of state or navigation.
//
// `selected` is the only state that uses the primary white fill, because a
// selected pill IS the thing the screen is currently about. Unselected pills are
// glass. There is no coloured pill: colour in this system means completed, PR or
// destructive, and "this tab is open" is none of those.
export function Pill({
  children, selected = false, disabled = false, size = 'base',
  tone = 'neutral',                       // 'neutral' | 'done' | 'pr' | 'danger'
  className = '', ...rest
}) {
  // Both sizes are 44pt tall. "sm" is smaller TYPE and tighter padding, not a
  // smaller target — a filter chip you have to aim at is a filter chip people
  // stop using. The visual difference is carried by the label, not the box.
  const sizes = { base: 'h-tap px-lg text-body', sm: 'h-tap px-md text-label' };
  const tones = {
    neutral: selected
      ? 'bg-primary text-on-primary border-transparent shadow-pill'
      : 'bg-glass text-ink-secondary border-glass-border active:bg-glass-pressed',
    done:   'bg-done-soft text-done border-done-border',
    pr:     'bg-pr-soft text-pr border-pr-border',
    danger: 'bg-danger-soft text-danger border-danger-border'
  };
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={tone === 'neutral' ? selected : undefined}
      className={[
        'inline-flex items-center justify-center gap-xs shrink-0 rounded-full border font-semibold',
        'transition-colors duration-fast ease-out disabled:opacity-40',
        sizes[size], tones[tone], className
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

// A non-interactive pill: a tag, not a control. Same shape, no tap target rules.
export function StaticPill({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-glass-inset text-ink-secondary border-glass-inset-border',
    done:    'bg-done-soft text-done border-done-border',
    pr:      'bg-pr-soft text-pr border-pr-border',
    danger:  'bg-danger-soft text-danger border-danger-border'
  };
  return (
    <span className={`inline-flex items-center gap-xs rounded-full border px-md h-8 text-label font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

// SegmentedPills — a row of mutually exclusive choices (the splits on Today, the
// sections on Community).
//
// It scrolls rather than compressing. A clipped "Challeng…" is worse than a
// swipe, and squeezing five items into a phone width is how you end up with
// 32pt tap targets.
export function SegmentedPills({
  value, onChange, options, size = 'base', ariaLabel, className = '', loading = false
}) {
  const ref = useRef(null);

  // Keyboard: arrows move between segments, matching a native tab list.
  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
      onChange(next.value);
      ref.current?.querySelector(`[data-v="${next.value}"]`)?.focus();
    }
  };

  if (loading) {
    return (
      <div className={`flex gap-sm ${className}`}>
        {options.map((o) => (
          <span key={o.value} className="skeleton h-tap rounded-full" style={{ width: 84 }} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`flex gap-sm overflow-x-auto no-scrollbar -mx-base px-base ${className}`}
    >
      {options.map((o) => (
        <Pill
          key={o.value}
          data-v={o.value}
          role="tab"
          aria-selected={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          size={size}
          selected={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Pill>
      ))}
    </div>
  );
}

// A segmented control rendered as a track with one white pill inside it — the
// Everyone / Friends switch in the Community mockups. Use this when the two
// options are scopes over the same content; use SegmentedPills when they are
// different content.
export function SegmentedTrack({ value, onChange, options, ariaLabel, className = '' }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex p-xs gap-xs rounded-full bg-glass-inset border border-glass-inset-border ${className}`}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={[
              'flex-1 h-10 rounded-full text-label font-semibold whitespace-nowrap',
              'transition-colors duration-fast ease-out',
              on ? 'bg-primary text-on-primary shadow-pill' : 'text-ink-secondary active:bg-glass'
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
