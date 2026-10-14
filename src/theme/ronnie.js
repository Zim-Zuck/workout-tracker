// Ronnie-specific colour constants.
//
// Ronnie himself is now approved bitmap artwork (src/assets/ronnie), so his
// character palette no longer lives in code. What remains is the chrome around
// him on the Today screen: the speech bubble and its per-intensity text.
//
// Everything else in the app pulls from src/theme/tokens.js, but these values
// are mockup-specific rather than themed UI, so they stay here rather than
// becoming new entries in tokens.js.

// The Today row's speech bubble. Also mockup-specific — close to but distinct
// from `color.ink` in tokens.js, so kept here rather than borrowed.
export const RONNIE_BUBBLE = {
  background: '#F6E7EF',
  text: '#2A0B1B',
  caption: '#A33B66'
};

// Bubble text styling per intensity level. Only the text changes — the bubble
// surface, caption and tail stay identical at all three levels, so Ronnie
// getting louder reads as him raising his voice, not as a different component.
export const RONNIE_INTENSITY_TEXT = {
  cold:     { fontWeight: 500, color: '#5A3A4B' },
  doghouse: { fontWeight: 600, color: RONNIE_BUBBLE.text },
  loud:     { fontWeight: 800, color: RONNIE_BUBBLE.text }
};
