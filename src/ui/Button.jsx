import { layout } from '../theme/tokens.js';

// PrimaryButton — the single main action on a screen.
//
// White pill, near-black label. Nothing else in the app looks like this, and
// that is the entire point: the eye finds the one thing worth tapping without
// reading anything. Two on one screen means one of them is not primary.
export function PrimaryButton({
  children, icon: Icon, loading = false, disabled = false,
  full = false, size = 'base', className = '', ...rest
}) {
  const sizes = {
    base: 'h-tap px-xl text-body',
    lg: 'h-[52px] px-xxl text-body'
  };
  const off = disabled || loading;
  return (
    <button
      type="button"
      disabled={off}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-sm rounded-full font-semibold',
        'bg-primary text-on-primary shadow-pill',
        'transition-[background-color,opacity,transform] duration-fast ease-out',
        'active:bg-primary-pressed active:scale-[0.985]',
        'disabled:opacity-40 disabled:active:scale-100 disabled:shadow-none',
        sizes[size], full ? 'w-full' : '', className
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? <Spinner tone="dark" /> : Icon ? <Icon size={18} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

// The circular arrow Start button on the hero. Same role as PrimaryButton, so
// same colour — a different shape for a different gesture, not a different rank.
export function PrimaryCircleButton({ icon: Icon, label, loading = false, disabled = false, size = 88, ...rest }) {
  const off = disabled || loading;
  return (
    <button
      type="button"
      disabled={off}
      aria-label={label}
      aria-busy={loading || undefined}
      style={{ width: size, height: size }}
      className={[
        'shrink-0 inline-flex items-center justify-center rounded-full',
        'bg-primary text-on-primary shadow-pill',
        'transition-[background-color,opacity,transform] duration-fast ease-out',
        'active:bg-primary-pressed active:scale-[0.96]',
        'disabled:opacity-40 disabled:active:scale-100'
      ].join(' ')}
      {...rest}
    >
      {loading ? <Spinner tone="dark" /> : <Icon size={Math.round(size * 0.3)} strokeWidth={2} />}
    </button>
  );
}

// SecondaryButton — a supporting action beside a primary one, or the main action
// on a screen that has no single obvious next step. Glass, not white.
export function SecondaryButton({
  children, icon: Icon, loading = false, disabled = false, full = false,
  tone = 'neutral',   // 'neutral' | 'danger'
  className = '', ...rest
}) {
  const off = disabled || loading;
  const tones = {
    neutral: 'bg-glass border-glass-border text-ink active:bg-glass-pressed',
    danger: 'bg-danger-soft border-danger-border text-danger active:bg-danger-soft'
  };
  return (
    <button
      type="button"
      disabled={off}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-sm h-tap px-lg rounded-full border',
        'text-body font-semibold transition-colors duration-fast ease-out',
        'disabled:opacity-40', tones[tone], full ? 'w-full' : '', className
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? <Spinner /> : Icon ? <Icon size={17} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

// TextLink — a tertiary action that should be available but never compete.
// Underlined rather than coloured, because colour in this design carries meaning
// and "you may tap this" is not one of the meanings.
export function TextLink({ children, disabled = false, tone = 'neutral', className = '', ...rest }) {
  const tones = { neutral: 'text-ink', danger: 'text-danger' };
  return (
    <button
      type="button"
      disabled={disabled}
      style={{ minHeight: layout.tapMin }}
      className={[
        'inline-flex items-center justify-center px-sm text-body font-semibold underline underline-offset-4',
        'decoration-1 transition-opacity duration-fast ease-out active:opacity-60 disabled:opacity-40',
        tones[tone], className
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

// An icon-only control. Exists so that every such button in the app is a real
// 44pt target even when the glyph inside it is 18px.
export function IconButton({ icon: Icon, label, tone = 'neutral', size = 20, className = '', ...rest }) {
  const tones = {
    neutral: 'text-ink-secondary active:bg-glass-pressed active:text-ink',
    danger: 'text-danger active:bg-danger-soft'
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        'inline-flex items-center justify-center w-tap h-tap rounded-full shrink-0',
        'transition-colors duration-fast ease-out disabled:opacity-40', tones[tone], className
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}

export function Spinner({ tone = 'light', size = 16 }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size, borderWidth: 2 }}
      className={`inline-block rounded-full animate-spin ${
        tone === 'dark'
          ? 'border-on-primary/25 border-t-on-primary'
          : 'border-ink/25 border-t-ink'
      }`}
    />
  );
}
