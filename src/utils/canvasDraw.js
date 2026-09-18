// Shared canvas primitives for generated share-card images. Palette and font stacks
// mirror ShareCard.jsx exactly so every exported image feels like one visual family.
export const PALETTE = {
  bg: '#0B0B0D',
  text: '#F5F5F7',
  muted: '#8E8E93',
  faint: '#3A3A3E',
  accent: '#5EA0FF',
  success: '#34D399'
};

export const FONT_DISPLAY = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif';
export const FONT_TEXT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif';

export function paintBackground(ctx, W, H, glowX = W * 0.75, glowY = H * 0.15) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(glowX, glowY, 20, glowX, glowY, W * 0.9);
  grad.addColorStop(0, 'rgba(80, 90, 110, 0.18)');
  grad.addColorStop(1, 'rgba(11, 11, 13, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

export function drawTopBar(ctx, W, M, leftText, rightText) {
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `500 24px ${FONT_TEXT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(leftText, M, M);
  ctx.textAlign = 'right';
  ctx.fillText(rightText, W - M, M);
  ctx.textBaseline = 'alphabetic';
}

export function drawHairline(ctx, x1, y1, x2, y2, color = PALETTE.faint) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1 + 0.5);
  ctx.lineTo(x2, y2 + 0.5);
  ctx.stroke();
}

export function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// Shrinks a bold display-font size until `text` fits within maxW.
export function fitFontSize(ctx, text, maxW, { weight = 700, family = FONT_DISPLAY, max = 112, min = 40, step = 4 } = {}) {
  let size = max;
  while (size > min) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxW) return size;
    size -= step;
  }
  return size;
}

export function drawWordmark(ctx, W, H) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 24px ${FONT_DISPLAY}`;
  ctx.fillText('Kun Workouts', W / 2, H - 66);
  ctx.fillStyle = PALETTE.faint;
  ctx.font = `500 20px ${FONT_TEXT}`;
  ctx.fillText('Track every rep.', W / 2, H - 40);
}

// A quiet single-line trend — no axes, no gridlines, just the shape of the curve
// with a small dot marking the latest value.
export function drawSparkline(ctx, x, y, w, h, values, color = PALETTE.accent) {
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(1, max * 0.1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  values.forEach((v, i) => {
    const px = x + (i / (values.length - 1)) * w;
    const py = y + h - ((v - min) / range) * h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();
  const lastX = x + w;
  const lastY = y + h - ((values[values.length - 1] - min) / range) * h;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fill();
}

// A single quiet horizontal proportion bar — used for muscle/rep-range distributions.
export function drawBar(ctx, x, y, w, h, pct, color = PALETTE.accent, trackColor = PALETTE.faint) {
  ctx.fillStyle = trackColor;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const fillW = Math.max(h, (Math.max(0, Math.min(100, pct)) / 100) * w);
  ctx.fillStyle = color;
  roundRect(ctx, x, y, fillW, h, h / 2);
  ctx.fill();
}

// A ring/donut chart — quiet, single-hue segments (rank distinguished by lightness, not a
// rainbow of new colors) so it stays inside the app's existing accent rather than inventing
// a categorical palette. `segments` is [{ value, label? }], largest-first is typical.
export function drawDonut(ctx, cx, cy, radius, thickness, segments) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const gap = segments.length > 1 ? 0.035 : 0;
  let angle = -Math.PI / 2;
  ctx.lineCap = 'butt';
  segments.forEach((seg, i) => {
    const sweep = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, angle + gap / 2, angle + sweep - gap / 2);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = seg.color || accentShade(i, segments.length);
    ctx.stroke();
    angle += sweep;
  });
}

// Rank 0 (biggest share) gets the full accent; each rank after fades a bit — a sequential,
// single-hue scale rather than introducing new categorical colors into the palette.
export function accentShade(rank, total) {
  const alpha = Math.max(0.32, 1 - rank * (0.62 / Math.max(1, total - 1 || 1)));
  return `rgba(94, 160, 255, ${alpha.toFixed(2)})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
