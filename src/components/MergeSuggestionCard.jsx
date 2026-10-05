import { useState } from 'react';
import { Combine } from 'lucide-react';
import { GlassCard, SecondaryButton } from '../ui/index.js';

// THE TIER-2 CARD ON TODAY.
//
// Tier 1 (normalized names identical) merges silently, because there is no
// judgement to make. This is the other case: close enough that it is probably
// the same lift, not close enough that the app gets to decide. So it asks, in
// one sentence, with two answers and no third "later" option — a dismissal that
// comes back tomorrow is not a dismissal.
//
// "Keep separate" is remembered for that PAIR forever. The point of the card is
// to be answered once and never seen again.
export default function MergeSuggestionCard({
  suggestions = [], onMerge, onKeepSeparate, className = ''
}) {
  const [busy, setBusy] = useState(null);
  if (!suggestions.length) return null;

  // One at a time. A stack of these on the home screen would be a chore list;
  // answering one reveals the next.
  const s = suggestions[0];
  const key = `${s.customId}|${s.libraryId}`;

  const run = async (fn) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };

  return (
    <GlassCard className={`p-base ${className}`}>
      <p className="flex items-center gap-xs text-micro font-semibold uppercase text-ink-tertiary">
        <Combine size={12} strokeWidth={2.4} />
        {suggestions.length > 1 ? `Exercise library · 1 of ${suggestions.length}` : 'Exercise library'}
      </p>
      <p className="text-body font-regular text-ink mt-md">
        We added <span className="font-semibold">{s.libraryName}</span>.
      </p>
      <p className="text-body font-regular text-ink-secondary mt-xs">
        Merge your custom “{s.customName}” into it?
      </p>
      <p className="text-label font-regular text-ink-tertiary mt-sm">
        Merging keeps every set you logged — they move under the library exercise
        so your history, PRs and charts are all one lift again.
      </p>
      <div className="mt-base flex flex-wrap gap-md">
        <SecondaryButton
          loading={busy === key}
          onClick={() => run(() => onMerge?.(s.customId, s.libraryId))}
        >
          Merge
        </SecondaryButton>
        <SecondaryButton
          disabled={busy === key}
          onClick={() => run(() => onKeepSeparate?.(s.customId, s.libraryId))}
        >
          Keep separate
        </SecondaryButton>
      </div>
    </GlassCard>
  );
}
