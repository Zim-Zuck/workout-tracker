// A hex colour at a given opacity, as an rgba() string. Shared by anything
// that needs several distinct shades of one token colour (varying lightness,
// not hue) rather than a brand-new colour for every tint it draws.
export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
