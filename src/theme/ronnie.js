// Ronnie-specific colour constants.
//
// Everything else in the app pulls from src/theme/tokens.js, but none of its
// tokens match Ronnie's mockup palette (he is deliberately a cartoon illustration
// sitting on top of the Ambient Glass system, not a themed UI element), so this
// is a second, narrowly-scoped constants file rather than new entries in
// tokens.js. If Ronnie ever needs a second screen with different chrome, this
// file is the one thing that would need to change.
//
// The eyelid shapes in Ronnie.jsx are filled with `skin`, not a literal hex, so
// they stay part of the face if skin ever changes.
export const RONNIE_COLORS = {
  outline: '#1B0A14',
  skin: '#D9A0BC',       // head, ears, shoulders, eyelids
  nose: '#C58AA7',
  tankTop: '#FF6B3D',
  towel: '#F2EEE6',
  sweatband: '#FF4F8B',
  sweatbandStripe: '#FFFFFF',
  goldTooth: '#FFD34E',
  eyeWhite: '#FFFFFF',
  mouthInterior: '#4A0D1F',
  tongue: '#FF6B8A',
  hypeSpark: '#FFE45E',
  hypeSweat: '#8FD8FF',
  sleepyZ: '#F6E7EF'
};

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
