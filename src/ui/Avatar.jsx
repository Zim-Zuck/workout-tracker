import { User } from 'lucide-react';

// A person, at any size, never a broken image.
//
// The fallback is an initial on glass rather than on an accent colour: an avatar
// is identity, not status, and this palette spends its colours on status.
export default function Avatar({ profile, size = 32, className = '', loading = false }) {
  const name = (profile?.display_name || profile?.username || '').trim();
  const initial = name.charAt(0).toUpperCase();
  const style = { width: size, height: size };

  if (loading) return <span className="skeleton rounded-full block" style={style} />;

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        loading="lazy"
        style={style}
        className={`rounded-full object-cover border border-glass-border bg-glass-inset ${className}`}
      />
    );
  }

  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className={`rounded-full bg-glass border border-glass-border text-ink font-semibold
                  flex items-center justify-center select-none shrink-0 ${className}`}
      aria-hidden="true"
    >
      {initial || <User size={Math.round(size * 0.5)} strokeWidth={2} />}
    </span>
  );
}
