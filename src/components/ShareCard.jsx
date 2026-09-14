import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Download, X, Trophy } from 'lucide-react';
import { workoutSummary } from '../services/workoutSummary.js';
import { formatWeight } from '../utils/units.js';
import { formatDate, formatDuration } from '../utils/date.js';

// Renders a polished portrait share image of a completed workout.
// Painted with the 2D canvas API at 2x DPR for crisp text; no external deps.
export default function ShareCard({ open, workout, workouts, exercises, unit, onClose }) {
  const canvasRef = useRef(null);
  const [pngUrl, setPngUrl] = useState(null);
  const [canShareFile, setCanShareFile] = useState(false);

  const summary = useMemo(() => (workout ? workoutSummary(workout, workouts, exercises) : null), [workout, workouts, exercises]);

  useEffect(() => {
    if (!open || !summary) return;
    // Detect Web Share Level 2 (files) support.
    try {
      const f = new File([new Blob(['x'])], 't.png', { type: 'image/png' });
      setCanShareFile(!!(navigator.canShare && navigator.canShare({ files: [f] })));
    } catch { setCanShareFile(false); }

    const cv = canvasRef.current;
    if (!cv) return;
    const url = drawCard(cv, summary, unit);
    setPngUrl(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [open, summary, unit]);

  if (!open || !summary) return null;

  const share = async () => {
    if (!pngUrl) return;
    try {
      const blob = await fetch(pngUrl).then((r) => r.blob());
      const file = new File([blob], `kun-workouts-${new Date(summary.date).toISOString().slice(0,10)}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: summary.title, text: `${summary.title} — Kun Workouts` });
        return;
      }
    } catch (e) { /* fall through to download */ }
    download();
  };

  const download = () => {
    if (!pngUrl) return;
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `kun-workouts-${new Date(summary.date).toISOString().slice(0,10)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative flex-1 flex flex-col safe-top safe-bottom">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onClose} className="text-muted p-2 -ml-2 active:opacity-60" aria-label="Close">
            <X size={22} />
          </button>
          <div className="text-[13px] font-medium text-muted tracking-tight">Share workout</div>
          <div className="w-8" />
        </div>
        <div className="flex-1 overflow-auto px-4 pb-2 flex items-start justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-2xl shadow-2xl w-full max-w-[360px] h-auto bg-black"
            style={{ aspectRatio: '4 / 5' }}
          />
        </div>
        <div className="px-4 pb-4 pt-2 flex items-center gap-2">
          <button
            onClick={download}
            className="flex-1 h-12 rounded-xl border border-border bg-surface/80 text-text font-medium flex items-center justify-center gap-2 active:opacity-80"
          >
            <Download size={18} /> Save image
          </button>
          <button
            onClick={share}
            className="flex-1 h-12 rounded-xl bg-accent text-white font-semibold flex items-center justify-center gap-2 active:opacity-80"
          >
            <Share2 size={18} /> {canShareFile ? 'Share' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Canvas rendering ----------

function drawCard(canvas, s, unit) {
  const W = 1080;
  const H = 1350;
  const dpr = Math.min(3, window.devicePixelRatio || 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = `${W} / ${H}`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Background — deep near-black with an extremely subtle radial glow.
  ctx.fillStyle = '#0B0B0D';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W * 0.75, H * 0.15, 20, W * 0.75, H * 0.15, W * 0.9);
  grad.addColorStop(0, 'rgba(80, 90, 110, 0.18)');
  grad.addColorStop(1, 'rgba(11, 11, 13, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const M = 72; // margin
  const COL_R = W - M;
  const TEXT = '#F5F5F7';
  const MUTED = '#8E8E93';
  const FAINT = '#3A3A3E';
  const ACCENT = '#5EA0FF';

  // Top branding bar.
  ctx.fillStyle = MUTED;
  ctx.font = `500 24px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('KUN  WORKOUTS', M, M);
  ctx.textAlign = 'right';
  ctx.fillText(formatDate(s.date).toUpperCase(), COL_R, M);

  // Title
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT;
  const titleSize = fitTitle(ctx, s.title, W - M * 2);
  ctx.font = `700 ${titleSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif`;
  ctx.fillText(s.title, M, M + 210);

  // Sub-line
  ctx.font = `500 26px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`${s.exerciseCount} exercises · ${s.setCount} working sets`, M, M + 260);

  // Divider
  drawHairline(ctx, M, M + 300, COL_R, M + 300, FAINT);

  // Stats row: Duration | Volume | PRs
  const statsY = M + 340;
  const colW = (W - M * 2) / 3;
  const prCount = s.prs.length;
  drawStat(ctx, M + 0 * colW, statsY, colW, 'DURATION', formatDuration(s.durationMs), TEXT, MUTED);
  drawStat(ctx, M + 1 * colW, statsY, colW, 'VOLUME', formatWeight(s.totalVolumeKg, unit), TEXT, MUTED);
  drawStat(ctx, M + 2 * colW, statsY, colW, 'PRs', prCount ? String(prCount) : '—', prCount ? ACCENT : TEXT, MUTED);

  drawHairline(ctx, M, statsY + 120, COL_R, statsY + 120, FAINT);

  // Personal records
  let y = statsY + 170;
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillText('PERSONAL RECORDS', M, y);
  y += 44;
  if (prCount === 0) {
    ctx.fillStyle = FAINT;
    ctx.font = `500 26px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillText('No new PRs — solid session.', M, y);
    y += 44;
  } else {
    for (const pr of s.prs.slice(0, 4)) {
      ctx.fillStyle = TEXT;
      ctx.font = `600 30px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
      ctx.fillText(truncate(ctx, pr.exerciseName, W - M * 2 - 260), M, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = ACCENT;
      const label = prLabel(pr);
      ctx.fillText(label, COL_R, y);
      ctx.textAlign = 'left';
      y += 44;
    }
  }

  drawHairline(ctx, M, y + 12, COL_R, y + 12, FAINT);
  y += 62;

  // Exercises list (compact)
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillText('EXERCISES', M, y);
  y += 42;
  const maxRows = Math.min(8, s.exerciseRows.length);
  for (let i = 0; i < maxRows; i++) {
    const r = s.exerciseRows[i];
    ctx.fillStyle = TEXT;
    ctx.font = `500 28px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillText(truncate(ctx, r.name, W - M * 2 - 300), M, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = `500 26px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
    const top = r.topWeightKg > 0 ? `${formatWeight(r.topWeightKg, unit)} · ` : '';
    ctx.fillText(`${top}${r.sets} × ${summariseReps(r.reps)}`, COL_R, y);
    ctx.textAlign = 'left';
    y += 42;
  }
  if (s.exerciseRows.length > maxRows) {
    ctx.fillStyle = FAINT;
    ctx.font = `500 22px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillText(`+${s.exerciseRows.length - maxRows} more`, M, y + 4);
  }

  // Footer wordmark
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED;
  ctx.font = `600 24px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif`;
  ctx.fillText('Kun Workouts', W / 2, H - 66);
  ctx.fillStyle = FAINT;
  ctx.font = `500 20px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillText('Track every rep.', W / 2, H - 40);

  // Export
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function fitTitle(ctx, text, maxW) {
  let size = 112;
  while (size > 56) {
    ctx.font = `700 ${size}px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxW) return size;
    size -= 6;
  }
  return size;
}

function drawHairline(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1 + 0.5);
  ctx.lineTo(x2, y2 + 0.5);
  ctx.stroke();
}

function drawStat(ctx, x, y, w, label, value, valueColor, labelColor) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = labelColor;
  ctx.font = `600 20px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillText(label, x, y);
  ctx.fillStyle = valueColor;
  ctx.font = `700 48px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif`;
  ctx.fillText(value, x, y + 62);
}

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function summariseReps(reps) {
  if (!reps.length) return '—';
  const uniq = [...new Set(reps)];
  if (uniq.length === 1) return `${reps.length}×${uniq[0]}`;
  return reps.join(', ');
}

function prLabel(pr) {
  if (pr.kinds.e1rm) return `New 1RM PR`;
  if (pr.kinds.weight) return `New top weight`;
  if (pr.kinds.reps) return `Reps PR`;
  return `PR`;
}
