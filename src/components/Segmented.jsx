// Full-width segmented control, used for primary navigation within a tab.
//
// Lived in Social.jsx until the community panels needed it too, which would have
// made a component import from a page that imports it back. Same implementation,
// no behaviour change — Social.jsx still re-exports it so nothing else had to
// move.
export default function Segmented({ value, onChange, options }) {
  // Three segments share the width evenly. A fourth does not fit at text-sm on
  // a phone, so past three the control switches to intrinsic widths and scrolls
  // if it has to — a clipped "Challeng…" is worse than a short swipe.
  const dense = options.length > 3;
  return (
    <div
      className={`flex rounded-xl bg-card border border-border p-1 gap-1 ${
        dense ? 'overflow-x-auto no-scrollbar' : 'overflow-hidden'
      }`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`h-9 rounded-lg font-medium transition-colors whitespace-nowrap ${
            dense ? 'shrink-0 px-2.5 text-[13px]' : 'flex-1 text-sm'
          } ${value === o.value ? 'bg-accent text-white' : 'text-muted active:bg-surface'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
