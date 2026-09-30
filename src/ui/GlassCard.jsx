import { layout } from '../theme/tokens.js';

// The one grouping surface in the app.
//
// Two depths, and no more: `card` sits on the page, `inset` sits inside a card.
// There is no third depth because a card inside a card inside a card is exactly
// the decoration this design exists to remove.
//
// `elevated` is the hero treatment — bigger radius, a real shadow, and the only
// list-safe use of backdrop blur. It is for ONE element per screen.
export default function GlassCard({
  as: Tag = 'div',
  variant = 'card',      // 'card' | 'inset' | 'hero'
  blur = false,          // hero card / sheet / resume pill / tab bar ONLY
  interactive = false,   // adds the pressed state; use when the whole card taps
  disabled = false,
  loading = false,
  className = '',
  children,
  ...rest
}) {
  const base = 'relative border transition-colors duration-fast ease-out';

  const variants = {
    card:  'glass-surface bg-glass border-glass-border rounded-card shadow-card',
    inset: 'glass-surface-inset bg-glass-inset border-glass-inset-border rounded-row shadow-none',
    hero:  'glass-surface bg-glass border-glass-border rounded-hero shadow-hero'
  };

  const press = interactive && !disabled
    ? 'active:bg-glass-pressed cursor-pointer'
    : '';

  return (
    <Tag
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
      className={[
        base,
        variants[variant],
        blur ? 'glass-blur' : '',
        press,
        disabled ? 'opacity-40 pointer-events-none' : '',
        className
      ].filter(Boolean).join(' ')}
      style={interactive ? { minHeight: layout.tapMin } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
