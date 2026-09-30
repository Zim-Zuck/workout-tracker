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
export default function AppHeader({ signedIn, profile, onAccountTap, cloudConfigured }) {
  return (
    <header className="relative z-30">
      <div className="max-w-app mx-auto h-header px-base flex items-center justify-between">
        <span className="text-micro font-semibold uppercase text-ink-secondary">KUN WORKOUTS</span>

        {cloudConfigured && (
          signedIn ? (
            <button
              onClick={onAccountTap}
              aria-label="Your profile"
              className="w-tap h-tap -mr-md flex items-center justify-end rounded-full
                         transition-opacity duration-fast ease-out active:opacity-70"
            >
              <Avatar profile={profile} size={32} />
            </button>
          ) : (
            <button
              onClick={onAccountTap}
              className="h-9 px-base -mr-sm rounded-full bg-glass border border-glass-border
                         text-label font-semibold text-ink-secondary
                         transition-colors duration-fast ease-out active:bg-glass-pressed"
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
