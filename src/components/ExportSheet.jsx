import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Minus, Plus } from 'lucide-react';
import { BottomSheet, PrimaryButton, SecondaryButton, SegmentedTrack, TextLink } from '../ui/index.js';
import { useToast } from './Toast.jsx';
import {
  buildExport, exportFilename, copyText, downloadTextFile
} from '../services/workoutExport.js';
import { formatDate } from '../utils/date.js';
import { formatVolume } from '../utils/units.js';
import { workingVolume, isWorking } from '../services/calculations.js';

// EXPORTING WHAT YOU PICK, IN TWO TAPS.
//
// The existing JSON backup in Settings answers "how do I not lose my data".
// This answers a different question — "how do I get my last three sessions into
// a message" — and so it is built the opposite way: readable instead of
// restorable, a selection instead of everything, and reachable from History,
// where the workouts you are thinking about already are.
//
// The two selection methods are deliberately ONE control, not two modes. The
// stepper sets the selection to the most recent N; ticking a row edits that
// selection. Nobody has to decide up front which way they are choosing.
const PRESETS = [1, 3, 5, 10, 20];

export default function ExportSheet({ open, onClose, items, exMap, filtered = false }) {
  const toast = useToast();
  const [format, setFormat] = useState('text');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  // The preview is only revealed on demand. It is the escape hatch for a browser
  // that refuses both clipboard paths, and a way to see exactly what you are
  // about to send — but shown by default it would push the controls off screen.
  const [showPreview, setShowPreview] = useState(false);
  const previewRef = useRef(null);

  // Opening the sheet starts from a sensible default rather than nothing
  // selected: the most recent session, which is what somebody tapping Export
  // immediately after training wants.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(items.slice(0, 1).map(({ w }) => w.id)));
    setShowPreview(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo(
    () => items.filter(({ w }) => selected.has(w.id)).map(({ w }) => w),
    [items, selected]
  );

  const text = useMemo(
    () => (chosen.length ? buildExport(chosen, exMap, format) : ''),
    [chosen, exMap, format]
  );

  // "Last N" is a fact about the current selection, not a separate piece of
  // state: it holds when the selected ids are exactly the newest N rows. So the
  // stepper reads correctly after you untick something in the middle, without
  // the app having to remember which control you last touched.
  const lastN = useMemo(() => {
    if (!selected.size) return 0;
    const prefix = items.slice(0, selected.size).every(({ w }) => selected.has(w.id));
    return prefix ? selected.size : null;
  }, [items, selected]);

  const setLast = (n) => {
    const clamped = Math.max(0, Math.min(items.length, n));
    setSelected(new Set(items.slice(0, clamped).map(({ w }) => w.id)));
  };

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const onCopy = async () => {
    setBusy(true);
    const ok = await copyText(text);
    setBusy(false);
    if (ok) {
      toast(`${chosen.length} ${chosen.length === 1 ? 'workout' : 'workouts'} copied`, { tone: 'success' });
      return;
    }
    // Never claim a copy that did not happen. Show the text instead and select
    // it, so the long-press-to-copy gesture is one tap away.
    setShowPreview(true);
    toast('Could not reach the clipboard — copy it from below', { tone: 'error', duration: 3200 });
    requestAnimationFrame(() => previewRef.current?.select());
  };

  const onDownload = () => {
    downloadTextFile(text, exportFilename(chosen, format), format === 'csv' ? 'text/csv' : 'text/plain');
    toast('File saved');
  };

  const countLabel = chosen.length === 1 ? '1 workout' : `${chosen.length} workouts`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Export workouts"
      description={filtered
        ? 'Picking from your filtered list. Copy them, or save a file.'
        : 'Copy them as text, or save a file.'}
      footer={
        <div className="flex items-center gap-sm">
          <SecondaryButton
            icon={Copy}
            className="flex-1"
            disabled={!chosen.length || busy}
            onClick={onCopy}
          >
            Copy
          </SecondaryButton>
          <PrimaryButton
            icon={Download}
            className="flex-1"
            disabled={!chosen.length}
            onClick={onDownload}
          >
            Download
          </PrimaryButton>
        </div>
      }
    >
      <SegmentedTrack
        value={format}
        onChange={setFormat}
        ariaLabel="Export format"
        options={[
          { value: 'text', label: 'Text' },
          { value: 'csv', label: 'Spreadsheet (CSV)' }
        ]}
      />

      {/* The stepper. Its number is the count, which is also what the buttons
          below export — one number on the screen, not two that can disagree. */}
      <div className="mt-md flex items-center justify-between gap-md">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Last workouts</p>
          <p className="text-label font-regular text-ink-tertiary mt-xxs">
            {lastN === null ? `${countLabel} · hand-picked` : `${countLabel} of ${items.length}`}
          </p>
        </div>
        <div className="flex items-center gap-xs shrink-0">
          <StepButton
            icon={Minus}
            label="One fewer workout"
            disabled={!selected.size}
            onClick={() => setLast((lastN ?? selected.size) - 1)}
          />
          <span className="w-9 text-center text-body font-semibold text-ink tabular">
            {selected.size}
          </span>
          <StepButton
            icon={Plus}
            label="One more workout"
            disabled={selected.size >= items.length}
            onClick={() => setLast((lastN ?? selected.size) + 1)}
          />
        </div>
      </div>

      <div className="mt-sm flex gap-xs overflow-x-auto no-scrollbar -mx-lg px-lg">
        {PRESETS.filter((n) => n <= items.length).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLast(n)}
            aria-pressed={lastN === n}
            className={[
              'shrink-0 h-9 px-md rounded-full border text-label font-semibold',
              'transition-colors duration-fast ease-out',
              lastN === n
                ? 'bg-primary text-on-primary border-transparent'
                : 'bg-glass-inset text-ink-secondary border-glass-inset-border active:bg-glass-pressed'
            ].join(' ')}
          >
            Last {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLast(items.length)}
          aria-pressed={lastN === items.length && items.length > 0}
          className={[
            'shrink-0 h-9 px-md rounded-full border text-label font-semibold',
            'transition-colors duration-fast ease-out',
            lastN === items.length && items.length
              ? 'bg-primary text-on-primary border-transparent'
              : 'bg-glass-inset text-ink-secondary border-glass-inset-border active:bg-glass-pressed'
          ].join(' ')}
        >
          All {items.length}
        </button>
      </div>

      {/* The tick list. Its own scroll area, so the stepper and the presets stay
          on screen while you work down a long history. */}
      <ul className="mt-md max-h-[38vh] overflow-y-auto scroll-y border-t border-hairline">
        {items.map(({ w, title }) => {
          const on = selected.has(w.id);
          return (
            <li key={w.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(w.id)}
                className="w-full min-h-tap py-sm flex items-center gap-md text-left
                           transition-colors duration-fast ease-out active:bg-glass-pressed rounded-row px-xs"
              >
                <span
                  aria-hidden="true"
                  className={[
                    'w-6 h-6 shrink-0 rounded-full border flex items-center justify-center',
                    on ? 'bg-done-soft border-done-border text-done' : 'bg-glass-inset border-glass-inset-border'
                  ].join(' ')}
                >
                  {on && <Check size={15} strokeWidth={2.6} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-regular text-ink truncate">{title}</span>
                  <span className="block text-label font-regular text-ink-tertiary mt-xxs truncate tabular">
                    {formatDate(w.date)} · {w.sets.filter(isWorking).length} sets · {formatVolume(workingVolume(w.sets))}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-md flex items-center justify-between gap-md">
        <TextLink onClick={() => setShowPreview((v) => !v)} disabled={!chosen.length}>
          {showPreview ? 'Hide preview' : 'Preview'}
        </TextLink>
        <span className="text-label font-regular text-ink-tertiary tabular">
          {text ? `${text.split('\n').length} lines` : '—'}
        </span>
      </div>

      {showPreview && (
        <textarea
          ref={previewRef}
          readOnly
          value={text}
          aria-label="Export preview"
          onFocus={(e) => e.target.select()}
          className="mt-sm w-full h-56 p-md rounded-row bg-glass-inset border border-glass-inset-border
                     text-label font-regular text-ink-secondary outline-none whitespace-pre
                     overflow-auto scroll-y"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />
      )}
    </BottomSheet>
  );
}

function StepButton({ icon: Icon, label, disabled, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-10 h-10 rounded-full bg-glass-inset border border-glass-inset-border
                 flex items-center justify-center text-ink
                 transition-colors duration-fast ease-out active:bg-glass-pressed
                 disabled:opacity-40"
    >
      <Icon size={17} strokeWidth={2.4} />
    </button>
  );
}
