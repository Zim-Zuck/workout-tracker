import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Download, X } from 'lucide-react';
import { CARD_META, DRAWERS } from '../utils/recapCanvas.js';
import { canShareFiles, downloadImage, shareImage, recapShareText } from '../utils/shareImage.js';

// Full-screen viewer for the three weekly recap cards.
//
// A horizontal snap-scroller rather than a carousel library: it is three
// elements, the browser already does momentum, snapping and accessibility for
// free, and it costs no dependency. Swiping between chapters is the whole
// interaction, and it should feel like the phone's own scrolling.
export default function RecapCards({ open, recap, onClose }) {
  const scrollerRef = useRef(null);
  const canvasRefs = useRef([]);
  const [index, setIndex] = useState(0);
  const [pngs, setPngs] = useState([null, null, null]);
  const [canShareFile, setCanShareFile] = useState(false);

  useEffect(() => {
    if (!open || !recap) return;
    setCanShareFile(canShareFiles());

    // Painted on open rather than on mount, so an unopened recap costs nothing.
    const urls = CARD_META.map((meta, i) => {
      const cv = canvasRefs.current[i];
      if (!cv) return null;
      try {
        return DRAWERS[meta.id](cv, recap);
      } catch (err) {
        // One card failing to paint must not take the other two down. The
        // viewer shows the blank canvas and simply cannot export that one.
        console.warn(`Recap card "${meta.id}" failed to render:`, err);
        return null;
      }
    });
    setPngs(urls);
    setIndex(0);
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  }, [open, recap]);

  const filename = useMemo(
    () => `kun-this-week-${recap?.weekKey || 'recap'}-${index + 1}.png`,
    [recap, index]
  );

  if (!open || !recap) return null;

  const current = pngs[index];

  const download = () => downloadImage(current, filename);

  const share = () =>
    shareImage(current, filename, {
      title: 'This Week — Kun Workouts',
      text: recapShareText(CARD_META[index].label, recap.rangeLabel)
    });

  const onScroll = (e) => {
    const el = e.currentTarget;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index && next >= 0 && next < CARD_META.length) setIndex(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Weekly recap">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative flex-1 flex flex-col safe-top safe-bottom min-h-0">
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <button onClick={onClose} className="text-ink-tertiary p-2 -ml-2 active:opacity-60" aria-label="Close">
            <X size={22} />
          </button>
          <div className="text-label font-semibold text-ink-tertiary tracking-tight">
            {CARD_META[index].label} · {recap.rangeLabel}
          </div>
          <div className="w-8" />
        </div>

        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory scroll-y no-scrollbar"
        >
          {CARD_META.map((meta, i) => (
            <div key={meta.id} className="w-full shrink-0 snap-center px-4 flex items-center justify-center">
              {/* Sized by HEIGHT, not width: on a tall phone the card should
                  fill the space between the header and the buttons, and on a
                  short one it should shrink rather than be cropped. */}
              <canvas
                ref={(el) => { canvasRefs.current[i] = el; }}
                aria-label={`${meta.label} card`}
                className="rounded-card shadow-2xl bg-black"
                style={{ aspectRatio: '1080 / 1350', height: '100%', width: 'auto', maxWidth: '100%', maxHeight: '100%' }}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-1.5 py-3 shrink-0" aria-hidden="true">
          {CARD_META.map((meta, i) => (
            <span
              key={meta.id}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-1.5 bg-data'}`}
            />
          ))}
        </div>

        {/* Without Web Share for files there is only one thing this button can
            do, so only one button is offered. Two controls that both download
            the same PNG is a choice the user does not have. */}
        <div className="px-4 pb-4 flex items-center gap-2 shrink-0">
          {canShareFile && (
            <button
              onClick={download}
              disabled={!current}
              className="flex-1 h-tap rounded-row border border-glass-border bg-glass/80 text-ink font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
            >
              <Download size={18} /> Save
            </button>
          )}
          <button
            onClick={canShareFile ? share : download}
            disabled={!current}
            className="flex-1 h-tap rounded-row bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
          >
            {canShareFile ? <><Share2 size={18} /> Share</> : <><Download size={18} /> Save image</>}
          </button>
        </div>
      </div>
    </div>
  );
}
