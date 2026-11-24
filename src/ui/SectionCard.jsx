import { useState } from 'react';
import { Info } from 'lucide-react';
import GlassCard from './GlassCard.jsx';
import { IconButton } from './Button.jsx';

// ONE CARD, ONE IDEA. The Evolution redesign's answer to the old bare
// <section> with a micro-caps header: a title you can actually read, a
// one-line plain-English subtitle, and the same glass surface the top summary
// card already uses — so a reader never has to recalibrate what a "section"
// looks like as they scroll.
export default function SectionCard({ title, subtitle, info, legend, children, className = '' }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <section className={`mt-xxl ${className}`}>
      <GlassCard className="p-lg">
        <div className="flex items-start justify-between gap-sm">
          <div className="min-w-0">
            <h2 className="text-heading font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-xs text-label font-regular text-ink-secondary">{subtitle}</p>}
          </div>
          {info && (
            <IconButton
              icon={Info}
              size={15}
              label={showInfo ? 'Hide the explanation' : 'What does this mean?'}
              aria-pressed={showInfo}
              onClick={() => setShowInfo((v) => !v)}
              className="-mt-xs -mr-xs shrink-0"
            />
          )}
        </div>
        {info && showInfo && (
          <p className="mt-sm text-label font-regular text-ink-secondary anim-rise">{info}</p>
        )}
        {legend && <div className="mt-base">{legend}</div>}
        <div className="mt-lg">{children}</div>
      </GlassCard>
    </section>
  );
}

// BEFORE / NOW, STATED ONCE. Colour alone never carries the distinction on
// this screen (muted neutral vs the warm accent) — this is the words that go
// with it, shown once at the top of a section rather than repeated on every
// row inside it.
export function CompareLegend({ labelBefore, labelNow, className = '' }) {
  return (
    <div className={`flex items-center gap-base text-label font-regular text-ink-secondary ${className}`}>
      <span className="inline-flex items-center gap-xs">
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-data-strong" style={{ opacity: 0.45 }} />
        {labelBefore}
      </span>
      <span className="inline-flex items-center gap-xs">
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-pr" />
        {labelNow}
      </span>
    </div>
  );
}
