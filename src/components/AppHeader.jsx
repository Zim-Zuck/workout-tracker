import { User } from 'lucide-react';

// Slim header shown on every screen: wordmark left, account affordance right.
//
// Kept to 44px so it costs as little vertical space as possible on a phone —
// the workout screen is the one that matters and it should not feel squeezed.
export default function AppHeader({ signedIn, profile, onAccountTap, cloudConfigured }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-border">
      <div className="max-w-lg mx-auto h-11 px-3 flex items-center justify-between">
        <span className="text-[11px] tracking-[0.2em] font-semibold text-muted">KUN WORKOUTS</span>

        {cloudConfigured && (
          signedIn ? (
            <button
              onClick={onAccountTap}
              aria-label="Your profile"
              className="active:opacity-70"
            >
              <Avatar profile={profile} />
            </button>
          ) : (
            <button
              onClick={onAccountTap}
              className="h-8 px-3 rounded-full border border-border text-xs font-medium text-muted active:bg-card"
            >
              Sign in
            </button>
          )
        )}
      </div>
    </header>
  );
}

// Avatar image when the user has one, otherwise their initial on the accent
// colour — never a broken image, and readable at 28px.
export function Avatar({ profile, size = 28 }) {
  const initial = (profile?.display_name || profile?.username || '?').trim().charAt(0).toUpperCase();
  const style = { width: size, height: size };

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        style={style}
        className="rounded-full object-cover border border-border bg-card"
      />
    );
  }

  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.42) }}
      className="rounded-full bg-accent text-white font-semibold flex items-center justify-center select-none"
      aria-hidden="true"
    >
      {initial === '?' ? <User size={Math.round(size * 0.55)} /> : initial}
    </span>
  );
}
