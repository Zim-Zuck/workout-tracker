import Avatar from '../ui/Avatar.jsx';

// Slim header shown on every screen: wordmark left, account affordance right.
//
// Kept to 44px so it costs as little vertical space as possible on a phone —
// the workout screen is the one that matters and it should not feel squeezed.
//
// TRANSPARENT, AND NOT BLURRED. It used to be an opaque bar with its own
// backdrop-filter, which cut a hard horizontal edge across the ambient gradient
// and spent a compositing layer on a row of text. It now sits ON the gradient,
// which is also what keeps it from ever being clipped by the hero card beneath.
//
// WHY THERE IS PADDING AND NO NEGATIVE MARGIN NOW.
//
// The header sat flush against the safe-area inset with no breathing room of
// its own, so on a notched phone the wordmark and the Sign in button were
// jammed into the status-bar shadow. Worse, both controls carried a negative
// right margin (-mr-md / -mr-sm) to "tighten" them, which pulled them OUTSIDE
// the 16px page gutter — so the one row at the top of every screen was the one
// row whose right edge did not line up with the cards underneath it.
//
// Now: 8px above the row (so the safe-area inset is never the only thing
// between the status bar and the content), the same px-base gutter as every
// card, and no negative margins at all.
export default function AppHeader({ signedIn, profile, onAccountTap, cloudConfigured }) {
  return (
    <header className="relative z-30 pt-sm">
      <div className="max-w-app mx-auto h-header px-base flex items-center justify-between">
        <span className="text-micro font-semibold uppercase text-ink-secondary">KUN WORKOUTS</span>

        {cloudConfigured && (
          signedIn ? (
            // 44pt target, 32px avatar, right-aligned: the glyph sits on the
            // page gutter while the tap area extends inward, instead of the
            // whole target hanging off the edge of the screen.
            <button
              onClick={onAccountTap}
              aria-label="Your profile"
              className="w-tap h-tap flex items-center justify-end rounded-full
                         transition-opacity duration-fast ease-out active:opacity-70"
            >
              <Avatar profile={profile} size={32} />
            </button>
          ) : (
            // A SMALLER PILL. 28px tall instead of 44, because this is the
            // quietest affordance on the screen and it was reading as a primary
            // action. The 44pt tap target is kept with an invisible inset
            // overlay rather than by making the pill itself that tall — the
            // target stays honest, the pill stops shouting.
            <button
              onClick={onAccountTap}
              className="relative h-8 px-base rounded-full bg-glass border border-glass-border
                         text-label font-semibold text-ink-secondary
                         transition-colors duration-fast ease-out active:bg-glass-pressed
                         after:absolute after:content-[''] after:inset-x-0
                         after:-top-md after:-bottom-md"
            >
              Sign in
            </button>
          )
        )}
      </div>
    </header>
  );
}

// Avatar moved to the shared component library. Re-exported so the many
// existing `import { Avatar } from './AppHeader.jsx'` lines keep working.
export { default as Avatar } from '../ui/Avatar.jsx';
