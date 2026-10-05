// THE design system source of truth for Kun Workouts (Ambient Glass).
//
// Every colour, size, radius, blur and duration in the app originates here.
// Nothing else may contain a hex code, a px font size or a px radius:
//   - Tailwind reads this file directly (tailwind.config.js imports it), so
//     `text-ink`, `rounded-card`, `bg-glass` etc. are generated from these values.
//   - CSS that Tailwind cannot express (the page gradient, keyframes, the
//     reduced-transparency fallbacks) reads the CSS custom properties that
//     applyTokens() writes onto :root at boot, which are generated from the same
//     objects below.
//
// If you find yourself typing a `#` or a `[13px]` in a component, the value is
// missing from this file. Add it here instead.

// ---------------------------------------------------------------------------
// Colour
//
// The palette is deliberately tiny and every entry is semantic, not decorative.
// Four accents exist and each owns exactly one meaning (see DESIGN.md):
//   primary  → the single main action on a screen (a white pill)
//   done     → a completed set, a trained day. Never "good" in general.
//   pr       → a personal record. Nothing else, ever.
//   danger   → destructive actions only.
// There is no blue. The old #3b82f6 accent is retired.
// ---------------------------------------------------------------------------
export const color = {
  // Page gradient, top → bottom. Painted once on the body, never on a card.
  gradient: ['#5A1230', '#2A0A18', '#0A0507'],
  // The flat colour beneath the gradient: what the eye reads at the bottom of a
  // long scroll, and the solid fallback for prefers-reduced-transparency.
  bg: '#0A0507',
  // One step up from bg, for solid surfaces that must not use blur (list rows,
  // the reduced-transparency fallback for glass).
  surface: '#1B0A12',
  surfaceRaised: '#2A0F1B',

  ink: '#F6EEF0',          // headlines, values, anything you must read
  inkSecondary: '#D9C7CD', // supporting text, units, dates
  // Chosen to clear WCAG AA (4.5:1) against the BRIGHTEST point of the gradient
  // (#5A1230, the very top of the viewport), not just against the dark base —
  // the wordmark row and the split pills sit up there. #9C8A90 measured 4.13
  // there and only passed lower down the page.
  inkTertiary: '#A6959A',  // 11px labels, disabled text, axis ticks

  // Glass. Two depths only: a card on the page, and a row inset into that card.
  // A third depth would mean a card inside a card, which the design forbids.
  glass: 'rgba(255, 255, 255, 0.09)',
  glassBorder: 'rgba(255, 255, 255, 0.16)',
  glassInset: 'rgba(255, 255, 255, 0.055)',
  glassInsetBorder: 'rgba(255, 255, 255, 0.08)',
  // Pressed state for any glass surface. Lighten, never darken — darkening on a
  // dark ground reads as the element disappearing.
  glassPressed: 'rgba(255, 255, 255, 0.14)',
  hairline: 'rgba(255, 255, 255, 0.10)',

  // Primary action. A white pill with near-black text is the only thing on a
  // screen that looks like this, which is what makes it findable.
  primary: '#FFFFFF',
  onPrimary: '#1A0610',
  primaryPressed: '#E8DDE1',

  done: '#4ADE80',                        // completed sets, trained days
  doneSoft: 'rgba(74, 222, 128, 0.14)',
  doneBorder: 'rgba(74, 222, 128, 0.42)',

  pr: '#FFC46B',                          // personal records. NOTHING else.
  prSoft: 'rgba(255, 196, 107, 0.12)',
  prBorder: 'rgba(255, 196, 107, 0.34)',

  danger: '#FF8A8A',                      // destructive actions only
  dangerSoft: 'rgba(255, 138, 138, 0.12)',
  dangerBorder: 'rgba(255, 138, 138, 0.34)',

  // Neutral data ink for charts: bars are not an accent, they are content.
  // The single highlighted bar (this week) uses `ink` instead.
  data: 'rgba(246, 238, 240, 0.28)',
  dataStrong: 'rgba(246, 238, 240, 0.70)',

  // Focus ring. Visible on both glass and solid surfaces.
  focus: 'rgba(246, 238, 240, 0.85)'
};

// ---------------------------------------------------------------------------
// Type — Inter Tight, two weights, five sizes.
//
// A screen may use at most three of {title, body, label, micro} plus `display`.
// Sizes are absolute px because this is a fixed-scale phone UI; they are never
// written in a component, only referenced as `text-body` etc.
// ---------------------------------------------------------------------------
export const font = {
  family: "'Inter Tight', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  weight: { regular: 400, semibold: 600 }
};

export const text = {
  // Session names on the hero ("Pull") and nothing else. One per screen, max.
  display: { size: 56, lineHeight: 1.0,  tracking: '-0.035em', weight: 600 },
  // Screen headlines and big stat values.
  title:   { size: 32, lineHeight: 1.1,  tracking: '-0.025em', weight: 600 },
  // Default reading size: list rows, buttons, sentences.
  body:    { size: 17, lineHeight: 1.35, tracking: '-0.01em',  weight: 400 },
  // Secondary lines, metadata, targets.
  label:   { size: 13, lineHeight: 1.3,  tracking: '0',        weight: 400 },
  // Uppercase eyebrows, axis ticks, the wordmark.
  micro:   { size: 11, lineHeight: 1.2,  tracking: '0.14em',   weight: 600 }
};

