import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Download, X, Check } from 'lucide-react';
import { buildProgressSummary, strengthSeriesFor, TIMEFRAMES } from '../services/progressSummary.js';
import { formatWeight } from '../utils/units.js';
import {
  PALETTE, FONT_DISPLAY, FONT_TEXT,
  paintBackground, drawTopBar, drawHairline, truncate, fitFontSize, drawWordmark, drawSparkline, drawBar
} from '../utils/canvasDraw.js';

// Metric catalogue per style. Minimal deliberately excludes the distribution charts —
// those are "dashboard" content, not something you'd post as a hero stat.
const STYLE_METRICS = {
  minimal: [
    { id: 'prs', label: 'Personal records' },
    { id: 'workouts', label: 'Workouts' },
    { id: 'volume', label: 'Volume' },
    { id: 'streak', label: 'Streak' },
    { id: 'strength', label: 'Strength line' }
  ],
  detailed: [
    { id: 'prs', label: 'Personal records' },
    { id: 'strength', label: 'Strength progression' },
    { id: 'workouts', label: 'Workouts' },
    { id: 'volume', label: 'Volume' },
    { id: 'streak', label: 'Streak' },
    { id: 'muscle', label: 'Muscle distribution' },
    { id: 'repRange', label: 'Rep ranges' }
  ]
};

const DEFAULTS = {
  minimal: ['prs', 'workouts', 'volume'],
  detailed: ['prs', 'strength', 'workouts', 'volume', 'streak', 'muscle']
};

// Canvas heights — Detailed gets more room since it carries more content.
const CARD_H = { minimal: 1350, detailed: 1500 };
const CARD_M = 72;

// Minimal is a flat stack of hero tiles, so a simple weight budget keeps it from
// getting crowded — a real number a person would actually post, not five.
const MINIMAL_WEIGHT = { prs: 3, workouts: 1, volume: 1, streak: 1, strength: 1 };
const MINIMAL_BUDGET = 5;

// How many exercises each style's Personal Records / Strength section can hold before
// it starts feeling crowded — mirrors the metric-crowding cap-and-warn pattern above.
const EXERCISE_CAP = { minimal: 2, detailed: 3 };

// Orders a user's exercise picks by biggest improvement first (so the strongest story
// leads), then caps to the style's limit — same "intelligently reorganize" pattern as
// pickRendered(), applied to the exercise roster instead of the metric list.
function pickExercises(selectedIds, style, exerciseOptions) {
  const optionMap = new Map(exerciseOptions.map((e) => [e.exerciseId, e]));
  const ordered = selectedIds
    .map((id) => optionMap.get(id))
    .filter(Boolean)
    .sort((a, b) => (b.deltaKg - a.deltaKg) || (b.valueKg - a.valueKg));
  const cap = EXERCISE_CAP[style];
  return { rendered: ordered.slice(0, cap), trimmed: ordered.slice(cap) };
}

// "New" when there's no real baseline to compare to, "Steady" when selected but flat/negative
// in the period, otherwise the actual improvement — so a hand-picked exercise that isn't a
// fresh PR still reads sensibly instead of implying a record that didn't happen.
function exerciseDeltaLabel(ex, unit) {
  if (ex.isNew) return 'New';
  if (ex.improved) return `+${formatWeight(ex.deltaKg, unit)}`;
  return 'Steady';
}

function defaultsFor(style, available) {
  const base = DEFAULTS[style].filter((id) => available[id]);
  if (base.length) return base;
  return STYLE_METRICS[style].map((m) => m.id).filter((id) => available[id]).slice(0, style === 'minimal' ? 3 : 5);
}

