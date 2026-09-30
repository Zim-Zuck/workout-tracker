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

      // ----------------------------------------------------------------------
      // DEPRECATED — the pre-redesign palette, remapped onto the new tokens.
      //
      // Screens not yet restyled (everything outside src/ui and Today) still
      // reference these names. Mapping them keeps the app usable between phases
      // instead of shipping three releases of unstyled text. Nothing new may use
      // them, and the whole block is deleted at the end of Phase 3 — at which
      // point any remaining usage becomes a visible, findable break.
      //
      // Note `accent` maps to ink, not to a colour: the old blue is retired and
      // there is deliberately nothing to inherit it.
      // ----------------------------------------------------------------------
      card: color.glassInset,
      border: color.glassBorder,
      muted: color.inkTertiary,
      text: color.ink,
      accent: color.ink,
      success: color.done,
      warn: color.pr,
      // `text-white` in unrestyled code is almost always the label ON a filled
      // button (bg-accent / bg-success / bg-danger). Since `accent` now maps to
      // the near-white primary, mapping `white` to the primary's INK keeps those
      // buttons legible instead of painting white on white.
      white: color.onPrimary
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
      semibold: font.weight.semibold,
      // DEPRECATED (see the colour block above): unrestyled screens use these.
      normal: font.weight.regular, medium: font.weight.semibold, bold: font.weight.semibold
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
      // DEPRECATED: Tailwind's default size/radius names, remapped onto the
      // token scale so unrestyled screens stay legible. Deleted after Phase 3.
      fontSize: {
        '[10px]': `${text.micro.size}px`,
        xs: `${text.micro.size}px`, sm: `${text.label.size}px`, base: `${text.body.size}px`,
        lg: `${text.body.size}px`, xl: `${text.title.size}px`, '2xl': `${text.title.size}px`
      },
      borderRadius: {
        lg: `${radius.control}px`, xl: `${radius.row}px`,
        '2xl': `${radius.card}px`, '3xl': `${radius.hero}px`
      },
      height: px({ header: layout.header, tab: layout.tabBar, resume: layout.resumePill, tap: layout.tapMin }),
      minHeight: px({ tap: layout.tapMin }),
      minWidth: px({ tap: layout.tapMin })
    }
  },
  plugins: []
};