// ---------------------------------------------------------------------------
// Spacing — 8pt grid.
//
// THE LADDER. Six steps do the structural work, and a component should reach
// for one of these before anything else:
//
//   xs    4   hairline offsets, the gap between an icon and its label
//   sm    8   inside a tight control; between two things that are one thing
//   md   12   BETWEEN REPEATED ROWS and between sibling cards in a list
//   base 16   PADDING INSIDE a card or a row; the page gutter; below a label
//   xl   24   between unrelated groups on a page
//   xxl  32   between major sections, and above a page's first heading
//
// `xxs` (2) and `lg` (20) are optical steps, used only for adjustments inside a
// component — never to separate two things from each other. The 3xl..6xl steps
// are for empty states and hero whitespace.
//
// Nothing in this app should contain a literal pixel gap. If a value you need
// is missing, it belongs here first.
// ---------------------------------------------------------------------------
export const space = {
  xxs: 2, xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24,
  xxl: 32, '3xl': 40, '4xl': 48, '5xl': 56, '6xl': 64
};

// ---------------------------------------------------------------------------
// Radii — taken from the mockups. `full` is for circular controls.
// ---------------------------------------------------------------------------
export const radius = {
  device: 48,  // the phone frame in the mockups; also the app's outermost sheet
  hero: 28,    // the Next-workout card
  card: 24,    // every other grouping card
  pill: 22,    // segmented pills, the Repeat shortcut
  tile: 20,    // stat tiles, feed cards
  row: 16,     // rows inset into a card
  control: 12, // small controls, chips
  full: 9999
};

// ---------------------------------------------------------------------------
// Elevation. Shadows are soft and directional, never a glow — the light in this
// design comes from the glass border, not from a halo.
// ---------------------------------------------------------------------------
export const shadow = {
  hero:  '0 24px 48px -24px rgba(0, 0, 0, 0.75)',
  card:  '0 12px 24px -16px rgba(0, 0, 0, 0.6)',
  pill:  '0 8px 20px -12px rgba(0, 0, 0, 0.7)',
  sheet: '0 -16px 48px -20px rgba(0, 0, 0, 0.8)',
  none:  'none'
};

// ---------------------------------------------------------------------------
// Blur. PERFORMANCE RULE: backdrop-filter is allowed on exactly four things —
// the hero card, the resume pill, bottom sheets, and the tab bar. Never on a
// repeated list item, because every blurred element is its own compositing
// layer and a scrolling list of them drops frames on a real phone.
// ---------------------------------------------------------------------------
export const blur = {
  glass: 'blur(24px) saturate(140%)',
  // Slightly lighter for the tab bar, which sits over fast-moving content.
  chrome: 'blur(18px) saturate(130%)'
};

// ---------------------------------------------------------------------------
// Motion — 150–250ms, ease-out, no overshoot. Anything springy is off-brand.
// Every duration here resolves to 0 under prefers-reduced-motion (see index.css).
// ---------------------------------------------------------------------------
export const motion = {
  fast: '150ms',
  base: '200ms',
  slow: '250ms',
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
};

// ---------------------------------------------------------------------------
// Layout constants that more than one component needs to agree on.
// ---------------------------------------------------------------------------
export const layout = {
  maxWidth: 512,   // phone-width column, centred on larger screens
  header: 44,      // wordmark + avatar row
  tabBar: 64,      // excluding the safe-area inset
  resumePill: 56,
  tapMin: 44,      // minimum tap target, non-negotiable
  gutter: 16       // page side padding
};

// ---------------------------------------------------------------------------
// CSS custom properties.
//
// Generated from the objects above so the values exist in exactly one place.
// applyTokens() runs once at boot (main.jsx) and writes them onto :root, which
// is what index.css reads for the gradient, keyframes and a11y fallbacks.
// ---------------------------------------------------------------------------
export function cssVariables() {
  const vars = {};
  for (const [k, v] of Object.entries(color)) {
    if (Array.isArray(v)) continue;
    vars[`--c-${kebab(k)}`] = v;
  }
  color.gradient.forEach((stop, i) => { vars[`--c-gradient-${i}`] = stop; });
  vars['--font-family'] = font.family;
  for (const [k, v] of Object.entries(text)) {
    vars[`--text-${k}-size`] = `${v.size}px`;
    vars[`--text-${k}-lh`] = String(v.lineHeight);
    vars[`--text-${k}-tracking`] = v.tracking;
    vars[`--text-${k}-weight`] = String(v.weight);
  }
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(space)) vars[`--space-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(shadow)) vars[`--shadow-${k}`] = v;
  for (const [k, v] of Object.entries(blur)) vars[`--blur-${k}`] = v;
  for (const [k, v] of Object.entries(motion)) vars[`--motion-${k}`] = v;
  for (const [k, v] of Object.entries(layout)) vars[`--layout-${kebab(k)}`] = `${v}px`;
  return vars;
}

export function applyTokens(root = document.documentElement) {
  const vars = cssVariables();
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

function kebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export default { color, font, text, space, radius, shadow, blur, motion, layout };