// Detailed's sections have real, variable pixel heights (3 PR rows vs 1, 4 muscle rows vs
// 2, ...), so instead of a rough weight budget this walks the exact same vertical layout
// drawDetailed() uses and decides section-by-section what actually fits. Both the metric
// checklist and the canvas read from this single source of truth, so the UI's "not shown"
// warning always matches what the exported image actually contains.
function layoutDetailed(summary, selectedIds, exerciseCount, strengthSeriesLength) {
  const has = (id) => selectedIds.includes(id) && summary.available[id];
  const maxY = CARD_H.detailed - 150;
  let y = CARD_M + 130 + 46 + 96 + 48;
  const rendered = new Set();
  const trimmed = [];

  if (has('strength') && strengthSeriesLength >= 2) {
    if (y + 234 <= maxY) { rendered.add('strength'); y += 234; }
    else trimmed.push('strength');
  }

  const prCount = Math.min(3, exerciseCount);
  if (has('prs') && prCount > 0) {
    const need = 44 + prCount * 48 + 56;
    if (y + need <= maxY) { rendered.add('prs'); y += need; }
    else trimmed.push('prs');
  }

  const trainingIds = ['workouts', 'volume', 'streak'].filter(has);
  if (trainingIds.length) {
    if (y + 198 <= maxY) { trainingIds.forEach((id) => rendered.add(id)); y += 198; }
    else trainingIds.forEach((id) => trimmed.push(id));
  }

  const muscleRows = Math.min(4, summary.muscle.length);
  if (has('muscle') && muscleRows >= 2) {
    const need = 38 + muscleRows * 44;
    if (y + need <= maxY) { rendered.add('muscle'); y += need; }
    else trimmed.push('muscle');
  }

  const repRangeHasData = summary.repRange.some((r) => r.count > 0);
  if (has('repRange') && repRangeHasData) {
    const need = 38 + summary.repRange.length * 40 + (rendered.has('muscle') ? 44 : 0);
    if (y + need <= maxY) { rendered.add('repRange'); y += need; }
    else trimmed.push('repRange');
  }

  return { rendered: [...rendered], trimmed };
}

// Trims a user's metric selection so an overcrowded pick "intelligently reorganizes"
// instead of overflowing the card, preserving each style's priority order.
function pickRendered(selectedIds, style, summary, exerciseCount, strengthSeriesLength) {
  if (style === 'detailed') return layoutDetailed(summary, selectedIds, exerciseCount, strengthSeriesLength);

  const order = STYLE_METRICS.minimal.map((m) => m.id);
  let used = 0;
  const rendered = [];
  const trimmed = [];
  for (const id of order) {
    if (!selectedIds.includes(id) || !summary.available[id]) continue;
    if (id === 'strength' && strengthSeriesLength < 2) continue;
    if (id === 'prs' && exerciseCount === 0) continue;
    const w = MINIMAL_WEIGHT[id] || 1;
    if (used + w <= MINIMAL_BUDGET) { rendered.push(id); used += w; }
    else trimmed.push(id);
  }
  return { rendered, trimmed };
}

