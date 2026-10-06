// SETS PER MUSCLE, as bars.
//
// The finish plate's second half: the figure says which muscles, this says how
// much. Bars are relative to the hardest-hit group in this session, not to a
// weekly target — "6 sets" against an invented ideal of 12 would be inventing a
// prescription this app does not make.
//
// ONLY DIRECT SETS GET A BAR. A muscle that was along for the ride — triceps on
// a bench press, traps on a row — is lit on the figure and listed here, but its
// row says "assisted" rather than claiming a set count it did not earn. See the
// note in services/anatomy.js for why the two are counted apart.
//
// Neutral data ink, never an accent. A bar is content, not a status: `done`
// green here would claim a bar is a completed thing when it is a quantity.
export default function MuscleBars({ groups = [], className }) {
  const rows = groups.filter((g) => g.sets > 0 || g.assisted > 0);
  if (rows.length === 0) return null;

  return (
    <ul className={className}>
      {rows.map(({ group, sets, assisted, fraction }) => (
        <li key={group} className="grid items-center gap-md" style={{ gridTemplateColumns: '84px 1fr 60px' }}>
          <span className="text-label font-regular text-ink truncate">{group}</span>
          <span className="block h-1.5 rounded-full bg-hairline overflow-hidden">
            <span
              className={`block h-1.5 rounded-full ${sets > 0 ? 'bg-ink' : 'bg-data'}`}
              style={{
                // An assisted-only muscle gets a stub, not a zero-width bar that
                // reads as a rendering failure.
                width: sets > 0 ? `${Math.max(4, Math.round(fraction * 100))}%` : '8%',
                transition: `width var(--motion-slow) var(--motion-ease)`
              }}
            />
          </span>
          <span className="text-label font-regular text-ink-secondary tabular text-right">
            {sets > 0 ? `${sets} ${sets === 1 ? 'set' : 'sets'}` : 'assisted'}
          </span>
        </li>
      ))}
    </ul>
  );
}
