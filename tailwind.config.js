// Tailwind's scales are GENERATED from src/theme/tokens.js. Do not add a literal
// colour, size or radius here — add it to tokens.js and it appears in both the
// utility classes and the CSS custom properties automatically.
import { color, font, text, space, radius, shadow, motion, layout } from './src/theme/tokens.js';

const px = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, `${v}px`]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    // `extend` is deliberately NOT used for colours, fontSize, spacing or
    // borderRadius: replacing those scales outright means `text-sm`,
    // `rounded-lg`, `p-5` and `text-blue-500` stop existing, so a component
    // cannot accidentally reach past the design system. If a class you expect is
    // missing, that is the guard rail doing its job.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      bg: color.bg,
      surface: color.surface,
      'surface-raised': color.surfaceRaised,
      ink: color.ink,
      'ink-secondary': color.inkSecondary,
      'ink-tertiary': color.inkTertiary,
      glass: color.glass,
      'glass-border': color.glassBorder,
      'glass-inset': color.glassInset,
      'glass-inset-border': color.glassInsetBorder,
      'glass-pressed': color.glassPressed,
      hairline: color.hairline,
      primary: color.primary,
      'on-primary': color.onPrimary,
      'primary-pressed': color.primaryPressed,
      done: color.done,
      'done-soft': color.doneSoft,
      'done-border': color.doneBorder,
      pr: color.pr,
      'pr-soft': color.prSoft,
      'pr-border': color.prBorder,
      danger: color.danger,
      'danger-soft': color.dangerSoft,
      'danger-border': color.dangerBorder,
      data: color.data,
      'data-strong': color.dataStrong,
      focus: color.focus,

    },
    fontSize: Object.fromEntries(
      Object.entries(text).map(([k, v]) => [
        k,
        // Deliberately no fontWeight here: a fontSize utility that also sets
        // weight competes with font-semibold depending on source order. Size
        // utilities set size/leading/tracking; weight is always explicit.
        [`${v.size}px`, { lineHeight: String(v.lineHeight), letterSpacing: v.tracking }]
      ])
    ),
    fontWeight: {
      regular: font.weight.regular,
      semibold: font.weight.semibold
    },
    fontFamily: { sans: font.family },
    borderRadius: px(radius),
    boxShadow: shadow,
    transitionDuration: { fast: motion.fast, base: motion.base, slow: motion.slow },
    transitionTimingFunction: { out: motion.ease },
    extend: {
      // Spacing EXTENDS rather than replaces: the token names (p-base, gap-md)
      // are what components should use, but Tailwind's numeric scale stays
      // available for the sub-grid optical work that icons and rings need
      // (w-2 for a status dot, -space-x-2 for stacked avatars).
      spacing: px(space),
      maxWidth: { app: `${layout.maxWidth}px` },
      inset: px({ header: layout.header }),
      height: px({ header: layout.header, tab: layout.tabBar, resume: layout.resumePill, tap: layout.tapMin }),
      // `width` as well as `height`: w-tap was silently a no-op, which left every
      // icon-only control 44pt tall and as narrow as its glyph.
      width: px({ tap: layout.tapMin }),
      minHeight: px({ tap: layout.tapMin }),
      minWidth: px({ tap: layout.tapMin })
    }
  },
  plugins: []
};
