// A 100%-WIDE BAR, SPLIT INTO SEGMENTS.
//
// Used where the question is "how did the mix split up", not "how big was
// each thing" — PairedBars (components/Chart.jsx) already owns the second
// question. The outer rounded clip does all the corner-rounding; segments
// butt against each other with no gap, so the row reads as one bar with a
// shape rather than several short bars lined up.
//
// `onSegmentClick`, optional: turns every segment into a real tap target for
// "tap to see the exact numbers" (the rep-range card uses this). Without it
// the bar is one picture, named by `ariaLabel`; with it, each segment names
// itself instead, the same trade BodyMap/BodyPair make for the same reason —
// a flat role="img" cannot contain focusable children.
export default function StackedBar({
  segments, height = 10, ariaLabel, selectedKey, onSegmentClick, className = ''
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  const interactive = Boolean(onSegmentClick);

  return (
    <div
      role={interactive ? undefined : 'img'}
      aria-label={interactive ? undefined : ariaLabel}
      className={`flex w-full overflow-hidden rounded-full bg-glass-inset ${className}`}
      style={{ height }}
    >
      {segments.map((s, i) => {
        const pct = (Math.max(0, s.value) / total) * 100;
        if (pct <= 0) return null;
        const key = s.key ?? s.label ?? i;
        const isSelected = selectedKey != null && key === selectedKey;
        const dimmed = selectedKey != null && !isSelected;
        const style = {
          width: `${pct}%`,
          background: s.color,
          flexShrink: 0,
          opacity: dimmed ? 0.5 : 1,
          transition: 'opacity var(--motion-fast) var(--motion-ease)'
        };

        if (!interactive) {
          return <span key={key} aria-hidden="true" style={style} />;
        }
        return (
          <button
            key={key}
            type="button"
            aria-label={s.srLabel || s.label}
            aria-pressed={isSelected}
            onClick={() => onSegmentClick(s, i)}
            style={{ ...style, height: '100%', border: 'none', padding: 0, cursor: 'pointer' }}
          />
        );
      })}
    </div>
  );
}