export default function ProgressShareCard({ open, workouts, exercises, unit, onClose }) {
  const canvasRef = useRef(null);
  const [pngUrl, setPngUrl] = useState(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const [timeframeId, setTimeframeId] = useState('6m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [style, setStyle] = useState('minimal');
  const [selectedMinimal, setSelectedMinimal] = useState(null);
  const [selectedDetailed, setSelectedDetailed] = useState(null);
  const [selectedExercises, setSelectedExercises] = useState(null);

  // Fresh defaults every time the sheet is opened.
  useEffect(() => {
    if (!open) return;
    setTimeframeId('6m');
    setCustomFrom('');
    setCustomTo('');
    setStyle('minimal');
    setSelectedMinimal(null);
    setSelectedDetailed(null);
    setSelectedExercises(null);
  }, [open]);

  const custom = useMemo(() => {
    if (!customFrom || !customTo) return null;
    const from = new Date(customFrom).getTime();
    const to = new Date(customTo).getTime() + 86399000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null;
    return { from, to };
  }, [customFrom, customTo]);

  const summary = useMemo(() => {
    if (!open) return null;
    if (timeframeId === 'custom' && !custom) return null;
    return buildProgressSummary(workouts, exercises, { timeframeId, custom });
  }, [open, workouts, exercises, timeframeId, custom]);

  // Exercise picker: which lifts show up in Personal Records / drive the Strength line.
  // Defaults to the top improvers this period (or, failing that, whatever was trained).
  const exerciseOptions = summary?.exerciseOptions || [];
  const defaultExerciseIds = summary
    ? (summary.prs.length ? summary.prs.map((p) => p.exerciseId) : exerciseOptions.slice(0, 3).map((p) => p.exerciseId))
    : [];
  const effectiveExerciseIds = selectedExercises || defaultExerciseIds;
  const { rendered: renderedExercises, trimmed: trimmedExercises } = summary
    ? pickExercises(effectiveExerciseIds, style, exerciseOptions)
    : { rendered: [], trimmed: [] };
  const renderedExercisesKey = renderedExercises.map((e) => e.exerciseId).join(',');
  const headlineExercise = renderedExercises[0] || null;

  const toggleExercise = (id) => {
    const next = new Set(effectiveExerciseIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedExercises([...next]);
  };

  const strengthSeries = useMemo(() => {
    if (!summary || !headlineExercise) return [];
    return strengthSeriesFor(workouts, headlineExercise.exerciseId, summary.start, summary.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, headlineExercise?.exerciseId, workouts]);

  const selectedIds = style === 'minimal' ? selectedMinimal : selectedDetailed;
  const effectiveSelected = summary ? (selectedIds || defaultsFor(style, summary.available)) : [];
  const { rendered, trimmed } = summary
    ? pickRendered(effectiveSelected, style, summary, renderedExercises.length, strengthSeries.length)
    : { rendered: [], trimmed: [] };
  const renderedKey = rendered.join(',');

  const toggleMetric = (id) => {
    const next = new Set(effectiveSelected);
    if (next.has(id)) next.delete(id); else next.add(id);
    const arr = [...next];
    if (style === 'minimal') setSelectedMinimal(arr); else setSelectedDetailed(arr);
  };

  useEffect(() => {
    if (!open || !summary) return;
    try {
      const f = new File([new Blob(['x'])], 't.png', { type: 'image/png' });
      setCanShareFile(!!(navigator.canShare && navigator.canShare({ files: [f] })));
    } catch { setCanShareFile(false); }

    const cv = canvasRef.current;
    if (!cv) return;
    const renderedSet = new Set(renderedKey ? renderedKey.split(',') : []);
    const url = drawProgressCard(cv, summary, style, renderedSet, renderedExercises, strengthSeries, unit);
    setPngUrl(url);
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, summary, style, renderedKey, renderedExercisesKey, strengthSeries, unit]);

  if (!open) return null;

  const fileBase = `kun-progress-${timeframeId}-${new Date().toISOString().slice(0, 10)}`;

  const share = async () => {
    if (!pngUrl) return;
    try {
      const blob = await fetch(pngUrl).then((r) => r.blob());
      const file = new File([blob], `${fileBase}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Progress — Kun Workouts', text: `My training progress — ${summary?.title}` });
        return;
      }
    } catch { /* fall through to download */ }
    download();
  };

  const download = () => {
    if (!pngUrl) return;
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `${fileBase}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative flex-1 flex flex-col safe-top safe-bottom min-h-0">
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <button onClick={onClose} className="text-muted p-2 -ml-2 active:opacity-60" aria-label="Close">
            <X size={22} />
          </button>
          <div className="text-[13px] font-medium text-muted tracking-tight">Share progress</div>
          <div className="w-8" />
        </div>

        <div className="flex-1 overflow-auto px-4 pb-2 no-scrollbar">
          <div className="flex justify-center mb-4">
            <canvas
              ref={canvasRef}
              className="rounded-2xl shadow-2xl w-full max-w-[280px] h-auto bg-black"
              style={{ aspectRatio: style === 'detailed' ? '1080 / 1500' : '4 / 5' }}
            />
          </div>

          {!summary && timeframeId === 'custom' && (
            <div className="text-center text-xs text-muted py-4">Pick a valid start and end date.</div>
          )}

          <div className="space-y-4">
            <ConfigSection label="Timeframe">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.id}
                    onClick={() => setTimeframeId(tf.id)}
                    className={`shrink-0 h-9 px-3 rounded-full text-xs font-medium border whitespace-nowrap ${
                      timeframeId === tf.id ? 'bg-accent border-accent text-white' : 'border-border text-muted'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
              {timeframeId === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="text-xs text-muted">
                    From
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="mt-1 w-full h-10 rounded-lg bg-card border border-border px-2 text-sm text-text"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    To
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="mt-1 w-full h-10 rounded-lg bg-card border border-border px-2 text-sm text-text"
                    />
                  </label>
                </div>
              )}
              {summary?.limitedHistory && (
                <div className="mt-2 text-[11px] text-muted">
                  Your history only goes back to {new Date(summary.firstWorkoutDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} — the card will reflect what's actually logged.
                </div>
              )}
            </ConfigSection>

            <ConfigSection label="Style">
              <div className="grid grid-cols-2 gap-2">
                <StyleOption
                  active={style === 'minimal'}
                  title="Minimal"
                  desc="A few big numbers"
                  onClick={() => setStyle('minimal')}
                />
                <StyleOption
                  active={style === 'detailed'}
                  title="Detailed"
                  desc="A compact report"
                  onClick={() => setStyle('detailed')}
                />
              </div>
            </ConfigSection>

            <ConfigSection label="Metrics">
              <div className="space-y-1.5">
                {STYLE_METRICS[style].map((m) => {
                  const isAvailable = summary ? summary.available[m.id] : false;
                  const isChecked = effectiveSelected.includes(m.id);
                  const isTrimmed = trimmed.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      disabled={!isAvailable}
                      onClick={() => toggleMetric(m.id)}
                      className={`w-full flex items-center justify-between gap-2 h-11 px-3 rounded-xl border text-left ${
                        !isAvailable ? 'border-border/50 opacity-40' : isChecked ? 'border-accent/60 bg-accent/10' : 'border-border'
                      }`}
                    >
                      <span className="text-sm">
                        {m.label}
                        {!isAvailable && <span className="text-[10px] text-muted ml-1.5">no data yet</span>}
                        {isAvailable && isTrimmed && <span className="text-[10px] text-warn ml-1.5">not shown — card is full</span>}
                      </span>
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        isChecked ? 'bg-accent border-accent' : 'border-border'
                      }`}>
                        {isChecked && <Check size={13} className="text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {trimmed.length > 0 && (
                <div className="mt-2 text-[11px] text-warn">
                  {style === 'minimal'
                    ? 'That’s a lot for Minimal — switch to Detailed to fit everything.'
                    : 'A couple of metrics were left off so the card stays readable.'}
                </div>
              )}
            </ConfigSection>

            {exerciseOptions.length > 0 && (
              <ConfigSection label="Exercises">
                <div className="space-y-1.5">
                  {exerciseOptions.map((ex) => {
                    const isChecked = effectiveExerciseIds.includes(ex.exerciseId);
                    const isTrimmed = trimmedExercises.some((t) => t.exerciseId === ex.exerciseId);
                    return (
                      <button
                        key={ex.exerciseId}
                        onClick={() => toggleExercise(ex.exerciseId)}
                        className={`w-full flex items-center justify-between gap-2 h-11 px-3 rounded-xl border text-left ${
                          isChecked ? 'border-accent/60 bg-accent/10' : 'border-border'
                        }`}
                      >
                        <span className="text-sm min-w-0 truncate">
                          {ex.exerciseName}
                          {isChecked && isTrimmed && <span className="text-[10px] text-warn ml-1.5">not shown — card is full</span>}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-muted tabular-nums">
                            {formatWeight(ex.valueKg, unit)} · {exerciseDeltaLabel(ex, unit)}
                          </span>
                          <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            isChecked ? 'bg-accent border-accent' : 'border-border'
                          }`}>
                            {isChecked && <Check size={13} className="text-white" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {trimmedExercises.length > 0 && (
                  <div className="mt-2 text-[11px] text-warn">
                    {style === 'minimal'
                      ? `Minimal fits ${EXERCISE_CAP.minimal} exercises — switch to Detailed for more.`
                      : `Detailed fits ${EXERCISE_CAP.detailed} exercises — the rest were left off.`}
                  </div>
                )}
              </ConfigSection>
            )}
          </div>
        </div>

        <div className="px-4 pb-4 pt-2 flex items-center gap-2 shrink-0">
          <button
            onClick={download}
            disabled={!pngUrl}
            className="flex-1 h-12 rounded-xl border border-border bg-surface/80 text-text font-medium flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
          >
            <Download size={18} /> Save image
          </button>
          <button
            onClick={share}
            disabled={!pngUrl}
            className="flex-1 h-12 rounded-xl bg-accent text-white font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
          >
            <Share2 size={18} /> {canShareFile ? 'Share' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigSection({ label, children }) {
  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-wide text-muted mb-2 font-semibold">{label}</h3>
      {children}
    </section>
  );
}

function StyleOption({ active, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-3 ${active ? 'border-accent bg-accent/10' : 'border-border'}`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[11px] text-muted mt-0.5">{desc}</div>
    </button>
  );
}

// ---------- Canvas rendering ----------

function drawProgressCard(canvas, summary, style, renderedSet, renderedExercises, strengthSeries, unit) {
  const W = 1080;
  const H = CARD_H[style];
  const dpr = Math.min(3, window.devicePixelRatio || 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = `${W} / ${H}`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  if (style === 'minimal') drawMinimal(ctx, W, H, CARD_M, summary, renderedSet, renderedExercises, strengthSeries, unit);
  else drawDetailed(ctx, W, H, CARD_M, summary, renderedSet, renderedExercises, strengthSeries, unit);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

// Thousands-separated weight for big totals (e.g. "57,999.5 kg") — formatWeight() alone
// doesn't group digits, which reads poorly at hero card sizes.
function formatBigWeight(kg, unit) {
  const str = formatWeight(kg, unit);
  const [num, ...rest] = str.split(' ');
  const [intPart, decPart] = num.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return [grouped + (decPart ? `.${decPart}` : ''), ...rest].join(' ');
}

function volumeTile(summary, unit) {
  const { volumeKg, volumePct } = summary.training;
  if (volumeKg <= 0) return null;
  if (volumePct != null) {
    const sign = volumePct > 0 ? '+' : '';
    return { value: `${sign}${volumePct}%`, label: 'VOLUME' };
  }
  return { value: formatBigWeight(volumeKg, unit), label: 'VOLUME' };
}

function buildTiles(summary, renderedSet, renderedExercises, unit) {
  const tiles = [];
  if (renderedSet.has('prs')) {
    for (const pr of renderedExercises) {
      tiles.push({ value: formatWeight(pr.valueKg, unit), label: `${pr.exerciseName.toUpperCase()} PR` });
    }
  }
  if (renderedSet.has('workouts') && summary.training.workoutCount > 0) {
    tiles.push({ value: String(summary.training.workoutCount), label: 'WORKOUTS' });
  }
  if (renderedSet.has('volume')) {
    const v = volumeTile(summary, unit);
    if (v) tiles.push(v);
  }
  if (renderedSet.has('streak') && summary.streakWeeks > 0) {
    tiles.push({ value: String(summary.streakWeeks), label: summary.streakWeeks === 1 ? 'WEEK STREAK' : 'WEEK STREAK' });
  }
  return tiles;
}

function drawMinimal(ctx, W, H, M, summary, renderedSet, renderedExercises, strengthSeries, unit) {
  paintBackground(ctx, W, H);
  drawTopBar(ctx, W, M, 'KUN  WORKOUTS', summary.label);

  let y = M + 150;
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 24px ${FONT_TEXT}`;
  ctx.fillText('PROGRESS', M, y);
  y += 56;

  ctx.fillStyle = PALETTE.text;
  const title = summary.title;
  const titleSize = fitFontSize(ctx, title, W - M * 2, { max: 100, min: 56 });
  ctx.font = `700 ${titleSize}px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, M, y + titleSize * 0.78);
  y += titleSize + 66;

  drawHairline(ctx, M, y, W - M, y);
  y += 58;

  const tiles = buildTiles(summary, renderedSet, renderedExercises, unit).slice(0, 4);

  if (tiles.length === 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 30px ${FONT_TEXT}`;
    ctx.fillText('Log a few more workouts to build your progress card.', M, y + 40);
    y += 90;
  }

  for (const tile of tiles) {
    ctx.fillStyle = PALETTE.text;
    const vSize = fitFontSize(ctx, tile.value, W - M * 2, { max: 100, min: 56 });
    ctx.font = `700 ${vSize}px ${FONT_DISPLAY}`;
    ctx.fillText(tile.value, M, y + vSize * 0.78);
    y += vSize + 16;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 24px ${FONT_TEXT}`;
    ctx.fillText(tile.label, M, y + 22);
    y += 70;
  }

  if (renderedSet.has('strength') && strengthSeries.length >= 2) {
    y += 24;
    const vals = strengthSeries.map((p) => p.e1rmKg);
    drawSparkline(ctx, M, y, W - M * 2, 90, vals);
    y += 90;
  }

  drawWordmark(ctx, W, H);
}

function drawDetailed(ctx, W, H, M, summary, renderedSet, renderedExercises, strengthSeries, unit) {
  paintBackground(ctx, W, H);
  drawTopBar(ctx, W, M, 'KUN  WORKOUTS', summary.label);

  // Leaves room for the footer wordmark — a section only draws if it fits above this line,
  // so an overcrowded pick quietly drops the lowest-priority section instead of clipping.
  const maxY = H - 150;
  let y = M + 130;
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 22px ${FONT_TEXT}`;
  ctx.fillText('PROGRESS', M, y);
  y += 46;

  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 60px ${FONT_DISPLAY}`;
  ctx.fillText(summary.title, M, y + 46);
  y += 96;

  drawHairline(ctx, M, y, W - M, y);
  y += 48;

  if (renderedSet.has('strength') && strengthSeries.length >= 2 && y + 234 <= maxY) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText('STRENGTH PROGRESSION', M, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 24px ${FONT_TEXT}`;
    ctx.fillText(truncate(ctx, renderedExercises[0]?.exerciseName || '', 420), W - M, y);
    ctx.textAlign = 'left';
    y += 30;
    const vals = strengthSeries.map((p) => p.e1rmKg);
    drawSparkline(ctx, M, y, W - M * 2, 130, vals);
    y += 160;
    drawHairline(ctx, M, y, W - M, y);
    y += 44;
  }

  const prCount = Math.min(3, renderedExercises.length);
  if (renderedSet.has('prs') && prCount > 0 && y + 44 + prCount * 48 + 56 <= maxY) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText('PERSONAL RECORDS', M, y);
    y += 44;
    for (const pr of renderedExercises.slice(0, 3)) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `600 30px ${FONT_DISPLAY}`;
      ctx.fillText(truncate(ctx, pr.exerciseName, W - M * 2 - 280), M, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `600 28px ${FONT_DISPLAY}`;
      ctx.fillText(`${formatWeight(pr.valueKg, unit)}  ${exerciseDeltaLabel(pr, unit)}`, W - M, y);
      ctx.textAlign = 'left';
      y += 48;
    }
    y += 12;
    drawHairline(ctx, M, y, W - M, y);
    y += 44;
  }

  const trainingTiles = [];
  if (renderedSet.has('workouts') && summary.training.workoutCount > 0) {
    trainingTiles.push({ value: String(summary.training.workoutCount), label: 'WORKOUTS' });
  }
  if (renderedSet.has('volume')) {
    const v = volumeTile(summary, unit);
    if (v) trainingTiles.push(v);
  }
  if (renderedSet.has('streak') && summary.streakWeeks > 0) {
    trainingTiles.push({ value: String(summary.streakWeeks), label: 'WEEK STREAK' });
  }
  if (trainingTiles.length && y + 198 <= maxY) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText('TRAINING', M, y);
    y += 36;
    const colW = (W - M * 2) / trainingTiles.length;
    trainingTiles.forEach((t, i) => {
      const x = M + i * colW;
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 46px ${FONT_DISPLAY}`;
      ctx.fillText(t.value, x, y + 50);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `500 20px ${FONT_TEXT}`;
      ctx.fillText(t.label, x, y + 78);
    });
    y += 118;
    drawHairline(ctx, M, y, W - M, y);
    y += 44;
  }

  const muscleRowCount = Math.min(4, summary.muscle.length);
  if (renderedSet.has('muscle') && muscleRowCount >= 2 && y + 38 + muscleRowCount * 44 <= maxY) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText('MUSCLE FOCUS', M, y);
    y += 38;
    const rows = summary.muscle.slice(0, 4);
    const barX = M + 170;
    const barW = W - M - barX - 70;
    for (const row of rows) {
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `500 24px ${FONT_TEXT}`;
      ctx.fillText(truncate(ctx, row.label, 150), M, y + 18);
      drawBar(ctx, barX, y + 2, barW, 16, row.pct);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `500 22px ${FONT_TEXT}`;
      ctx.fillText(`${row.pct}%`, W - M, y + 18);
      ctx.textAlign = 'left';
      y += 44;
    }
    y += 4;
  }

  const repRangeHasData = summary.repRange.some((r) => r.count > 0);
  const repRangeNeeded = 38 + summary.repRange.length * 40 + (renderedSet.has('muscle') ? 44 : 0);
  if (renderedSet.has('repRange') && repRangeHasData && y + repRangeNeeded <= maxY) {
    if (renderedSet.has('muscle')) { drawHairline(ctx, M, y, W - M, y); y += 44; }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText('REP RANGES', M, y);
    y += 38;
    const barX = M + 100;
    const barW = W - M - barX - 70;
    for (const row of summary.repRange) {
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `500 22px ${FONT_TEXT}`;
      ctx.fillText(row.label, M, y + 17);
      drawBar(ctx, barX, y + 1, barW, 15, row.pct);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `500 20px ${FONT_TEXT}`;
      ctx.fillText(`${row.pct}%`, W - M, y + 17);
      ctx.textAlign = 'left';
      y += 40;
    }
  }

  drawWordmark(ctx, W, H);
}
